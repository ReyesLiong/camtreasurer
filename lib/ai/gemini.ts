import "server-only";
import { GoogleGenAI } from "@google/genai";

// Drop-in replacement for the scaffold's lib/ai/gemini.ts.
// Keeps askGemini() exactly as shipped and adds askGeminiJson() for structured output.
// `server-only` makes the build fail if a client component imports this file,
// so GEMINI_API_KEY can never end up in browser JavaScript.

const DEFAULT_MODEL = "gemini-flash-latest";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new MissingGeminiKeyError();
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export class MissingGeminiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set. Add it to .env.local and restart `npm run dev`.");
  }
}

function model(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}


const FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"];

type GenParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];

/** Tries the configured model, then fallbacks, on 503/429/500 overload errors. */
async function generateWithFallback(params: GenParams) {
  const models = [params.model, ...FALLBACK_MODELS.filter((m) => m !== params.model)];
  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    try {
      return await Promise.race([getClient().models.generateContent({ ...params, model: models[i] }), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 7000))]);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/503|429|500|404|NOT_FOUND|UNAVAILABLE|overloaded|high demand|RESOURCE_EXHAUSTED|INTERNAL|timeout|timed out|abort/i.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw lastErr;
}

/** Plain text answer. */
export async function askGemini(prompt: string, opts: { system?: string; temperature?: number } = {}): Promise<string> {
  const response = await generateWithFallback({
    model: model(),
    contents: prompt,
    config: {
      ...(opts.system ? { systemInstruction: opts.system } : {}),
      temperature: opts.temperature ?? 0.2,
    },
  });
  return response.text ?? "";
}

/** Strips ```json fences and finds the outermost JSON value in a model reply. */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = Math.min(...["{", "["].map((c) => (t.indexOf(c) === -1 ? Infinity : t.indexOf(c))));
    const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (start !== Infinity && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error("Model reply was not JSON");
  }
}

/**
 * JSON answer. Pass a JSON Schema when you have one; Gemini's structured-output mode is used when
 * the schema is simple enough, and the reply is parsed and returned as a plain object either way.
 */
export async function askGeminiJson<T = unknown>(
  prompt: string,
  opts: { system?: string; schema?: Record<string, unknown>; temperature?: number } = {},
): Promise<T> {
  const schemaNote = opts.schema ? `\n\nReturn ONLY a JSON value that matches this JSON Schema exactly (no prose, no code fences):\n${JSON.stringify(opts.schema)}` : "\n\nReturn ONLY valid JSON (no prose, no code fences).";
  const response = await generateWithFallback({
    model: model(),
    contents: prompt + schemaNote,
    config: {
      ...(opts.system ? { systemInstruction: opts.system } : {}),
      temperature: opts.temperature ?? 0,
      responseMimeType: "application/json",
    },
  });
  return extractJson(response.text ?? "") as T;
}

/** JSON answer about an image. Strip any data URL prefix before passing imageBase64. */
export async function askGeminiVisionJson<T = unknown>(prompt: string, imageBase64: string, mimeType = "image/jpeg", schema?: Record<string, unknown>): Promise<T> {
  const response = await generateWithFallback({
    model: model(),
    contents: [{ role: "user", parts: [{ text: prompt + (schema ? `\n\nReturn ONLY JSON matching: ${JSON.stringify(schema)}` : "\n\nReturn ONLY JSON.") }, { inlineData: { mimeType, data: imageBase64 } }] }],
    config: { temperature: 0, responseMimeType: "application/json" },
  });
  return extractJson(response.text ?? "") as T;
}
