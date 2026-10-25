// Payments out of the river wallet. Every real transfer goes through the shared spending tracker so
// the budget bar reflects bounties and anything else the river buys. The human override builds a
// one-off tracker whose cap equals the approved price (documented in the brief, section 9.5).
import { createKeyPairSignerFromBytes, getBase58Encoder, type KeyPairSigner } from "@solana/kit";
import { loadAgentSigner } from "@/lib/payments/client";
import { payUsdc, TransferError, usdcToMicros } from "@/lib/payments/transfer";
import { getSpendingTracker } from "@/lib/paidapi/buyer";
import { SpendingTracker } from "@/lib/spending/tracker";
import { explorerUrl, nextId, round2, type CamState, type LedgerEntry } from "./state";

export const BOND_USD = Number(process.env.PAID_API_PRICE_USD || "0.02");

export class CapExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapExceededError";
  }
}

let riverSigner: Promise<KeyPairSigner> | null = null;
export function loadRiverSigner(): Promise<KeyPairSigner> {
  riverSigner ??= loadAgentSigner().catch((err) => {
    riverSigner = null;
    throw err;
  });
  return riverSigner;
}

/** Mirrors loadAgentSigner but reads SAMPLER_PRIVATE_KEY: the demo sampler's wallet, which pays bonds. */
export async function loadSamplerSigner(): Promise<KeyPairSigner> {
  const raw = process.env.SAMPLER_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("SAMPLER_PRIVATE_KEY is not set. Add the sampler keypair to .env.local.");
  let bytes: Uint8Array;
  try {
    bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw) as number[]) : new Uint8Array(getBase58Encoder().encode(raw));
  } catch {
    throw new Error("SAMPLER_PRIVATE_KEY is not valid base58 or a JSON byte array.");
  }
  if (bytes.length !== 64) throw new Error(`SAMPLER_PRIVATE_KEY must be a 64-byte secret key (got ${bytes.length} bytes).`);
  return createKeyPairSignerFromBytes(bytes);
}

export async function samplerWallet(): Promise<string> {
  const env = process.env.SAMPLER_WALLET?.trim();
  if (env) return env;
  return (await loadSamplerSigner()).address;
}

export function memoFor(pointId: string, evidenceHash: string, result: string): string {
  return `cam:${pointId}:${evidenceHash.slice(0, 16)}:${result}`;
}

export interface PayoutRequest {
  to: string;
  amountUsd: number;
  memo: string;
  pointId: string;
  kind: LedgerEntry["kind"];
  note?: string;
}

function ledgerEntry(state: CamState, req: PayoutRequest, time: number, signature?: string, simulated = false): LedgerEntry {
  const entry: LedgerEntry = {
    id: nextId(state, "tx"),
    time,
    direction: "out",
    amountUsd: round2(req.amountUsd),
    from: "river",
    to: req.to,
    memo: req.memo,
    kind: req.kind,
    pointId: req.pointId,
    simulated,
    note: req.note,
  };
  if (signature) {
    entry.signature = signature;
    entry.explorerUrl = explorerUrl(signature);
  }
  state.ledger.push(entry);
  state.perPointSpentUsd[req.pointId] = round2((state.perPointSpentUsd[req.pointId] ?? 0) + req.amountUsd);
  return entry;
}

/** A real devnet transfer guarded by the shared tracker. Throws CapExceededError when the tracker refuses. */
export async function payReal(state: CamState, req: PayoutRequest, time = Date.now()): Promise<LedgerEntry> {
  const signer = await loadRiverSigner();
  try {
    const { signature } = await payUsdc(signer, { to: req.to, amountUsdc: req.amountUsd, memo: req.memo }, { guard: getSpendingTracker(), timeoutMs: 40_000 });
    return ledgerEntry(state, req, time, signature, false);
  } catch (err) {
    if (err instanceof TransferError && /spending limits/i.test(err.message)) throw new CapExceededError(err.message);
    throw err;
  }
}

/**
 * The human override: one payment above the per-payment cap, approved by a shake. A fresh tracker
 * with maxPayment = price and budget = what the shared tracker has left, so the daily budget still binds.
 */
export async function payWithHumanOverride(state: CamState, req: PayoutRequest, time = Date.now()): Promise<LedgerEntry> {
  const signer = await loadRiverSigner();
  const shared = getSpendingTracker();
  const priceMicros = usdcToMicros(req.amountUsd);
  const remaining = shared.remaining();
  const once = new SpendingTracker({ budgetMicros: remaining, maxPaymentMicros: priceMicros });
  const { signature } = await payUsdc(signer, { to: req.to, amountUsdc: req.amountUsd, memo: req.memo }, { guard: once, timeoutMs: 40_000 });
  return ledgerEntry(state, req, time, signature, false);
}

/** A ledger entry with no transaction behind it. Only the startup simulation uses this, and it says so. */
export function paySimulated(state: CamState, req: PayoutRequest, time: number): LedgerEntry {
  return ledgerEntry(state, req, time, undefined, true);
}

/** Bond arriving in the river (x402 claim) or kept after a refusal. */
export function recordBond(state: CamState, opts: { from: string; amountUsd: number; pointId: string; time: number; forfeited: boolean; signature?: string; simulated: boolean }): LedgerEntry {
  const entry: LedgerEntry = {
    id: nextId(state, "tx"),
    time: opts.time,
    direction: "in",
    amountUsd: round2(opts.amountUsd),
    from: opts.from,
    to: "river",
    memo: opts.forfeited ? "bond forfeited" : "claim bond",
    kind: opts.forfeited ? "bond_forfeit" : "bond",
    pointId: opts.pointId,
    simulated: opts.simulated,
  };
  if (opts.signature) {
    entry.signature = opts.signature;
    entry.explorerUrl = explorerUrl(opts.signature);
  }
  state.ledger.push(entry);
  return entry;
}

export function spendingSnapshot() {
  try {
    return getSpendingTracker().snapshot();
  } catch {
    return null;
  }
}
