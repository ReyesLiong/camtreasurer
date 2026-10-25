import { NextResponse } from "next/server";
import { compileMandate } from "@/lib/cam/compile";
import { ensureSimulation } from "@/lib/cam/simulate";
import { recordDecision } from "@/lib/cam/state";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = ensureSimulation();
  return NextResponse.json({ mandate: state.mandate, proposedMandate: state.proposedMandate });
}

/** POST {text} compiles a proposal with Gemini. POST {apply: true} applies the pending proposal (the human approval). */
export async function POST(request: Request) {
  const state = ensureSimulation();
  let body: { text?: string; apply?: boolean; who?: string } = {};
  try {
    body = await request.json();
  } catch {}
  const now = Date.now();
  if (body.apply) {
    const p = state.proposedMandate;
    if (!p) return NextResponse.json({ error: "No proposal to apply." }, { status: 404 });
    const who = body.who?.trim() || "funders";
    state.mandate = { text: p.text, params: p.params, appliedAt: now, appliedBy: who };
    state.proposedMandate = null;
    const summary = p.diff.length ? p.diff.map((d) => `${d.key} ${d.from} to ${d.to}`).join("; ") : "text only, no parameter change";
    recordDecision(state, { time: now, pointId: null, action: "mandate", priceUsd: null, reason: `Mandate change approved by ${who}: ${summary}.` });
    return NextResponse.json({ ok: true, mandate: state.mandate });
  }
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: "text is required." }, { status: 400 });
  try {
    const { params, diff } = await compileMandate(text, state.mandate.params);
    state.proposedMandate = { text, params, diff, createdAt: now };
    recordDecision(state, { time: now, pointId: null, action: "mandate", priceUsd: null, reason: `Mandate change proposed: "${text.slice(0, 120)}${text.length > 120 ? "..." : ""}". Compiled ${diff.length} parameter change${diff.length === 1 ? "" : "s"}, waiting for funder approval.` });
    return NextResponse.json({ ok: true, proposedMandate: state.proposedMandate });
  } catch (err) {
    return NextResponse.json({ error: `Could not compile the mandate: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}` }, { status: 502 });
  }
}
