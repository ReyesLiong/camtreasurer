// Gemini reads the strip photo: is it a test strip, is the one-time code in frame, how dark are the
// nitrate and ammonia pads. The code match is logged but not enforced for the printed demo images
// (brief 9.4). With CAM_SIMULATE_VERIFY=1 a labelled simulated verdict is used if Gemini fails.
import { askGeminiVisionJson } from "@/lib/ai/gemini";

export type Band = "low" | "medium" | "high";

export interface StripVerdict {
  isStrip: boolean;
  codeVisible: boolean;
  codeMatches: boolean;
  codeRead: string | null;
  nitrate: Band;
  ammonia: Band;
  result: "clean" | "bad";
  confidence: number;
  summary: string;
  simulated: boolean;
}

const SCHEMA = {
  type: "object",
  properties: {
    isStrip: { type: "boolean" },
    codeVisible: { type: "boolean" },
    codeRead: { type: ["string", "null"] },
    nitrate: { type: "string", enum: ["low", "medium", "high"] },
    ammonia: { type: "string", enum: ["low", "medium", "high"] },
    confidence: { type: "number" },
    summary: { type: "string" },
  },
  required: ["isStrip", "codeVisible", "codeRead", "nitrate", "ammonia", "confidence", "summary"],
};

export function stripDataUrlPrefix(b64: string): { data: string; mimeType: string } {
  const m = b64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
  if (m) return { mimeType: m[1], data: m[2] };
  return { mimeType: "image/jpeg", data: b64 };
}

function band(x: unknown): Band {
  return x === "high" || x === "medium" ? x : "low";
}

/** Labelled stand-in used only when CAM_SIMULATE_VERIFY=1 and Gemini is unavailable. */
function simulatedVerdict(data: string, demoLabel?: string): StripVerdict {
  const label = demoLabel === "clean" || demoLabel === "high" || demoLabel === "shoe" ? demoLabel : data.length < 40_000 ? "shoe" : "clean";
  const isStrip = label !== "shoe";
  const high = label === "high";
  return {
    isStrip,
    codeVisible: isStrip,
    codeMatches: false,
    codeRead: null,
    nitrate: high ? "high" : "low",
    ammonia: high ? "high" : "low",
    result: high ? "bad" : "clean",
    confidence: isStrip ? 0.7 : 0.95,
    summary: `simulated verification (Gemini unavailable): treated as ${label}`,
    simulated: true,
  };
}

export async function verifyStrip(imageBase64: string, expectedCode: string, demoLabel?: string): Promise<StripVerdict> {
  const { data, mimeType } = stripDataUrlPrefix(imageBase64);
  const prompt =
    `You verify water quality test strip photos for a river monitoring fund. ` +
    `Decide if the image shows a water test strip (a thin card or stick with coloured reagent pads). ` +
    `A sampler was asked to put the one-time code "${expectedCode}" in frame, handwritten or printed. ` +
    `Report whether any such code is visible and what it reads. ` +
    `Read the nitrate pad and the ammonia pad as low (pale), medium or high (dark, saturated). ` +
    `confidence is your 0 to 1 confidence in the whole reading. summary is one short sentence.`;
  try {
    const raw = await askGeminiVisionJson<Record<string, unknown>>(prompt, data, mimeType, SCHEMA);
    const nitrate = band(raw.nitrate);
    const ammonia = band(raw.ammonia);
    const codeRead = typeof raw.codeRead === "string" && raw.codeRead.trim() ? raw.codeRead.trim() : null;
    const isStrip = raw.isStrip === true;
    const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
    return {
      isStrip,
      codeVisible: raw.codeVisible === true,
      codeMatches: !!codeRead && codeRead.replace(/[^a-z0-9]/gi, "").toLowerCase() === expectedCode.replace(/[^a-z0-9]/gi, "").toLowerCase(),
      codeRead,
      nitrate,
      ammonia,
      result: nitrate === "high" || ammonia === "high" ? "bad" : "clean",
      confidence,
      summary: typeof raw.summary === "string" ? raw.summary : "",
      simulated: false,
    };
  } catch (err) {
    if (process.env.CAM_SIMULATE_VERIFY === "1") {
      console.error("[cam] Gemini verification failed, using simulated verdict:", err instanceof Error ? err.message.slice(0, 200) : err);
      return simulatedVerdict(data, demoLabel);
    }
    throw err;
  }
}
