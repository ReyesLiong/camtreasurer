import { NextResponse } from "next/server";
import { runTick } from "@/lib/cam/decide";
import { spendingSnapshot } from "@/lib/cam/pay";
import { ensureSimulation } from "@/lib/cam/simulate";
import { counters, pooledBalanceUsd, spentTodayUsd } from "@/lib/cam/state";

export const dynamic = "force-dynamic";

const TICK_EVERY_MS = 3000;

/** Full state for the dashboard, or a slim view for the phone (?view=phone). Runs a lazy tick. */
export async function GET(request: Request) {
  const state = ensureSimulation();
  const now = Date.now();
  if (now - state.lastTickAt > TICK_EVERY_MS) runTick(state, now);
  const view = new URL(request.url).searchParams.get("view");
  const summary = {
    now,
    counters: counters(state, now),
    pooledBalanceUsd: pooledBalanceUsd(state),
    spentTodayUsd: spentTodayUsd(state, now),
    dailyBudgetUsd: state.mandate.params.dailyBudgetUsd,
    spending: spendingSnapshot(),
    simulation: state.simulation,
    halted: state.halted,
    incident: state.incident,
  };
  if (view === "phone") {
    return NextResponse.json({
      ...summary,
      bounties: state.bounties.filter((b) => b.status === "open" || b.status === "claimed" || b.status === "needs_approval"),
      claims: state.claims.slice(-10),
      pendingApprovals: state.pendingApprovals,
    });
  }
  return NextResponse.json({
    ...summary,
    mandate: state.mandate,
    proposedMandate: state.proposedMandate,
    funders: state.funders,
    orders: state.orders,
    bounties: state.bounties.filter((b) => b.status === "open" || b.status === "claimed" || b.status === "needs_approval"),
    pendingApprovals: state.pendingApprovals,
    posterior: state.posterior,
    decisions: state.decisions.slice(-400).reverse(),
    ledger: state.ledger.slice(-200).reverse(),
    samples: state.samples.slice(-50),
  });
}
