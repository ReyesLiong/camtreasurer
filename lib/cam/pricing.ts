// Price formula and the source-search posterior.
//
// Posterior: probability that the source lies in interval i (between POINTS[i] and POINTS[i + 1]).
// Update rules (soft so that contradictory strips never collapse the search to nothing):
//   high strip at point k: the source is upstream of k, so intervals below k drop to zero and the
//     reach immediately above k is boosted, because readings are strongest nearest the source.
//   clean strip at point k: the reach below k is unlikely to be discharging now, so intervals below
//     k are scaled down and the search moves upstream.
// Price: 0.03 + 0.02 x urgency, clamped to [0.02, maxPaymentUsd].

import { INTERVAL_COUNT, POINTS } from "./points";
import { priorityFor, type MandateParams } from "./mandate";
import type { ReadingResult } from "./state";

export const PRICE_BASE_USD = 0.03;
export const PRICE_PER_URGENCY_USD = 0.02;
export const PRICE_FLOOR_USD = 0.02;
export const INFO_GAIN_WEIGHT = 20;
export const ORDER_WEIGHT = 4;
const CLEAN_DOWNSTREAM_FACTOR = 0.2;
const BAD_ADJACENT_BOOST = 1.5;

export function priceFromUrgency(urgency: number, maxPaymentUsd: number): number {
  const raw = PRICE_BASE_USD + PRICE_PER_URGENCY_USD * urgency;
  return Math.round(Math.min(maxPaymentUsd, Math.max(PRICE_FLOOR_USD, raw)) * 100) / 100;
}

export function normalise(p: number[]): number[] {
  const s = p.reduce((a, b) => a + b, 0);
  if (s <= 0) return Array.from({ length: p.length }, () => 1 / p.length);
  return p.map((x) => x / s);
}

export function entropyBits(p: number[]): number {
  let h = 0;
  for (const x of p) if (x > 0) h -= x * Math.log2(x);
  return h;
}

/** Prior at incident start: each interval weighted by the mean alert priority of its two ends. */
export function alertPrior(params: MandateParams): number[] {
  const w: number[] = [];
  for (let i = 0; i < INTERVAL_COUNT; i++) {
    const a = priorityFor(params, POINTS[i].id, true);
    const b = priorityFor(params, POINTS[i + 1].id, true);
    w.push((a + b) / 2);
  }
  return normalise(w);
}

export function updatePosterior(posterior: number[], k: number, result: ReadingResult): number[] {
  const next = posterior.slice();
  if (result === "bad") {
    for (let i = 0; i < k && i < next.length; i++) next[i] = 0;
    if (k < next.length) next[k] *= BAD_ADJACENT_BOOST;
  } else {
    for (let i = 0; i < k && i < next.length; i++) next[i] *= CLEAN_DOWNSTREAM_FACTOR;
  }
  return normalise(next);
}

/** Probability that a strip at point k reads high: the source must be upstream of k. */
export function probBadAt(posterior: number[], k: number): number {
  let m = 0;
  for (let i = k; i < posterior.length; i++) m += posterior[i];
  return Math.min(1, Math.max(0, m));
}

/** Expected entropy reduction (bits) from one strip at point k. */
export function expectedInfoGain(posterior: number[], k: number): number {
  const h0 = entropyBits(posterior);
  const pBad = probBadAt(posterior, k);
  const hBad = pBad > 0 ? entropyBits(updatePosterior(posterior, k, "bad")) : 0;
  const hClean = pBad < 1 ? entropyBits(updatePosterior(posterior, k, "clean")) : 0;
  const expected = pBad * hBad + (1 - pBad) * hClean;
  return Math.max(0, h0 - expected);
}

export function argmaxInterval(posterior: number[]): { index: number; mass: number } {
  let index = 0;
  for (let i = 1; i < posterior.length; i++) if (posterior[i] > posterior[index]) index = i;
  return { index, mass: posterior[index] ?? 0 };
}
