import { NextResponse } from "next/server";
import { createPaymentClient, createPayingFetch, readPaymentError, readPaymentReceipt } from "@/lib/payments/client";
import { loadSamplerSigner, recordBond } from "@/lib/cam/pay";
import { ensureSimulation } from "@/lib/cam/simulate";
import { recordDecision, explorerUrl } from "@/lib/cam/state";
import { pointName } from "@/lib/cam/points";

export const dynamic = "force-dynamic";

// The phone never holds keys. This proxy pays the x402 bond from SAMPLER_PRIVATE_KEY and calls the
// paid claim route on this same server. The URL is fixed to this origin so nobody can make the
// sampler wallet pay another site.
let payingFetch: Promise<typeof fetch> | null = null;
function getPayingFetch(): Promise<typeof fetch> {
  payingFetch ??= loadSamplerSigner()
    .then((signer) => createPayingFetch(createPaymentClient(signer)))
    .catch((err) => {
      payingFetch = null;
      throw err;
    });
  return payingFetch;
}

export async function POST(request: Request) {
  const state = ensureSimulation();
  let body: { bountyId?: string } = {};
  try {
    body = await request.json();
  } catch {}
  const bounty = state.bounties.find((b) => b.id === body.bountyId);
  if (!bounty) return NextResponse.json({ error: "No such bounty." }, { status: 404 });
  if (bounty.status !== "open") return NextResponse.json({ error: `Bounty is ${bounty.status}.` }, { status: 409 });
  const target = new URL(`/api/cam/claim?bounty=${encodeURIComponent(bounty.id)}`, new URL(request.url).origin).toString();
  try {
    const pay = await getPayingFetch();
    const res = await pay(target);
    const paymentError = readPaymentError(res);
    if (paymentError) return NextResponse.json({ error: `Bond payment failed: ${paymentError}` }, { status: 402 });
    const data = (await res.json()) as { claimId?: string; code?: string; error?: string; priceUsd?: number };
    if (!res.ok || !data.claimId) return NextResponse.json({ error: data.error ?? `Claim failed (${res.status}).` }, { status: res.status || 500 });
    const receipt = readPaymentReceipt(res);
    const signature = receipt?.transaction ?? undefined;
    const now = Date.now();
    const claim = state.claims.find((c) => c.id === data.claimId);
    if (claim && signature) claim.bondSignature = signature;
    recordBond(state, { from: "sampler", amountUsd: claim?.bondUsd ?? 0.02, pointId: bounty.pointId, time: now, forfeited: false, simulated: false, signature });
    recordDecision(state, { time: now, pointId: bounty.pointId, action: "note", priceUsd: bounty.priceUsd, reason: `Bounty at ${pointName(bounty.pointId)} claimed: 0.02 bond paid over x402 to the river wallet, one-time code ${data.code} issued.`, signature, explorerUrl: signature ? explorerUrl(signature) : undefined });
    return NextResponse.json({ ...data, bondSignature: signature ?? null, bondExplorerUrl: signature ? explorerUrl(signature) : null, settled: receipt?.success ?? null });
  } catch (err) {
    console.error("[cam] claim-proxy failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
