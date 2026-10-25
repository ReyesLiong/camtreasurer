import { NextResponse } from "next/server";
import { runTick } from "@/lib/cam/decide";
import { payWithHumanOverride, samplerWallet } from "@/lib/cam/pay";
import { pointName } from "@/lib/cam/points";
import { ensureSimulation } from "@/lib/cam/simulate";
import { recordDecision } from "@/lib/cam/state";

export const dynamic = "force-dynamic";

/** POST {bountyId?}: a human (shake) approves one payment above the cap. Defaults to the oldest pending approval. */
export async function POST(request: Request) {
  const state = ensureSimulation();
  let body: { bountyId?: string; who?: string } = {};
  try {
    body = await request.json();
  } catch {}
  const pending = body.bountyId ? state.pendingApprovals.find((p) => p.bountyId === body.bountyId) : state.pendingApprovals[0];
  if (!pending) return NextResponse.json({ error: "Nothing is waiting for approval." }, { status: 404 });
  const bounty = state.bounties.find((b) => b.id === pending.bountyId);
  if (!bounty) return NextResponse.json({ error: "Bounty vanished." }, { status: 500 });
  const claim = bounty.claimId ? state.claims.find((c) => c.id === bounty.claimId) : undefined;
  const now = Date.now();
  const who = body.who?.trim() || "a funder on the phone";
  const memo = claim ? `cam:${bounty.pointId}:${claim.id}:${claim.result ?? "approved"}` : `cam:${bounty.pointId}:lab:${bounty.id}`;
  try {
    const entry = await payWithHumanOverride(state, { to: await samplerWallet(), amountUsd: pending.priceUsd, memo, pointId: bounty.pointId, kind: bounty.kind === "lab" ? "lab" : "bounty", note: `approved by ${who}` });
    bounty.status = "paid";
    bounty.updatedAt = now;
    if (claim) {
      claim.status = "paid";
      claim.paidUsd = pending.priceUsd;
      claim.paySignature = entry.signature;
      claim.explorerUrl = entry.explorerUrl;
    }
    state.pendingApprovals = state.pendingApprovals.filter((p) => p.bountyId !== pending.bountyId);
    const what = bounty.kind === "lab" ? `lab bottle at ${pointName(bounty.pointId)}` : `payment for ${pointName(bounty.pointId)}`;
    const d = recordDecision(state, { time: now, pointId: bounty.pointId, action: "approve", priceUsd: pending.priceUsd, reason: `${who} approved the ${what}: ${pending.priceUsd.toFixed(2)} USDC paid above the per-payment cap under the human override.`, signature: entry.signature, explorerUrl: entry.explorerUrl });
    runTick(state, now + 1);
    return NextResponse.json({ status: "paid", amountUsd: pending.priceUsd, signature: entry.signature, explorerUrl: entry.explorerUrl, decision: d });
  } catch (err) {
    console.error("[cam] approval payment failed:", err);
    return NextResponse.json({ error: `Approved but payment failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
}
