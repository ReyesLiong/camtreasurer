import { NextResponse } from "next/server";
import { runTick } from "@/lib/cam/decide";
import { ensureSimulation } from "@/lib/cam/simulate";

export const dynamic = "force-dynamic";

/** Run one decision tick now and return what it recorded. */
export async function POST() {
  const state = ensureSimulation();
  const decisions = runTick(state, Date.now());
  return NextResponse.json({ decisions, lastTickAt: state.lastTickAt });
}
