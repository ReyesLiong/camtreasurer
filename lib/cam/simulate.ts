// One synthetic day so the dashboard opens full: ticks every 10 minutes over the last 24 hours,
// synthetic samplers claim and submit, some are refused, one overflow alert runs the source search,
// a funder halts spending once, and a human declines a lab bottle. Everything synthetic is marked
// simulated. Then a handful of those payouts are made for real on devnet (SIM_REAL_PAYMENTS) so the
// ledger carries real signatures; those run in the background and never block the dashboard.
import { createHash, randomBytes } from "node:crypto";
import { POINTS, pointIndex, pointName } from "./points";
import { applyReading, haltSpending, resolveIncident, resumeSpending, runTick, startIncident } from "./decide";
import { BOND_USD, memoFor, payReal, paySimulated, recordBond, samplerWallet } from "./pay";
import { reasonPay, reasonRefuse } from "./reasons";
import { getState, initialState, recordDecision, replaceState, round2, type CamState, type ReadingResult, type Sample } from "./state";

export const SIM_TICK_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic pseudo random so the day looks the same on every restart. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SAMPLERS = ["sampler-7f3a", "sampler-c21e", "sampler-09bd", "sampler-e4a7", "sampler-5d10", "sampler-b86c", "sampler-33f9", "sampler-a0d2", "sampler-6e71", "sampler-f14b", "sampler-28c5", "sampler-d9e3"];
const REFUSALS = ["photo is not a test strip (confidence 0.97)", "one-time code not visible in frame", "strip out of focus, pads unreadable (confidence 0.41)", "code in frame does not match the claim"];

export function evidenceHash(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hourOf(t: number): number {
  return new Date(t).getHours() + new Date(t).getMinutes() / 60;
}

function atHourToday(now: number, hour: number, minute: number): number {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  let t = d.getTime();
  if (t > now) t -= DAY_MS;
  return t;
}

export interface SyntheticPayout {
  ledgerId: string;
  decisionId: string;
  pointId: string;
  amountUsd: number;
  memo: string;
}

/** Fills the state with a synthetic day ending at `now`. Returns the synthetic payouts, newest first. */
export function runSyntheticDay(state: CamState, now: number): SyntheticPayout[] {
  const rand = rng(20261025);
  const start = now - DAY_MS;
  const payouts: SyntheticPayout[] = [];
  const paidBySampler: Record<string, number> = {};

  // Readings from the previous evening so nothing starts infinitely stale.
  for (const p of POINTS) {
    state.samples.push({ id: `seed-${p.id}`, pointId: p.id, time: start - 90 * 60 * 1000 - Math.floor(rand() * 60) * 60 * 1000, result: "clean", nitrate: "low", ammonia: "low", confidence: 0.9, evidenceHash: evidenceHash(`seed-${p.id}`), synthetic: true });
  }

  const incidentAt = atHourToday(now, 10, 32);
  const haltAt = incidentAt + 50 * 60 * 1000;
  const resumeAt = haltAt + 25 * 60 * 1000;
  const incidentEnd = incidentAt + 2 * 60 * 60 * 1000;
  let labDeclined = false;
  let synthIncidentId: string | null = null;

  for (let t = start; t < now - 30_000; t += SIM_TICK_MS) {
    const hour = hourOf(t);

    if (!synthIncidentId && t >= incidentAt && t < incidentAt + SIM_TICK_MS) {
      const { incidentDecision } = startIncident(state, t, "grantchester-outfall", "Anglian Water overflow alert at Grantchester outfall after 14 mm of overnight rain");
      synthIncidentId = incidentDecision.id;
    }
    if (t >= haltAt && t < haltAt + SIM_TICK_MS) haltSpending(state, t, "CUBC treasurer", "committee call about the overflow alert, pausing new purchases for 25 minutes");
    if (t >= resumeAt && t < resumeAt + SIM_TICK_MS) resumeSpending(state, t, "CUBC treasurer");
    if (state.incident?.active && t >= incidentEnd) resolveIncident(state, t, "Anglian Water confirmed the overflow stopped at 11:20 and two downstream strips read clean");

    runTick(state, t);

    // A human declines the synthetic lab bottle 25 minutes after the escalation.
    if (!labDeclined) {
      const pending = state.pendingApprovals[0];
      if (pending && t - pending.createdAt >= 25 * 60 * 1000) {
        const b = state.bounties.find((x) => x.id === pending.bountyId);
        if (b) {
          b.status = "closed";
          b.updatedAt = t;
        }
        state.pendingApprovals = state.pendingApprovals.filter((x) => x.bountyId !== pending.bountyId);
        recordDecision(state, { time: t, pointId: pending.pointId, action: "decline", priceUsd: pending.priceUsd, reason: `Cambridge City Council declined the lab bottle at ${pointName(pending.pointId)}: Anglian Water confirmed the overflow stopped, Environment Agency sampler already on site. Strip refresh ordered instead.` });
        labDeclined = true;
      }
    }

    // Synthetic samplers.
    for (const b of state.bounties) {
      if (b.status !== "open" || b.kind !== "strip") continue;
      const incident = !!state.incident?.active;
      const idx = pointIndex(b.pointId);
      let pClaim = hour >= 7 && hour < 19 ? 0.14 : 0.03;
      if (incident && idx >= 4) pClaim = 0.4;
      if (rand() > pClaim) continue;

      const sampler = SAMPLERS[Math.floor(rand() * SAMPLERS.length)];
      if ((paidBySampler[sampler] ?? 0) >= state.mandate.params.perSamplerDaily) continue;
      const tSubmit = t + Math.floor(rand() * 6) * 60 * 1000 + 60_000;
      const hash = evidenceHash(randomBytes(16).toString("hex") + b.id);
      recordBond(state, { from: sampler, amountUsd: BOND_USD, pointId: b.pointId, time: tSubmit - 30_000, forfeited: false, simulated: true });

      if (rand() < 0.17) {
        b.status = "refused";
        b.updatedAt = tSubmit;
        const why = REFUSALS[Math.floor(rand() * REFUSALS.length)];
        recordBond(state, { from: sampler, amountUsd: BOND_USD, pointId: b.pointId, time: tSubmit, forfeited: true, simulated: true });
        recordDecision(state, { time: tSubmit, pointId: b.pointId, action: "refuse", priceUsd: 0, reason: reasonRefuse(b.pointId, why, BOND_USD), simulated: true });
        continue;
      }

      const result: ReadingResult = incident && (b.pointId === "byrons-pool" || b.pointId === "grantchester-outfall") ? "bad" : "clean";
      const sample: Sample = {
        id: `s-${hash.slice(0, 8)}`,
        pointId: b.pointId,
        time: tSubmit,
        result,
        nitrate: result === "bad" ? "high" : rand() < 0.15 ? "medium" : "low",
        ammonia: result === "bad" ? "high" : "low",
        confidence: round2(0.82 + rand() * 0.16),
        evidenceHash: hash,
        synthetic: true,
      };
      state.samples.push(sample);
      b.status = "paid";
      b.updatedAt = tSubmit;
      const amount = round2(b.priceUsd + BOND_USD);
      const memo = memoFor(b.pointId, hash, result);
      const entry = paySimulated(state, { to: sampler, amountUsd: amount, memo, pointId: b.pointId, kind: "bounty" }, tSubmit);
      paidBySampler[sampler] = (paidBySampler[sampler] ?? 0) + 1;
      const d = recordDecision(state, { time: tSubmit, pointId: b.pointId, action: "pay", priceUsd: amount, reason: reasonPay(b.pointId, b.priceUsd, BOND_USD, result, sample.nitrate, sample.ammonia, sample.confidence, hash.slice(0, 16), true), simulated: true });
      payouts.unshift({ ledgerId: entry.id, decisionId: d.id, pointId: b.pointId, amountUsd: amount, memo });
      applyReading(state, b.pointId, result, tSubmit);
    }
  }

  // Sort by time so the log reads in order even where submits landed after the next tick.
  state.decisions.sort((a, b) => a.time - b.time);
  state.ledger.sort((a, b) => a.time - b.time);
  state.lastTickAt = now;
  return payouts;
}

export interface RealPaymentRecord {
  signature: string;
  amountUsd: number;
  memo: string;
  pointId: string;
  time: number;
}

type Globals = typeof globalThis & { __camSimStarted?: boolean; __camRealPayments?: RealPaymentRecord[]; __camRealPaymentsPromise?: Promise<void> };

/** Reuses real signatures from earlier in this process (for Reset day) instead of paying again. */
function attachCachedRealPayments(state: CamState, payouts: SyntheticPayout[]): number {
  const g = globalThis as Globals;
  const cached = g.__camRealPayments ?? [];
  let n = 0;
  for (let i = 0; i < cached.length && i < payouts.length; i++) {
    const r = cached[i];
    const p = payouts[i];
    const entry = state.ledger.find((l) => l.id === p.ledgerId);
    const decision = state.decisions.find((d) => d.id === p.decisionId);
    if (!entry || !decision) continue;
    entry.signature = r.signature;
    entry.explorerUrl = `https://explorer.solana.com/tx/${r.signature}?cluster=devnet`;
    entry.simulated = false;
    entry.amountUsd = r.amountUsd;
    entry.memo = r.memo;
    entry.note = "startup payment, real devnet transfer";
    decision.signature = r.signature;
    decision.explorerUrl = entry.explorerUrl;
    decision.simulated = false;
    decision.reason = decision.reason.replace("Paid (simulated)", "Paid");
    n++;
  }
  return n;
}

async function runStartupPayments(state: CamState, payouts: SyntheticPayout[]): Promise<void> {
  const g = globalThis as Globals;
  const target = Math.max(0, Number(process.env.SIM_REAL_PAYMENTS ?? "6"));
  g.__camRealPayments ??= [];
  const already = attachCachedRealPayments(state, payouts);
  state.simulation.realPayments = already;
  if (already >= target) {
    state.simulation.status = "ready";
    state.simulation.detail = `${already} real devnet payments attached from this process`;
    return;
  }
  state.simulation.status = "running";
  let to: string;
  try {
    to = await samplerWallet();
  } catch (err) {
    state.simulation.status = "ready";
    state.simulation.detail = `startup payments skipped: ${err instanceof Error ? err.message : String(err)}`;
    console.error("[cam] startup payments skipped:", err);
    return;
  }
  for (let i = already; i < target && i < payouts.length; i++) {
    const p = payouts[i];
    state.simulation.detail = `making real devnet payment ${i + 1} of ${target}`;
    if (i > already) await new Promise((r) => setTimeout(r, 2000)); // the public devnet RPC rate limits bursts
    try {
      const entry = await payReal(state, { to, amountUsd: p.amountUsd, memo: p.memo, pointId: p.pointId, kind: "bounty", note: "startup payment, real devnet transfer" });
      // payReal appended a fresh entry; fold it into the synthetic one so the count stays honest.
      state.ledger = state.ledger.filter((l) => l.id !== entry.id);
      state.perPointSpentUsd[p.pointId] = round2((state.perPointSpentUsd[p.pointId] ?? 0) - p.amountUsd);
      g.__camRealPayments.push({ signature: entry.signature!, amountUsd: p.amountUsd, memo: p.memo, pointId: p.pointId, time: Date.now() });
      attachCachedRealPayments(state, payouts);
      state.simulation.realPayments = g.__camRealPayments.length;
    } catch (err) {
      state.simulation.realPaymentFailures += 1;
      console.error(`[cam] startup payment ${i + 1} failed:`, err);
      state.simulation.detail = `payment ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`;
      if (state.simulation.realPaymentFailures >= 2) break;
    }
  }
  state.simulation.status = "ready";
  if (state.simulation.realPaymentFailures === 0) state.simulation.detail = `${state.simulation.realPayments} real devnet payments in the ledger`;
}

/** Called lazily from GET /api/cam/state. The synthetic day is synchronous; real payments continue in the background. */
export function ensureSimulation(): CamState {
  const g = globalThis as Globals;
  const state = getState();
  if (g.__camSimStarted) return state;
  g.__camSimStarted = true;
  const payouts = runSyntheticDay(state, Date.now());
  state.simulation = { status: "running", detail: "synthetic day ready, starting real payments", realPayments: 0, realPaymentFailures: 0 };
  g.__camRealPaymentsPromise = runStartupPayments(state, payouts).catch((err) => {
    console.error("[cam] startup payments crashed:", err);
    state.simulation.status = "ready";
    state.simulation.detail = `startup payments crashed: ${err instanceof Error ? err.message : String(err)}`;
  });
  return state;
}

/** Reset day: fresh state, new synthetic day, real signatures from this process reattached. */
export function resetDay(): CamState {
  const g = globalThis as Globals;
  const state = replaceState(initialState());
  const payouts = runSyntheticDay(state, Date.now());
  state.simulation = { status: "running", detail: "reset: synthetic day ready", realPayments: 0, realPaymentFailures: 0 };
  g.__camSimStarted = true;
  g.__camRealPaymentsPromise = runStartupPayments(state, payouts).catch(() => undefined);
  return state;
}
