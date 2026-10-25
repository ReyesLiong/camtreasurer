import { NextResponse } from "next/server";
import { ensureSimulation } from "@/lib/cam/simulate";
import { pooledBalanceUsd, round2 } from "@/lib/cam/state";

export const dynamic = "force-dynamic";

/** Every payment in and out, newest first, with explorer links where a real transaction exists. */
export async function GET() {
  const state = ensureSimulation();
  const entries = state.ledger.slice().reverse();
  const real = entries.filter((e) => e.signature);
  return NextResponse.json({
    pooledBalanceUsd: pooledBalanceUsd(state),
    totals: {
      entries: entries.length,
      real: real.length,
      simulated: entries.length - real.length,
      outUsd: round2(entries.filter((e) => e.direction === "out").reduce((s, e) => s + e.amountUsd, 0)),
      inUsd: round2(entries.filter((e) => e.direction === "in").reduce((s, e) => s + e.amountUsd, 0)),
    },
    funders: state.funders,
    simulation: state.simulation,
    entries,
  });
}
