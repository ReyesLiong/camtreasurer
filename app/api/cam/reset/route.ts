import { NextResponse } from "next/server";
import { resetDay } from "@/lib/cam/simulate";
import { counters } from "@/lib/cam/state";

export const dynamic = "force-dynamic";

/** Reset day: fresh state and a new synthetic day. Real signatures made in this process are kept. */
export async function POST() {
  const state = resetDay();
  return NextResponse.json({ ok: true, counters: counters(state) });
}
