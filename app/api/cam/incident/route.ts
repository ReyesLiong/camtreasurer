import { NextResponse } from "next/server";
import { resolveIncident, startIncident } from "@/lib/cam/decide";
import { POINT_BY_ID } from "@/lib/cam/points";
import { argmaxInterval } from "@/lib/cam/pricing";
import { narrateIncident } from "@/lib/cam/reasons";
import { ensureSimulation } from "@/lib/cam/simulate";

export const dynamic = "force-dynamic";

/** POST {pointId?, description?} starts an incident. POST {resolve: true} closes it. */
export async function POST(request: Request) {
  const state = ensureSimulation();
  let body: { pointId?: string; description?: string; resolve?: boolean } = {};
  try {
    body = await request.json();
  } catch {}
  const now = Date.now();
  if (body.resolve) {
    const d = resolveIncident(state, now, "closed from the dashboard");
    return NextResponse.json({ ok: true, decision: d });
  }
  if (state.incident?.active) return NextResponse.json({ ok: false, error: "An incident is already active." }, { status: 409 });
  const pointId = body.pointId && POINT_BY_ID[body.pointId] ? body.pointId : "jesus-lock";
  const description = body.description?.trim() || "Fish kill reported at Jesus Lock";
  const { incidentDecision, decisions } = startIncident(state, now, pointId, description);

  // Gemini writes the narrative in the background; the template reason is already on the log.
  const { index, mass } = argmaxInterval(state.posterior);
  const prices = state.bounties.filter((b) => b.status === "open").map((b) => ({ point: b.pointId, price: b.priceUsd }));
  const incidentId = state.incident?.id;
  void narrateIncident(pointId, description, index, mass, prices).then(({ text, source }) => {
    const inc = state.incidents.find((i) => i.id === incidentId);
    if (inc) inc.narrative = text;
    if (source === "gemini") incidentDecision.reason = `${text} (narrative by Gemini)`;
  });

  return NextResponse.json({ ok: true, incident: state.incident, incidentDecision, decisions });
}
