import { NextResponse, type NextRequest } from "next/server";
import { paidRoute } from "@/lib/payments/server";
import { ensureSimulation } from "@/lib/cam/simulate";
import { nextId } from "@/lib/cam/state";
import { BOND_USD } from "@/lib/cam/pay";

export const dynamic = "force-dynamic";

// Claiming a bounty costs a refundable bond, paid over x402 to the river wallet (PAY_TO_ADDRESS).
// Same pattern as /api/premium: the facilitator settles only if this handler answers below 400.
async function handler(request: NextRequest) {
  const state = ensureSimulation();
  const bountyId = new URL(request.url).searchParams.get("bounty");
  const bounty = state.bounties.find((b) => b.id === bountyId);
  if (!bounty) return NextResponse.json({ error: "No such bounty." }, { status: 404 });
  if (bounty.kind !== "strip") return NextResponse.json({ error: "Lab bounties are approved by a human, not claimed." }, { status: 400 });
  if (bounty.status !== "open") return NextResponse.json({ error: `Bounty is ${bounty.status}.` }, { status: 409 });
  const now = Date.now();
  const code = `CAM-${Math.floor(1000 + Math.random() * 9000)}`;
  const claim = { id: nextId(state, "c"), bountyId: bounty.id, pointId: bounty.pointId, code, status: "pending" as const, bondUsd: BOND_USD, sampler: "sampler", createdAt: now };
  state.claims.push(claim);
  bounty.status = "claimed";
  bounty.claimId = claim.id;
  bounty.updatedAt = now;
  return NextResponse.json({ claimId: claim.id, code, bountyId: bounty.id, pointId: bounty.pointId, priceUsd: bounty.priceUsd, bondUsd: BOND_USD });
}

export const GET = paidRoute(handler, () => ({
  price: `$${process.env.PAID_API_PRICE_USD || "0.02"}`,
  description: "Claim a River Cam sampling bounty (refundable bond)",
}));
