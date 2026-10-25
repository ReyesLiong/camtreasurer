// Turns a plain-English mandate into parameters with Gemini. A human approves the diff before it applies.
import { askGeminiJson } from "@/lib/ai/gemini";
import { POINTS } from "./points";
import { diffParams, type MandateParams } from "./mandate";

const SCHEMA = {
  type: "object",
  properties: {
    dailyBudgetUsd: { type: "number" },
    maxPaymentUsd: { type: "number" },
    perPointDailyUsd: { type: "number" },
    perSamplerDaily: { type: "integer" },
    minConfidence: { type: "number" },
    blackoutStartHour: { type: "integer" },
    blackoutEndHour: { type: "integer" },
    labBountyUsd: { type: "number" },
    labTrigger: { type: "string" },
    rowingReach: { type: "array", items: { type: "string" } },
    targetFreshnessHours: { type: "object", additionalProperties: { type: "number" } },
    priorities: { type: "object", additionalProperties: { type: "object", properties: { base: { type: "number" }, afterAlert: { type: "number" } }, required: ["base"] } },
  },
  required: ["dailyBudgetUsd", "maxPaymentUsd", "perPointDailyUsd", "perSamplerDaily", "minConfidence", "blackoutStartHour", "blackoutEndHour", "labBountyUsd", "labTrigger", "rowingReach", "targetFreshnessHours", "priorities"],
};

function num(x: unknown, fallback: number, min: number, max: number): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function compileMandate(text: string, current: MandateParams): Promise<{ params: MandateParams; diff: ReturnType<typeof diffParams> }> {
  const prompt =
    `You compile a river monitoring fund's mandate into parameters. Points (ids): ${POINTS.map((p) => `${p.id} (${p.name}, ${p.kmUpstream} km upstream of Jesus Lock)`).join("; ")}.\n\n` +
    `CURRENT PARAMETERS (keep any value the new text does not change):\n${JSON.stringify(current)}\n\n` +
    `NEW MANDATE TEXT:\n${text}\n\n` +
    `Rules: amounts in USDC. blackoutStartHour and blackoutEndHour are 0 to 23 ("after dark" means 19 to 6). ` +
    `priorities.base is a weight around 1 (1.5 = high), afterAlert applies after rain or overflow alerts. ` +
    `targetFreshnessHours has a "default" key plus overrides by point id. rowingReach lists the point ids that must be fresh before dawn.`;
  const raw = await askGeminiJson<Record<string, unknown>>(prompt, { schema: SCHEMA });
  const params: MandateParams = {
    dailyBudgetUsd: num(raw.dailyBudgetUsd, current.dailyBudgetUsd, 0.1, 1000),
    maxPaymentUsd: num(raw.maxPaymentUsd, current.maxPaymentUsd, 0.02, 100),
    perPointDailyUsd: num(raw.perPointDailyUsd, current.perPointDailyUsd, 0.05, 1000),
    perSamplerDaily: Math.round(num(raw.perSamplerDaily, current.perSamplerDaily, 1, 100)),
    minConfidence: num(raw.minConfidence, current.minConfidence, 0.1, 1),
    blackoutStartHour: Math.round(num(raw.blackoutStartHour, current.blackoutStartHour, 0, 23)),
    blackoutEndHour: Math.round(num(raw.blackoutEndHour, current.blackoutEndHour, 0, 23)),
    labBountyUsd: num(raw.labBountyUsd, current.labBountyUsd, 0.1, 100),
    labTrigger: typeof raw.labTrigger === "string" && raw.labTrigger.trim() ? raw.labTrigger.trim() : current.labTrigger,
    rowingReach: Array.isArray(raw.rowingReach) ? raw.rowingReach.map(String).filter((id) => POINTS.some((p) => p.id === id)) : current.rowingReach,
    targetFreshnessHours: { ...current.targetFreshnessHours },
    priorities: { ...current.priorities },
  };
  if (raw.targetFreshnessHours && typeof raw.targetFreshnessHours === "object") {
    for (const [k, v] of Object.entries(raw.targetFreshnessHours as Record<string, unknown>)) {
      if (k === "default" || POINTS.some((p) => p.id === k)) params.targetFreshnessHours[k] = num(v, 6, 0.25, 72);
    }
  }
  if (raw.priorities && typeof raw.priorities === "object") {
    for (const [k, v] of Object.entries(raw.priorities as Record<string, { base?: unknown; afterAlert?: unknown }>)) {
      if (!POINTS.some((p) => p.id === k) || !v || typeof v !== "object") continue;
      const base = num(v.base, current.priorities[k]?.base ?? 1, 0, 5);
      const afterAlert = v.afterAlert == null ? current.priorities[k]?.afterAlert : num(v.afterAlert, base, 0, 5);
      params.priorities[k] = afterAlert == null ? { base } : { base, afterAlert };
    }
  }
  if (params.maxPaymentUsd > params.dailyBudgetUsd) params.maxPaymentUsd = params.dailyBudgetUsd;
  return { params, diff: diffParams(current, params) };
}
