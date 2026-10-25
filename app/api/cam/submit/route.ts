import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { applyReading, runTick } from "@/lib/cam/decide";
import { BOND_USD, CapExceededError, memoFor, payReal, recordBond, samplerWallet } from "@/lib/cam/pay";
import { pointName } from "@/lib/cam/points";
import { reasonPay, reasonRefuse } from "@/lib/cam/reasons";
import { ensureSimulation } from "@/lib/cam/simulate";
import { recordDecision, round2, type Sample } from "@/lib/cam/state";
import { stripDataUrlPrefix, verifyStrip } from "@/lib/cam/verify";

export const dynamic = "force-dynamic";

/** POST {claimId, imageBase64}: verify with Gemini, then pay, refuse, or hold for a human. */
export async function POST(request: Request) {
  const state = ensureSimulation();
  let body: { claimId?: string; imageBase64?: string; demoLabel?: string } = {};
  try {
    body = await request.json();
  } catch {}
  const claim = state.claims.find((c) => c.id === body.claimId);
  if (!claim) return NextResponse.json({ error: "No such claim." }, { status: 404 });
  if (claim.status !== "pending") return NextResponse.json({ error: `Claim is already ${claim.status}.`, status: claim.status }, { status: 409 });
  if (!body.imageBase64) return NextResponse.json({ error: "imageBase64 is required." }, { status: 400 });
  const bounty = state.bounties.find((b) => b.id === claim.bountyId);
  if (!bounty) return NextResponse.json({ error: "Bounty vanished." }, { status: 500 });

  const now = Date.now();
  const params = state.mandate.params;
  const { data } = stripDataUrlPrefix(body.imageBase64);
  const hash = createHash("sha256").update(data).digest("hex");

  let verdict;
  try {
    verdict = await verifyStrip(body.imageBase64, claim.code, body.demoLabel);
  } catch (err) {
    console.error("[cam] verification failed:", err);
    return NextResponse.json({ error: `Verification unavailable: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
  console.log(`[cam] verify ${claim.id} code expected ${claim.code} read ${verdict.codeRead ?? "none"} matches ${verdict.codeMatches}`);

  const simTag = verdict.simulated ? " (simulated verification)" : "";
  const refuseWhy = !verdict.isStrip
    ? `photo is not a test strip (confidence ${verdict.confidence.toFixed(2)})`
    : verdict.confidence < params.minConfidence
      ? `reading too uncertain (confidence ${verdict.confidence.toFixed(2)} below ${params.minConfidence})`
      : null;

  if (refuseWhy) {
    claim.status = "refused";
    claim.reason = refuseWhy;
    bounty.status = "refused";
    bounty.updatedAt = now;
    recordBond(state, { from: "sampler", amountUsd: claim.bondUsd, pointId: claim.pointId, time: now, forfeited: true, simulated: false });
    const d = recordDecision(state, { time: now, pointId: claim.pointId, action: "refuse", priceUsd: 0, reason: reasonRefuse(claim.pointId, refuseWhy + simTag, claim.bondUsd) });
    runTick(state, now + 1);
    return NextResponse.json({ status: "refused", reason: refuseWhy, verdict, decision: d });
  }

  const sample: Sample = { id: `s-${hash.slice(0, 8)}`, pointId: claim.pointId, time: now, result: verdict.result, nitrate: verdict.nitrate, ammonia: verdict.ammonia, confidence: verdict.confidence, evidenceHash: hash, claimId: claim.id };
  state.samples.push(sample);
  claim.result = verdict.result;
  const amount = round2(bounty.priceUsd + BOND_USD);
  const memo = memoFor(claim.pointId, hash, verdict.result);

  const paidSoFar = state.perSamplerPaid[claim.sampler] ?? 0;
  if (paidSoFar >= params.perSamplerDaily) {
    claim.status = "refused";
    claim.reason = `sampler already paid ${paidSoFar} times today (cap ${params.perSamplerDaily})`;
    bounty.status = "refused";
    const d = recordDecision(state, { time: now, pointId: claim.pointId, action: "refuse", priceUsd: 0, reason: `Reading at ${pointName(claim.pointId)} accepted but not paid: ${claim.reason}. Bond returned later by hand.` });
    return NextResponse.json({ status: "refused", reason: claim.reason, verdict, decision: d });
  }

  let entry;
  try {
    entry = await payReal(state, { to: await samplerWallet(), amountUsd: amount, memo, pointId: claim.pointId, kind: "bounty" });
  } catch (err) {
    if (err instanceof CapExceededError) {
      claim.status = "needs_approval";
      bounty.status = "needs_approval";
      bounty.updatedAt = now;
      state.pendingApprovals.push({ bountyId: bounty.id, pointId: bounty.pointId, priceUsd: amount, reason: err.message, createdAt: now });
      const d = recordDecision(state, { time: now, pointId: claim.pointId, action: "escalate", priceUsd: amount, reason: `Payment of ${amount.toFixed(2)} for ${pointName(claim.pointId)} held: ${err.message}. Waiting for a human.` });
      return NextResponse.json({ status: "needs_approval", reason: err.message, verdict, decision: d });
    }
    console.error("[cam] payment failed:", err);
    return NextResponse.json({ error: `Payment failed: ${err instanceof Error ? err.message : String(err)}`, verdict }, { status: 502 });
  }

  claim.status = "paid";
  claim.paidUsd = amount;
  claim.paySignature = entry.signature;
  claim.explorerUrl = entry.explorerUrl;
  bounty.status = "paid";
  bounty.updatedAt = now;
  state.perSamplerPaid[claim.sampler] = paidSoFar + 1;
  const d = recordDecision(state, { time: now, pointId: claim.pointId, action: "pay", priceUsd: amount, reason: reasonPay(claim.pointId, bounty.priceUsd, BOND_USD, verdict.result, verdict.nitrate, verdict.ammonia, verdict.confidence, hash.slice(0, 16), false) + simTag, signature: entry.signature, explorerUrl: entry.explorerUrl });
  const note = applyReading(state, claim.pointId, verdict.result, now + 1);
  const tick = runTick(state, now + 2, { repriceWhy: `${verdict.result} strip at ${pointName(claim.pointId)} moved the search` });
  const escalation = tick.find((x) => x.action === "escalate") ?? null;
  return NextResponse.json({ status: "paid", amountUsd: amount, signature: entry.signature, explorerUrl: entry.explorerUrl, verdict, decision: d, note, escalation, pendingApprovals: state.pendingApprovals });
}
