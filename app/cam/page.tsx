"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Module, PageHeader } from "@/components/ui";
import { POINTS, intervalLabel } from "@/lib/cam/points";
import type { Bounty, Decision, Funder, Incident, LedgerEntry, MandateProposal, Order, PendingApproval } from "@/lib/cam/state";
import type { Mandate } from "@/lib/cam/mandate";

type Snapshot = {
  now: number;
  counters: { decisions: number; spentUsd: number; readingsBought: number; refused: number; escalations: number; halts: number; declined: number };
  pooledBalanceUsd: number;
  spentTodayUsd: number;
  dailyBudgetUsd: number;
  spending: { budgetUsd: string; maxPaymentUsd: string; spentUsd: string; remainingUsd: string; payments: number } | null;
  simulation: { status: string; detail: string; realPayments: number; realPaymentFailures: number };
  halted: boolean;
  incident: Incident | null;
  mandate: Mandate;
  proposedMandate: MandateProposal | null;
  funders: Funder[];
  orders: Order[];
  bounties: Bounty[];
  pendingApprovals: PendingApproval[];
  posterior: number[];
  decisions: Decision[];
  ledger: LedgerEntry[];
};

const ACTION_TONE: Record<string, string> = {
  buy: "#4528d6",
  reprice: "#4528d6",
  pay: "#0b7a51",
  approve: "#0b7a51",
  refuse: "#c2361f",
  escalate: "#8a5a00",
  halt: "#c2361f",
  decline: "#6a6a64",
  hold: "#6a6a64",
  incident: "#c2361f",
  note: "#3d3d3a",
  resume: "#0b7a51",
  order: "#4528d6",
  mandate: "#4528d6",
};

function hhmm(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function usd(n: number | null | undefined): string {
  return n == null ? "" : n.toFixed(2);
}

export default function CamDashboard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    try {
      const r = await fetch("/api/cam/state", { cache: "no-store" });
      if (!r.ok) throw new Error(`state ${r.status}`);
      setSnap((await r.json()) as Snapshot);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void refresh();
    timer.current = setInterval(refresh, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  async function post(path: string, body?: unknown, label?: string) {
    setBusy(label ?? path);
    try {
      const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await r.json();
      if (!r.ok) setError(data.error ?? `${path} failed`);
      await refresh();
      return data;
    } finally {
      setBusy(null);
    }
  }

  const decisions = useMemo(() => {
    if (!snap) return [];
    return filter === "all" ? snap.decisions : snap.decisions.filter((d) => d.action === filter);
  }, [snap, filter]);

  if (!snap) {
    return (
      <>
        <PageHeader eyebrow="CamTreasurer" title="The river has a treasurer" />
        <Module label="Loading">{error ? <p style={{ color: "var(--fault)" }}>{error}</p> : <p>Running the synthetic day...</p>}</Module>
      </>
    );
  }

  const c = snap.counters;
  const budgetPct = Math.min(100, (snap.spentTodayUsd / snap.dailyBudgetUsd) * 100);
  const top = snap.posterior.reduce((best, x, i, arr) => (x > arr[best] ? i : best), 0);
  const bountyAt = (id: string) => snap.bounties.find((b) => b.pointId === id && b.kind === "strip" && (b.status === "open" || b.status === "claimed"));

  return (
    <>
      <PageHeader eyebrow="CamTreasurer" title="The river has a treasurer">
        <div className="row">
          <button className="btn btn--signal" disabled={!!busy || !!snap.incident} onClick={() => post("/api/cam/incident", { pointId: "jesus-lock", description: "Fish kill reported at Jesus Lock" }, "incident")}>
            {snap.incident ? "Incident active" : "Report incident at Jesus Lock"}
          </button>
          {snap.incident && (
            <button className="btn" disabled={!!busy} onClick={() => post("/api/cam/incident", { resolve: true }, "resolve")}>
              Close incident
            </button>
          )}
          <button className="btn" disabled={!!busy} onClick={() => post("/api/cam/tick", undefined, "tick")}>
            Run tick
          </button>
          <button className="btn" disabled={!!busy} onClick={() => post("/api/cam/reset", undefined, "reset")}>
            Reset day
          </button>
          <a className="btn" href="/cam/ledger">
            Ledger
          </a>
          <a className="btn" href="/cam/phone">
            Phone
          </a>
        </div>
      </PageHeader>

      {error && <p style={{ color: "var(--fault)", margin: 0 }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8 }}>
        {[
          ["Decisions (24h)", String(c.decisions)],
          ["Spent", `${usd(c.spentUsd)} USDC`],
          ["Readings bought", String(c.readingsBought)],
          ["Claims refused", String(c.refused)],
          ["Escalations", String(c.escalations)],
          ["Human halts", String(c.halts)],
        ].map(([label, value]) => (
          <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--ink)", padding: "10px 12px", boxShadow: "3px 3px 0 var(--ink)" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr) 320px", gap: 16, alignItems: "start" }}>
        <div className="stack">
          <Module label="River Cam, bounty prices" right={snap.incident ? <span style={{ color: "var(--fault)" }}>INCIDENT</span> : <span>routine</span>}>
            <svg viewBox="0 0 280 420" width="100%" role="img" aria-label="Schematic of the Cam with bounty prices">
              <path d="M 60 400 C 40 340, 110 300, 80 250 S 40 160, 90 110 S 130 50, 70 20" fill="none" stroke="#9fb7d9" strokeWidth="14" strokeLinecap="round" />
              {POINTS.map((p, i) => {
                const tt = 1 - i / (POINTS.length - 1);
                const y = 20 + tt * 380;
                const x = 70 + 20 * Math.sin(i * 1.3);
                const b = bountyAt(p.id);
                const r = b ? 6 + Math.min(18, b.priceUsd * 40) : 4;
                const incidentHere = snap.incident?.pointId === p.id;
                return (
                  <g key={p.id}>
                    <circle cx={x} cy={y} r={r} fill={b ? (b.status === "claimed" ? "#8a5a00" : "#4528d6") : "#cfcfc8"} stroke="#161616" strokeWidth={incidentHere ? 3 : 1} />
                    <text x={x + r + 8} y={y + 4} fontSize="11" fontFamily="var(--sans)" fill="#161616">
                      {p.name}
                    </text>
                    <text x={x + r + 8} y={y + 17} fontSize="10" fontFamily="var(--mono)" fill={b ? "#4528d6" : "#6a6a64"}>
                      {b ? `${usd(b.priceUsd)} ${b.status === "claimed" ? "claimed" : "open"}` : "no bounty"}
                    </text>
                  </g>
                );
              })}
              <text x="8" y="412" fontSize="9" fontFamily="var(--mono)" fill="#6a6a64">
                upstream at top, Jesus Lock at bottom
              </text>
            </svg>
            {snap.incident && (
              <p style={{ fontSize: 12, margin: "4px 0 0" }}>
                Most likely source reach: <b>{intervalLabel(top)}</b> ({Math.round((snap.posterior[top] ?? 0) * 100)}%)
                {snap.incident.narrative ? <span style={{ display: "block", color: "var(--muted)", marginTop: 4 }}>{snap.incident.narrative}</span> : null}
              </p>
            )}
          </Module>
          <Module label="Budget today">
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
              <span>{usd(snap.spentTodayUsd)} spent</span>
              <span>{usd(snap.dailyBudgetUsd)} daily budget</span>
            </div>
            <div style={{ height: 14, background: "var(--strip)", border: "1px solid var(--ink)", marginTop: 6 }}>
              <div style={{ height: "100%", width: `${budgetPct}%`, background: budgetPct > 90 ? "var(--fault)" : "var(--signal)" }} />
            </div>
            {snap.spending && (
              <p style={{ fontSize: 11, color: "var(--muted)", margin: "6px 0 0", fontFamily: "var(--mono)" }}>
                wallet tracker: {snap.spending.spentUsd} of {snap.spending.budgetUsd} real, cap {snap.spending.maxPaymentUsd} per payment
              </p>
            )}
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "6px 0 0" }}>
              startup: {snap.simulation.status}, {snap.simulation.detail}
            </p>
          </Module>
        </div>

        <Module
          label="Decision log"
          right={
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ fontSize: 11 }}>
              {["all", "buy", "reprice", "decline", "pay", "refuse", "escalate", "approve", "halt", "incident", "note"].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          }
        >
          <div style={{ maxHeight: 640, overflowY: "auto", fontSize: 13 }}>
            {decisions.map((d) => (
              <div key={d.id} style={{ display: "grid", gridTemplateColumns: "44px 72px 1fr", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--hairline)" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{hhmm(d.time)}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: ACTION_TONE[d.action] ?? "var(--ink)", textTransform: "uppercase" }}>
                  {d.action}
                  {d.priceUsd != null && d.priceUsd > 0 ? ` ${usd(d.priceUsd)}` : ""}
                </span>
                <span>
                  {d.reason}
                  {d.explorerUrl && (
                    <>
                      {" "}
                      <a href={d.explorerUrl} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                        tx {d.signature?.slice(0, 8)}
                      </a>
                    </>
                  )}
                  {d.simulated && <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}> simulated</span>}
                </span>
              </div>
            ))}
          </div>
        </Module>

        <div className="stack">
          {snap.pendingApprovals.length > 0 && (
            <Module label="Waiting for a human" right={<span style={{ color: "var(--fault)" }}>{snap.pendingApprovals.length}</span>}>
              {snap.pendingApprovals.map((p) => (
                <div key={p.bountyId} style={{ fontSize: 13, marginBottom: 8 }}>
                  <b>{usd(p.priceUsd)} USDC</b> {p.reason}
                  <div style={{ marginTop: 6 }}>
                    <button className="btn btn--signal" disabled={!!busy} onClick={() => post("/api/cam/approve", { bountyId: p.bountyId, who: "dashboard funder" }, "approve")}>
                      Approve from dashboard
                    </button>
                  </div>
                </div>
              ))}
            </Module>
          )}
          <Module label="Funders" right={<span>{usd(snap.pooledBalanceUsd)} USDC pooled</span>}>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {snap.funders.map((f) => (
                <li key={f.id}>
                  {f.name}: {usd(f.contributedUsd)}
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 12, margin: "10px 0 4px", fontFamily: "var(--mono)", color: "var(--muted)" }}>MANDATE</p>
            <p style={{ fontSize: 13, margin: 0 }}>{snap.mandate.text}</p>
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "6px 0 0", fontFamily: "var(--mono)" }}>
              cap {usd(snap.mandate.params.maxPaymentUsd)} per payment, {usd(snap.mandate.params.dailyBudgetUsd)} a day, blackout {snap.mandate.params.blackoutStartHour}:00 to {String(snap.mandate.params.blackoutEndHour).padStart(2, "0")}:00
            </p>
            <textarea value={proposal} onChange={(e) => setProposal(e.target.value)} placeholder="Propose a change to the mandate in plain English" rows={3} style={{ width: "100%", marginTop: 8, fontSize: 12 }} />
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn" disabled={!!busy || !proposal.trim()} onClick={() => post("/api/cam/mandate", { text: proposal }, "mandate")}>
                Compile proposal
              </button>
              {snap.proposedMandate && (
                <button className="btn btn--signal" disabled={!!busy} onClick={() => post("/api/cam/mandate", { apply: true }, "apply")}>
                  Approve and apply
                </button>
              )}
            </div>
            {snap.proposedMandate && (
              <div style={{ fontSize: 12, marginTop: 8, fontFamily: "var(--mono)" }}>
                {snap.proposedMandate.diff.length === 0 && <div>No parameter changes.</div>}
                {snap.proposedMandate.diff.map((x) => (
                  <div key={x.key}>
                    {x.key}: {x.from} to {x.to}
                  </div>
                ))}
              </div>
            )}
          </Module>
          <Module label="Bespoke orders">
            {snap.orders.length === 0 && <p style={{ fontSize: 13, margin: 0 }}>None.</p>}
            {snap.orders.map((o) => (
              <div key={o.id} style={{ fontSize: 13, marginBottom: 6 }}>
                <b>{o.buyer}</b>: {o.description}, {usd(o.priceUsd)} USDC, {o.status}
                {o.status === "open" ? `, by ${hhmm(o.deadline)}` : ""}
              </div>
            ))}
            <button
              className="btn"
              disabled={!!busy}
              onClick={() => post("/api/cam/order", { buyer: "Anglian Water compliance", pointId: "grantchester-outfall", description: "independent strip sample at the outfall", priceUsd: 0.5, minutes: 60 }, "order")}
            >
              Place Anglian Water order
            </button>
          </Module>
          <Module label="Open bounties">
            {snap.bounties.length === 0 && <p style={{ fontSize: 13, margin: 0 }}>None open.</p>}
            {snap.bounties.map((b) => (
              <div key={b.id} style={{ fontSize: 12, marginBottom: 4, fontFamily: "var(--mono)" }}>
                {usd(b.priceUsd)} {b.kind} {b.status} {POINTS.find((p) => p.id === b.pointId)?.name}
              </div>
            ))}
          </Module>
        </div>
      </div>
    </>
  );
}
