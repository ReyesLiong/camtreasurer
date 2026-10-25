"use client";

import { useEffect, useState } from "react";
import { Module, PageHeader } from "@/components/ui";
import { POINT_BY_ID } from "@/lib/cam/points";
import type { Funder, LedgerEntry } from "@/lib/cam/state";

type LedgerView = {
  pooledBalanceUsd: number;
  totals: { entries: number; real: number; simulated: number; outUsd: number; inUsd: number };
  funders: Funder[];
  simulation: { status: string; detail: string; realPayments: number };
  entries: LedgerEntry[];
};

function when(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export default function LedgerPage() {
  const [view, setView] = useState<LedgerView | null>(null);
  const [onlyReal, setOnlyReal] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/cam/ledger", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: LedgerView) => setView(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  if (!view) {
    return (
      <>
        <PageHeader eyebrow="CamTreasurer" title="Public ledger" />
        <Module label="Loading">
          <p>Loading...</p>
        </Module>
      </>
    );
  }

  const entries = onlyReal ? view.entries.filter((e) => e.signature) : view.entries;

  return (
    <>
      <PageHeader eyebrow="CamTreasurer" title="Public ledger">
        <div className="row">
          <a className="btn" href="/cam">
            Dashboard
          </a>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={onlyReal} onChange={(e) => setOnlyReal(e.target.checked)} /> real devnet transactions only
          </label>
        </div>
      </PageHeader>
      <Module label="Totals" right={<span>{view.pooledBalanceUsd.toFixed(2)} USDC pooled</span>}>
        <p style={{ fontSize: 13, margin: 0 }}>
          {view.totals.entries} entries, {view.totals.real} with a real devnet signature, {view.totals.simulated} simulated from the startup day. Out {view.totals.outUsd.toFixed(2)} USDC, in {view.totals.inUsd.toFixed(2)} USDC.
          Funders: {view.funders.map((f) => `${f.name} ${f.contributedUsd.toFixed(2)}`).join(", ")}. Startup payments: {view.simulation.status}, {view.simulation.detail}.
        </p>
      </Module>
      <Module label="Payments, newest first">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                <th>time</th>
                <th>dir</th>
                <th>USDC</th>
                <th>kind</th>
                <th>point</th>
                <th>from</th>
                <th>to</th>
                <th>memo</th>
                <th>transaction</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid var(--hairline)" }}>
                  <td style={{ fontFamily: "var(--mono)" }}>{when(e.time)}</td>
                  <td style={{ color: e.direction === "out" ? "var(--fault)" : "var(--ok-text)" }}>{e.direction}</td>
                  <td style={{ fontFamily: "var(--mono)" }}>{e.amountUsd.toFixed(2)}</td>
                  <td>{e.kind.replace("_", " ")}</td>
                  <td>{e.pointId ? POINT_BY_ID[e.pointId]?.name ?? e.pointId : ""}</td>
                  <td style={{ fontFamily: "var(--mono)" }}>{e.from.slice(0, 12)}</td>
                  <td style={{ fontFamily: "var(--mono)" }}>{e.to.slice(0, 12)}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{e.memo}</td>
                  <td>
                    {e.explorerUrl ? (
                      <a href={e.explorerUrl} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                        {e.signature?.slice(0, 10)}... explorer
                      </a>
                    ) : (
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>simulated</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Module>
    </>
  );
}
