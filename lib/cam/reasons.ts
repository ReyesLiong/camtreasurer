// One-line reasons. Templates first so the loop never waits on the model; Gemini only writes the
// incident narrative, and even that falls back to a template after a short timeout.
import { pointName, intervalLabel } from "./points";

export function usd(n: number): string {
  return n.toFixed(2);
}

export function hoursText(h: number): string {
  if (h >= 48) return "over 2 days";
  if (h >= 1.5) return `${Math.round(h)}h`;
  if (h >= 0.95) return "1h";
  return `${Math.max(1, Math.round(h * 60))} min`;
}

export interface UrgencyParts {
  staleness: number;
  target: number;
  priority: number;
  orders: number;
  infoGain: number;
  pBad: number;
  dawn: boolean;
  total: number;
}

export function reasonBuy(pointId: string, u: UrgencyParts, price: number, incident: boolean, blackoutLifted: boolean): string {
  const name = pointName(pointId);
  const bits: string[] = [];
  if (incident && u.infoGain > 0.05) bits.push(`a strip here cuts source uncertainty by ${u.infoGain.toFixed(2)} bits (${Math.round(u.pBad * 100)}% chance it reads high)`);
  bits.push(`last reading ${hoursText(u.staleness)} old (target ${hoursText(u.target)})`);
  if (u.dawn) bits.push("rowers out at 06:30");
  if (u.orders > 0) bits.push(`open order worth ${usd(u.orders)}`);
  if (u.priority !== 1) bits.push(`priority ${u.priority.toFixed(1)}`);
  if (blackoutLifted) bits.push("blackout lifted for the incident");
  return `${name}: ${bits.join(", ")}. Buying at ${usd(price)}.`;
}

export function reasonReprice(pointId: string, from: number, to: number, why: string): string {
  return `${pointName(pointId)}: repriced ${usd(from)} to ${usd(to)}, ${why}.`;
}

export function reasonDecline(pointId: string, u: UrgencyParts, threshold: number, closing: boolean): string {
  const name = pointName(pointId);
  const demand = u.total < threshold / 2 ? "demand low" : "demand modest";
  const tail = closing ? "Closing the open bounty." : "Not buying.";
  return `${name}: reading ${hoursText(u.staleness)} old, ${demand} (urgency ${u.total.toFixed(2)} below ${threshold.toFixed(2)}). ${tail}`;
}

export function reasonBlackout(pointId: string, start: number, end: number): string {
  return `${pointName(pointId)}: no bounties after dark (${String(start).padStart(2, "0")}:00 to ${String(end).padStart(2, "0")}:00). Not buying.`;
}

export function reasonBudget(pointId: string, price: number, spent: number, budget: number): string {
  return `${pointName(pointId)}: daily budget ${usd(budget)} nearly spent (${usd(spent)} used), ${usd(price)} would exceed it. Not buying.`;
}

export function reasonPointCap(pointId: string, cap: number, spent: number): string {
  return `${pointName(pointId)}: point cap ${usd(cap)} a day reached (${usd(spent)} spent here). Not buying.`;
}

export function reasonHalted(pointId: string, who: string): string {
  return `${pointName(pointId)}: spending halted by ${who}. Holding.`;
}

export function reasonEscalate(targetPointId: string, price: number, cap: number, interval: number, mass: number, trigger: string): string {
  return `Lab bottle at ${pointName(targetPointId)}, ${usd(price)} USDC: above the ${usd(cap)} cap, waiting for a human. ${trigger} put ${Math.round(mass * 100)}% of source probability in ${intervalLabel(interval)}.`;
}

export function reasonPay(pointId: string, price: number, bond: number, result: string, nitrate: string, ammonia: string, confidence: number, hash: string, simulated: boolean): string {
  const lead = simulated ? "Paid (simulated)" : "Paid";
  return `${lead} ${usd(price)} plus ${usd(bond)} bond to sampler for ${pointName(pointId)}: strip verified (confidence ${confidence.toFixed(2)}), nitrate ${nitrate}, ammonia ${ammonia}, ${result}. Evidence ${hash}.`;
}

export function reasonRefuse(pointId: string, why: string, bond: number): string {
  return `Refused claim at ${pointName(pointId)}: ${why}. Bond ${usd(bond)} forfeited.`;
}

export function reasonIncidentTemplate(pointId: string, description: string): string {
  return `Incident at ${pointName(pointId)}: ${description}. Switching to source search: alert priorities on, posterior reset, bounties priced by information gain.`;
}

export function reasonPosterior(pointId: string, result: string, interval: number, mass: number): string {
  const move = result === "bad" ? "source is upstream of here" : "reach below is unlikely to be discharging";
  return `${pointName(pointId)} read ${result}: ${move}. Most likely reach now ${intervalLabel(interval)} (${Math.round(mass * 100)}%).`;
}

const NARRATIVE_TIMEOUT_MS = 6000;

/**
 * Gemini writes the two-sentence incident narrative for the dashboard. Any failure or delay falls
 * back to the template so the incident route never blocks on the model.
 */
export async function narrateIncident(pointId: string, description: string, topInterval: number, mass: number, prices: { point: string; price: number }[]): Promise<{ text: string; source: "gemini" | "template" }> {
  const fallback = reasonIncidentTemplate(pointId, description);
  try {
    const { askGemini } = await import("@/lib/ai/gemini");
    const prompt =
      `You are the treasurer of the River Cam's monitoring fund. An incident was just reported: "${description}" at ${pointName(pointId)}. ` +
      `The most likely source reach is ${intervalLabel(topInterval)} (${Math.round(mass * 100)}%). ` +
      `Bounties now posted: ${prices.map((p) => `${pointName(p.point)} ${usd(p.price)}`).join(", ")}. ` +
      `Write two short plain-English sentences for the public decision log explaining what you are doing and why. No hyphens as dashes, no emojis, no bullet points.`;
    const text = await Promise.race([
      askGemini(prompt, { temperature: 0.4 }),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("narrative timeout")), NARRATIVE_TIMEOUT_MS)),
    ]);
    const clean = text.trim().replace(/\s+/g, " ");
    if (!clean) return { text: fallback, source: "template" };
    return { text: clean, source: "gemini" };
  } catch {
    return { text: fallback, source: "template" };
  }
}
