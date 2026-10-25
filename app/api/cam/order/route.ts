import { NextResponse } from "next/server";
import { runTick } from "@/lib/cam/decide";
import { POINT_BY_ID, pointName } from "@/lib/cam/points";
import { ensureSimulation } from "@/lib/cam/simulate";
import { nextId, recordDecision } from "@/lib/cam/state";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = ensureSimulation();
  return NextResponse.json({ orders: state.orders });
}

/** POST {buyer, pointId, description, priceUsd, minutes}: a bespoke buyer places a priced order. */
export async function POST(request: Request) {
  const state = ensureSimulation();
  let body: { buyer?: string; pointId?: string; description?: string; priceUsd?: number; minutes?: number } = {};
  try {
    body = await request.json();
  } catch {}
  if (!body.pointId || !POINT_BY_ID[body.pointId]) return NextResponse.json({ error: "pointId is required." }, { status: 400 });
  const price = Number(body.priceUsd);
  if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "priceUsd must be positive." }, { status: 400 });
  const now = Date.now();
  const order = { id: nextId(state, "order"), buyer: body.buyer?.trim() || "bespoke buyer", pointId: body.pointId, description: body.description?.trim() || "independent sample", priceUsd: price, deadline: now + (Number(body.minutes) || 60) * 60_000, status: "open" as const, createdAt: now };
  state.orders.push(order);
  recordDecision(state, { time: now, pointId: order.pointId, action: "order", priceUsd: price, reason: `${order.buyer} ordered ${order.description} at ${pointName(order.pointId)} for ${price.toFixed(2)} USDC. Adding it to the point's urgency.` });
  runTick(state, now + 1);
  return NextResponse.json({ order });
}
