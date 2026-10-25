// In-memory singleton for the whole demo. Lives on globalThis so Next.js dev hot reloads keep it.
import { INTERVAL_COUNT } from "./points";
import { seedMandate, type Mandate, type MandateParams } from "./mandate";

export type DecisionAction =
  | "buy"
  | "reprice"
  | "decline"
  | "hold"
  | "escalate"
  | "pay"
  | "refuse"
  | "approve"
  | "halt"
  | "resume"
  | "incident"
  | "order"
  | "mandate"
  | "note";

export interface Decision {
  id: string;
  time: number;
  pointId: string | null;
  action: DecisionAction;
  priceUsd: number | null;
  reason: string;
  signature?: string;
  explorerUrl?: string;
  simulated?: boolean;
}

export type BountyStatus = "open" | "claimed" | "paid" | "refused" | "needs_approval" | "closed";

export interface Bounty {
  id: string;
  pointId: string;
  kind: "strip" | "lab";
  priceUsd: number;
  status: BountyStatus;
  reason: string;
  createdAt: number;
  updatedAt: number;
  claimId?: string;
}

export interface Claim {
  id: string;
  bountyId: string;
  pointId: string;
  code: string;
  status: "pending" | "paid" | "refused" | "needs_approval";
  bondUsd: number;
  bondSignature?: string;
  sampler: string;
  createdAt: number;
  result?: string;
  reason?: string;
  paySignature?: string;
  explorerUrl?: string;
  paidUsd?: number;
}

export type ReadingResult = "clean" | "bad";

export interface Sample {
  id: string;
  pointId: string;
  time: number;
  result: ReadingResult;
  nitrate: "low" | "medium" | "high";
  ammonia: "low" | "medium" | "high";
  confidence: number;
  evidenceHash: string;
  claimId?: string;
  synthetic?: boolean;
}

export interface LedgerEntry {
  id: string;
  time: number;
  direction: "in" | "out";
  amountUsd: number;
  from: string;
  to: string;
  memo: string;
  kind: "bounty" | "bond" | "bond_forfeit" | "lab" | "funding" | "order";
  pointId?: string;
  signature?: string;
  explorerUrl?: string;
  simulated: boolean;
  note?: string;
}

export interface Funder {
  id: string;
  name: string;
  contributedUsd: number;
}

export interface Order {
  id: string;
  buyer: string;
  pointId: string;
  description: string;
  priceUsd: number;
  deadline: number;
  status: "open" | "filled" | "expired";
  createdAt: number;
}

export interface Incident {
  id: string;
  startedAt: number;
  pointId: string;
  description: string;
  active: boolean;
  resolvedAt?: number;
  narrative?: string;
}

export interface PendingApproval {
  bountyId: string;
  pointId: string;
  priceUsd: number;
  reason: string;
  createdAt: number;
}

export interface MandateProposal {
  text: string;
  params: MandateParams;
  diff: { key: string; from: string; to: string }[];
  createdAt: number;
}

export interface CamState {
  mandate: Mandate;
  proposedMandate: MandateProposal | null;
  funders: Funder[];
  orders: Order[];
  bounties: Bounty[];
  claims: Claim[];
  samples: Sample[];
  decisions: Decision[];
  ledger: LedgerEntry[];
  /** Probability that the source lies in interval i (between POINTS[i] and POINTS[i + 1]). */
  posterior: number[];
  incident: Incident | null;
  incidents: Incident[];
  pendingApprovals: PendingApproval[];
  halted: boolean;
  haltReason: string | null;
  lastTickAt: number;
  /** Start of the accounting day the caps apply to. */
  dayStart: number;
  /** Per point id, USD paid out today. */
  perPointSpentUsd: Record<string, number>;
  /** Per sampler, paid claims today. */
  perSamplerPaid: Record<string, number>;
  /** Per point id, the last recorded decision action and price, for change detection. */
  lastDecisionByPoint: Record<string, { action: DecisionAction; priceUsd: number | null; time: number }>;
  simulation: { status: "idle" | "running" | "ready" | "failed"; detail: string; realPayments: number; realPaymentFailures: number };
  escalationCount: number;
  counters: { seq: number };
}

export const RIVER_WALLET_LABEL = "river";
export const SAMPLER_LABEL = "sampler";

export function uniformPosterior(): number[] {
  return Array.from({ length: INTERVAL_COUNT }, () => 1 / INTERVAL_COUNT);
}

export const SEED_FUNDERS: Funder[] = [
  { id: "cubc", name: "Cambridge University Boat Club", contributedUsd: 2.0 },
  { id: "jcbc", name: "Jesus College Boat Club", contributedUsd: 1.0 },
  { id: "ccc", name: "Cambridge City Council", contributedUsd: 2.0 },
];

export function seedOrders(now: number): Order[] {
  return [
    {
      id: "order-anglian-1",
      buyer: "Anglian Water compliance",
      pointId: "grantchester-outfall",
      description: "Independent strip sample at Grantchester outfall within 60 minutes",
      priceUsd: 0.5,
      deadline: now + 60 * 60 * 1000,
      status: "open",
      createdAt: now,
    },
  ];
}

export function initialState(now = Date.now()): CamState {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  return {
    mandate: seedMandate(now),
    proposedMandate: null,
    funders: SEED_FUNDERS.map((f) => ({ ...f })),
    orders: seedOrders(now),
    bounties: [],
    claims: [],
    samples: [],
    decisions: [],
    ledger: [],
    posterior: uniformPosterior(),
    incident: null,
    incidents: [],
    pendingApprovals: [],
    halted: false,
    haltReason: null,
    lastTickAt: 0,
    dayStart: dayStart.getTime(),
    perPointSpentUsd: {},
    perSamplerPaid: {},
    lastDecisionByPoint: {},
    simulation: { status: "idle", detail: "not started", realPayments: 0, realPaymentFailures: 0 },
    escalationCount: 0,
    counters: { seq: 0 },
  };
}

type Globals = typeof globalThis & { __camState?: CamState };

export function getState(): CamState {
  const g = globalThis as Globals;
  g.__camState ??= initialState();
  return g.__camState;
}

export function replaceState(next: CamState): CamState {
  const g = globalThis as Globals;
  g.__camState = next;
  return next;
}

export function nextId(state: CamState, prefix: string): string {
  state.counters.seq += 1;
  return `${prefix}-${state.counters.seq.toString(36)}`;
}

export function pooledBalanceUsd(state: CamState): number {
  const funded = state.funders.reduce((s, f) => s + f.contributedUsd, 0);
  const inflow = state.ledger.filter((l) => l.direction === "in" && l.kind !== "funding").reduce((s, l) => s + l.amountUsd, 0);
  const outflow = state.ledger.filter((l) => l.direction === "out").reduce((s, l) => s + l.amountUsd, 0);
  return round2(funded + inflow - outflow);
}

export function spentTodayUsd(state: CamState, now = Date.now()): number {
  const since = now - 24 * 60 * 60 * 1000;
  return round2(state.ledger.filter((l) => l.direction === "out" && l.time >= since).reduce((s, l) => s + l.amountUsd, 0));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface Counters {
  decisions: number;
  spentUsd: number;
  readingsBought: number;
  refused: number;
  escalations: number;
  halts: number;
  declined: number;
}

/** Counters for the last 24 hours, the numbers at the top of the dashboard. */
export function counters(state: CamState, now = Date.now()): Counters {
  const since = now - 24 * 60 * 60 * 1000;
  const recent = state.decisions.filter((d) => d.time >= since);
  return {
    decisions: recent.length,
    spentUsd: spentTodayUsd(state, now),
    readingsBought: recent.filter((d) => d.action === "pay").length,
    refused: recent.filter((d) => d.action === "refuse").length,
    escalations: recent.filter((d) => d.action === "escalate").length,
    halts: recent.filter((d) => d.action === "halt").length,
    declined: recent.filter((d) => d.action === "decline").length,
  };
}

export function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function recordDecision(state: CamState, d: Omit<Decision, "id">): Decision {
  const full: Decision = { id: nextId(state, "d"), ...d };
  state.decisions.push(full);
  if (d.pointId) state.lastDecisionByPoint[d.pointId] = { action: d.action, priceUsd: d.priceUsd, time: d.time };
  return full;
}

export function openBounty(state: CamState, pointId: string): Bounty | undefined {
  return state.bounties.find((b) => b.pointId === pointId && b.kind === "strip" && (b.status === "open" || b.status === "claimed"));
}

export function lastSample(state: CamState, pointId: string, before = Number.POSITIVE_INFINITY): Sample | undefined {
  let best: Sample | undefined;
  for (const s of state.samples) {
    if (s.pointId !== pointId || s.time > before) continue;
    if (!best || s.time > best.time) best = s;
  }
  return best;
}
