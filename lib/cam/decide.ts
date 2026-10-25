// The decision loop. Every tick, every point: buy, reprice, decline, hold, or escalate, each with a
// one-line reason. Code enforces the caps, budget and blackout; the model only judges evidence.
import { POINTS, pointIndex, pointName } from "./points";
import { inBlackout, priorityFor, targetFreshness } from "./mandate";
import { alertPrior, argmaxInterval, expectedInfoGain, priceFromUrgency, probBadAt, updatePosterior, INFO_GAIN_WEIGHT, ORDER_WEIGHT } from "./pricing";
import { lastSample, nextId, openBounty, recordDecision, spentTodayUsd, uniformPosterior, type Bounty, type CamState, type Decision, type DecisionAction, type ReadingResult } from "./state";
import { reasonBlackout, reasonBudget, reasonBuy, reasonDecline, reasonEscalate, reasonHalted, reasonIncidentTemplate, reasonPointCap, reasonPosterior, reasonReprice, type UrgencyParts } from "./reasons";

export const URGENCY_THRESHOLD = 1.0;
const REPRICE_FRACTION = 0.15;
const REPEAT_RECORD_MS = 60 * 60 * 1000;
const NO_READING_HOURS = 24;

export function urgencyFor(state: CamState, pointId: string, now: number): UrgencyParts {
  const params = state.mandate.params;
  const incident = !!state.incident?.active;
  const sample = lastSample(state, pointId, now);
  const staleness = sample ? (now - sample.time) / 3_600_000 : NO_READING_HOURS;
  const target = targetFreshness(params, pointId);
  const priority = priorityFor(params, pointId, incident);
  const hour = new Date(now).getHours();
  const dawn = params.rowingReach.includes(pointId) && hour >= 4 && hour < 7;
  const freshness = priority * Math.min(staleness / target, 2) * (dawn ? 1.5 : 1);
  const orders = state.orders.filter((o) => o.status === "open" && o.pointId === pointId && o.createdAt <= now && o.deadline > now).reduce((s, o) => s + o.priceUsd, 0);
  const k = pointIndex(pointId);
  // A point read in the last 15 minutes has nothing new to tell the search yet.
  const infoGain = incident && staleness >= 0.25 ? expectedInfoGain(state.posterior, k) : 0;
  const pBad = incident ? probBadAt(state.posterior, k) : 0;
  const total = freshness + orders * ORDER_WEIGHT + infoGain * INFO_GAIN_WEIGHT;
  return { staleness, target, priority, orders, infoGain, pBad, dawn, total };
}

function maybeRecord(state: CamState, now: number, pointId: string, action: DecisionAction, priceUsd: number | null, reason: string, force = false): Decision | null {
  const last = state.lastDecisionByPoint[pointId];
  const priceChanged = priceUsd != null && last?.priceUsd != null && Math.abs(priceUsd - last.priceUsd) / last.priceUsd >= REPRICE_FRACTION;
  const changed = !last || last.action !== action || priceChanged;
  const repeatDue = !last || now - last.time >= REPEAT_RECORD_MS;
  if (!force && !changed && !repeatDue) return null;
  return recordDecision(state, { time: now, pointId, action, priceUsd, reason });
}

function closeBounty(b: Bounty | undefined, now: number): boolean {
  if (b && b.status === "open") {
    b.status = "closed";
    b.updatedAt = now;
    return true;
  }
  return false;
}

interface TickContext {
  hour: number;
  incident: boolean;
  blackout: boolean;
  spent: number;
  force: boolean;
  repriceWhy?: string;
}

function decidePoint(state: CamState, pointId: string, now: number, ctx: TickContext): Decision | null {
  const params = state.mandate.params;
  const existing = openBounty(state, pointId);

  if (state.halted) {
    return maybeRecord(state, now, pointId, "hold", existing?.priceUsd ?? null, reasonHalted(pointId, state.haltReason ?? "a funder"));
  }

  const u = urgencyFor(state, pointId, now);

  if (ctx.blackout && !ctx.incident) {
    closeBounty(existing, now);
    return maybeRecord(state, now, pointId, "decline", null, reasonBlackout(pointId, params.blackoutStartHour, params.blackoutEndHour), ctx.force);
  }

  if (u.total < URGENCY_THRESHOLD) {
    const closing = closeBounty(existing, now);
    return maybeRecord(state, now, pointId, "decline", null, reasonDecline(pointId, u, URGENCY_THRESHOLD, closing), ctx.force || closing);
  }

  const price = priceFromUrgency(u.total, params.maxPaymentUsd);
  const remaining = params.dailyBudgetUsd - ctx.spent;
  if (price > remaining) {
    closeBounty(existing, now);
    return maybeRecord(state, now, pointId, "decline", price, reasonBudget(pointId, price, ctx.spent, params.dailyBudgetUsd), ctx.force);
  }
  const pointSpent = state.perPointSpentUsd[pointId] ?? 0;
  if (pointSpent + price > params.perPointDailyUsd) {
    closeBounty(existing, now);
    return maybeRecord(state, now, pointId, "decline", price, reasonPointCap(pointId, params.perPointDailyUsd, pointSpent), ctx.force);
  }

  if (existing) {
    if (existing.status === "claimed") return null;
    const change = Math.abs(price - existing.priceUsd) / existing.priceUsd;
    if (change >= REPRICE_FRACTION) {
      const from = existing.priceUsd;
      existing.priceUsd = price;
      existing.updatedAt = now;
      const why = ctx.repriceWhy ?? (price > from ? (ctx.incident ? "the search moved this way" : "the reading here is getting old") : ctx.incident ? "a strip elsewhere made this reach less informative" : "demand eased");
      existing.reason = reasonReprice(pointId, from, price, why);
      return recordDecision(state, { time: now, pointId, action: "reprice", priceUsd: price, reason: existing.reason });
    }
    return null;
  }

  const reason = reasonBuy(pointId, u, price, ctx.incident, ctx.blackout && ctx.incident);
  const bounty: Bounty = { id: nextId(state, "b"), pointId, kind: "strip", priceUsd: price, status: "open", reason, createdAt: now, updatedAt: now };
  state.bounties.push(bounty);
  return recordDecision(state, { time: now, pointId, action: "buy", priceUsd: price, reason });
}

function expireOrders(state: CamState, now: number): void {
  for (const o of state.orders) if (o.status === "open" && o.deadline <= now) o.status = "expired";
}

function maybeEscalate(state: CamState, now: number): Decision | null {
  const inc = state.incident;
  if (!inc?.active) return null;
  if (state.bounties.some((b) => b.kind === "lab" && b.createdAt >= inc.startedAt)) return null;
  const params = state.mandate.params;
  const since = inc.startedAt;
  const samples = state.samples.filter((s) => s.time >= since);
  const bad = samples.filter((s) => s.result === "bad");
  const clean = samples.filter((s) => s.result === "clean");
  const { index, mass } = argmaxInterval(state.posterior);
  const twoHighAboveClean = clean.some((c) => bad.filter((b) => pointIndex(b.pointId) > pointIndex(c.pointId)).length >= 2);
  const narrowed = bad.length >= 1 && mass >= 0.5;
  if (!twoHighAboveClean && !narrowed) return null;

  const target = POINTS[index + 1] ?? POINTS[index];
  const badNames = bad.map((b) => pointName(b.pointId)).join(" and ");
  const cleanNames = clean.map((c) => pointName(c.pointId)).join(" and ");
  const trigger = `Trigger: high strip${bad.length > 1 ? "s" : ""} at ${badNames}${clean.length ? ` with clean at ${cleanNames}` : ""}`;
  const reason = reasonEscalate(target.id, params.labBountyUsd, params.maxPaymentUsd, index, mass, trigger);
  const bounty: Bounty = { id: nextId(state, "lab"), pointId: target.id, kind: "lab", priceUsd: params.labBountyUsd, status: "needs_approval", reason, createdAt: now, updatedAt: now };
  state.bounties.push(bounty);
  state.pendingApprovals.push({ bountyId: bounty.id, pointId: target.id, priceUsd: params.labBountyUsd, reason, createdAt: now });
  state.escalationCount += 1;
  return recordDecision(state, { time: now, pointId: target.id, action: "escalate", priceUsd: params.labBountyUsd, reason });
}

export interface TickOptions {
  /** Record a decision for every point even if nothing changed. Used at incident start. */
  force?: boolean;
  repriceWhy?: string;
}

/** One pass over all points. Returns the decisions recorded this tick. */
export function runTick(state: CamState, now: number, opts: TickOptions = {}): Decision[] {
  state.lastTickAt = now;
  expireOrders(state, now);
  const params = state.mandate.params;
  const ctx: TickContext = {
    hour: new Date(now).getHours(),
    incident: !!state.incident?.active,
    blackout: inBlackout(params, new Date(now).getHours()),
    spent: spentTodayUsd(state, now),
    force: !!opts.force,
    repriceWhy: opts.repriceWhy,
  };
  const out: Decision[] = [];
  for (const p of POINTS) {
    const d = decidePoint(state, p.id, now, ctx);
    if (d) out.push(d);
  }
  const e = maybeEscalate(state, now);
  if (e) out.push(e);
  return out;
}

/** Apply a verified reading to the posterior and record why prices will move. */
export function applyReading(state: CamState, pointId: string, result: ReadingResult, now: number): Decision | null {
  if (!state.incident?.active) return null;
  state.posterior = updatePosterior(state.posterior, pointIndex(pointId), result);
  const { index, mass } = argmaxInterval(state.posterior);
  return recordDecision(state, { time: now, pointId, action: "note", priceUsd: null, reason: reasonPosterior(pointId, result, index, mass) });
}

export function startIncident(state: CamState, now: number, pointId: string, description: string): { incidentDecision: Decision; decisions: Decision[] } {
  const inc = { id: nextId(state, "inc"), startedAt: now, pointId, description, active: true };
  state.incident = inc;
  state.incidents.push(inc);
  state.posterior = alertPrior(state.mandate.params);
  const incidentDecision = recordDecision(state, { time: now, pointId, action: "incident", priceUsd: null, reason: reasonIncidentTemplate(pointId, description) });
  const decisions = runTick(state, now + 1, { force: true, repriceWhy: "incident mode prices by information gain" });
  return { incidentDecision, decisions };
}

export function resolveIncident(state: CamState, now: number, why: string): Decision | null {
  const inc = state.incident;
  if (!inc?.active) return null;
  inc.active = false;
  inc.resolvedAt = now;
  state.incident = null;
  state.posterior = uniformPosterior();
  return recordDecision(state, { time: now, pointId: inc.pointId, action: "note", priceUsd: null, reason: `Incident at ${pointName(inc.pointId)} closed: ${why}. Back to routine freshness pricing.` });
}

export function haltSpending(state: CamState, now: number, who: string, why: string): Decision {
  state.halted = true;
  state.haltReason = who;
  for (const b of state.bounties) if (b.status === "open") closeBounty(b, now);
  return recordDecision(state, { time: now, pointId: null, action: "halt", priceUsd: null, reason: `${who} halted spending: ${why}. Open bounties closed, claims in progress still honoured.` });
}

export function resumeSpending(state: CamState, now: number, who: string): Decision {
  state.halted = false;
  state.haltReason = null;
  return recordDecision(state, { time: now, pointId: null, action: "resume", priceUsd: null, reason: `${who} resumed spending. Routine pricing restarts next tick.` });
}
