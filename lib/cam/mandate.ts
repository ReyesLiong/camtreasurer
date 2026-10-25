// The funders' mandate: plain text plus the parameters the loop actually enforces.
// compileMandate (Gemini) is added in build step 5; the seed below is applied at startup.

export interface PointPriority {
  base: number;
  afterAlert?: number;
}

export interface MandateParams {
  dailyBudgetUsd: number;
  maxPaymentUsd: number;
  perPointDailyUsd: number;
  perSamplerDaily: number;
  minConfidence: number;
  /** Hour (0 to 23) when bounties stop being posted. */
  blackoutStartHour: number;
  /** Hour (0 to 23) when bounties may resume. */
  blackoutEndHour: number;
  /** Hours a reading may be old before a point counts as stale, by point id; `default` for the rest. */
  targetFreshnessHours: Record<string, number>;
  priorities: Record<string, PointPriority>;
  labBountyUsd: number;
  labTrigger: string;
  /** Points that must be fresh before dawn outings. */
  rowingReach: string[];
}

export interface Mandate {
  text: string;
  params: MandateParams;
  appliedAt: number;
  appliedBy: string;
}

export const SEED_MANDATE_TEXT =
  "Keep the rowing reach from Jesus Lock to Newnham fresh before dawn outings (reading under 3 hours old by 06:00). " +
  "After rain or any overflow alert, prioritise Grantchester outfall and Byron's Pool. " +
  "Spend at most 5 USDC a day, never more than 1 USDC on one purchase without a human, no bounties after dark, " +
  "at most 5 paid claims per sampler per day. Buy a lab bottle when two upstream strips read high.";

export const SEED_PARAMS: MandateParams = {
  dailyBudgetUsd: 5,
  maxPaymentUsd: 1,
  perPointDailyUsd: 1.5,
  perSamplerDaily: 5,
  minConfidence: 0.6,
  blackoutStartHour: 19,
  blackoutEndHour: 6,
  targetFreshnessHours: {
    default: 6,
    "jesus-lock": 3,
    "mill-pond": 3,
    "sheeps-green": 3,
    newnham: 3,
  },
  priorities: {
    "jesus-lock": { base: 1.0 },
    "mill-pond": { base: 1.2 },
    "sheeps-green": { base: 1.5 },
    newnham: { base: 1.2 },
    "grantchester-meadows": { base: 0.8 },
    "byrons-pool": { base: 1.0, afterAlert: 1.8 },
    "grantchester-outfall": { base: 1.4, afterAlert: 2.0 },
    haslingfield: { base: 0.6 },
  },
  labBountyUsd: 2,
  labTrigger: "two high readings upstream of a clean one",
  rowingReach: ["jesus-lock", "mill-pond", "sheeps-green", "newnham"],
};

export function seedMandate(now = Date.now()): Mandate {
  return { text: SEED_MANDATE_TEXT, params: structuredClone(SEED_PARAMS), appliedAt: now, appliedBy: "seed" };
}

export function priorityFor(params: MandateParams, pointId: string, alertActive: boolean): number {
  const p = params.priorities[pointId];
  if (!p) return 1;
  return alertActive && p.afterAlert ? p.afterAlert : p.base;
}

export function targetFreshness(params: MandateParams, pointId: string): number {
  return params.targetFreshnessHours[pointId] ?? params.targetFreshnessHours.default ?? 6;
}

export function inBlackout(params: MandateParams, hour: number): boolean {
  const { blackoutStartHour: s, blackoutEndHour: e } = params;
  if (s === e) return false;
  return s > e ? hour >= s || hour < e : hour >= s && hour < e;
}

/** Shallow diff of two parameter sets for the propose-change box. */
export function diffParams(a: MandateParams, b: MandateParams): { key: string; from: string; to: string }[] {
  const out: { key: string; from: string; to: string }[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof MandateParams>;
  for (const k of keys) {
    const av = JSON.stringify(a[k]);
    const bv = JSON.stringify(b[k]);
    if (av !== bv) out.push({ key: k, from: av, to: bv });
  }
  return out;
}
