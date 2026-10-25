"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POINT_BY_ID, YOU_ARE_HERE, distanceKm } from "@/lib/cam/points";
import type { Bounty, PendingApproval } from "@/lib/cam/state";

type PhoneState = {
  now: number;
  incident: { pointId: string; description: string } | null;
  bounties: Bounty[];
  pendingApprovals: PendingApproval[];
  halted: boolean;
};

type ClaimInfo = { claimId: string; code: string; bountyId: string; pointId: string; priceUsd: number; bondUsd: number; bondSignature: string | null; bondExplorerUrl: string | null };

type Phase =
  | { kind: "idle" }
  | { kind: "claiming" }
  | { kind: "claimed"; claim: ClaimInfo }
  | { kind: "pending"; claim: ClaimInfo }
  | { kind: "paid"; claim: ClaimInfo; amountUsd: number; explorerUrl: string; summary: string }
  | { kind: "refused"; claim: ClaimInfo; reason: string }
  | { kind: "needs_approval"; reason: string }
  | { kind: "approved"; amountUsd: number; explorerUrl: string }
  | { kind: "error"; message: string };

function speak(text: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    window.speechSynthesis.speak(u);
  } catch {}
}

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

async function fileToBase64(file: Blob, maxPx = 800): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

const BG: Record<string, string> = { paid: "#10a36d", approved: "#10a36d", refused: "#c2361f", needs_approval: "#c2361f", pending: "#e0a100", error: "#c2361f" };

export default function PhonePage() {
  const [unlocked, setUnlocked] = useState(false);
  const [state, setState] = useState<PhoneState | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [approving, setApproving] = useState(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const approvingRef = useRef(false);
  const shakeTimes = useRef<number[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/cam/state?view=phone", { cache: "no-store" });
        if (!r.ok) return;
        const s = (await r.json()) as PhoneState;
        if (!alive) return;
        setState(s);
        const p = phaseRef.current;
        if (s.pendingApprovals.length > 0 && p.kind !== "needs_approval" && p.kind !== "pending" && p.kind !== "claiming" && p.kind !== "approved") {
          const pa = s.pendingApprovals[0];
          setPhase({ kind: "needs_approval", reason: pa.reason });
          buzz([600]);
          speak(`${pa.priceUsd.toFixed(2)} USDC needs a human. Shake to approve.`);
        }
      } catch {}
    };
    void poll();
    const t = setInterval(poll, 700);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const approve = useCallback(async () => {
    if (approvingRef.current) return;
    approvingRef.current = true;
    setApproving(true);
    try {
      const r = await fetch("/api/cam/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ who: "funder on the phone" }) });
      const d = await r.json();
      if (!r.ok) {
        setPhase({ kind: "error", message: d.error ?? "Approval failed" });
        speak("Approval failed");
        return;
      }
      setPhase({ kind: "approved", amountUsd: d.amountUsd, explorerUrl: d.explorerUrl });
      buzz([200, 100, 200]);
      speak(`Approved. Paid by the River Cam, ${Number(d.amountUsd).toFixed(2)} USDC.`);
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      approvingRef.current = false;
      setApproving(false);
    }
  }, []);

  useEffect(() => {
    const onMotion = (ev: DeviceMotionEvent) => {
      if (phaseRef.current.kind !== "needs_approval") return;
      const a = ev.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
      if (mag < 25) return;
      const now = Date.now();
      shakeTimes.current = shakeTimes.current.filter((t) => now - t < 1000);
      shakeTimes.current.push(now);
      if (shakeTimes.current.length >= 2) {
        shakeTimes.current = [];
        void approve();
      }
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [approve]);

  async function unlock() {
    setUnlocked(true);
    speak("River Cam ready");
    try {
      const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof DME.requestPermission === "function") await DME.requestPermission();
    } catch {}
  }

  async function claim(b: Bounty) {
    setPhase({ kind: "claiming" });
    try {
      const r = await fetch("/api/cam/claim-proxy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bountyId: b.id }) });
      const d = await r.json();
      if (!r.ok) {
        setPhase({ kind: "error", message: d.error ?? "Claim failed" });
        buzz([400]);
        return;
      }
      setPhase({ kind: "claimed", claim: d as ClaimInfo });
      buzz([80]);
      speak(`Claimed. Your code is ${String(d.code).replace("CAM-", "").split("").join(" ")}.`);
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function submit(claim: ClaimInfo, imageBase64: string, demoLabel?: string) {
    setPhase({ kind: "pending", claim });
    try {
      const r = await fetch("/api/cam/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claimId: claim.claimId, imageBase64, demoLabel }) });
      const d = await r.json();
      if (!r.ok) {
        setPhase({ kind: "error", message: d.error ?? `Submit failed (${r.status})` });
        buzz([600]);
        speak("Something went wrong");
        return;
      }
      if (d.status === "paid") {
        setPhase({ kind: "paid", claim, amountUsd: d.amountUsd, explorerUrl: d.explorerUrl, summary: d.verdict?.summary ?? "" });
        buzz([200, 100, 200]);
        speak(`Paid by the River Cam, ${Number(d.amountUsd).toFixed(2)} USDC.`);
      } else if (d.status === "refused") {
        setPhase({ kind: "refused", claim, reason: d.reason });
        buzz([700]);
        speak(`Refused. ${d.reason}`);
      } else if (d.status === "needs_approval") {
        setPhase({ kind: "needs_approval", reason: d.reason });
        buzz([600]);
        speak("Above the cap. Shake to approve.");
      }
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function onFile(ev: React.ChangeEvent<HTMLInputElement>, claim: ClaimInfo) {
    const f = ev.target.files?.[0];
    if (!f) return;
    const b64 = await fileToBase64(f);
    await submit(claim, b64);
  }

  async function useDemo(claim: ClaimInfo, name: "clean" | "high" | "shoe") {
    const blob = await (await fetch(`/strips/${name}.jpg`)).blob();
    const b64 = await fileToBase64(blob);
    await submit(claim, b64, name);
  }

  const bounties = (state?.bounties ?? [])
    .filter((b) => b.kind === "strip" && b.status === "open")
    .map((b) => ({ ...b, km: distanceKm(YOU_ARE_HERE, b.pointId) }))
    .sort((a, b) => b.priceUsd - a.priceUsd);

  const full = (bg: string, children: React.ReactNode) => (
    <div style={{ position: "fixed", inset: 0, background: bg, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", zIndex: 50 }}>{children}</div>
  );

  if (!unlocked) {
    return (
      <div onClick={unlock} style={{ position: "fixed", inset: 0, background: "#161616", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 14, letterSpacing: 2, opacity: 0.7 }}>CAMTREASURER</div>
        <div style={{ fontSize: 34, fontWeight: 700, marginTop: 8 }}>Sample the Cam</div>
        <div style={{ fontSize: 16, marginTop: 20, opacity: 0.8 }}>Tap once to start (unlocks speech and motion)</div>
      </div>
    );
  }

  if (phase.kind === "paid")
    return full(BG.paid, (
      <>
        <div style={{ fontSize: 22, opacity: 0.85 }}>Paid by the River Cam</div>
        <div style={{ fontSize: 64, fontWeight: 800 }}>{phase.amountUsd.toFixed(2)}</div>
        <div style={{ fontSize: 18 }}>USDC to your wallet for {POINT_BY_ID[phase.claim.pointId]?.name}</div>
        {phase.summary && <div style={{ fontSize: 14, marginTop: 10, opacity: 0.9 }}>{phase.summary}</div>}
        <a href={phase.explorerUrl} target="_blank" rel="noreferrer" style={{ color: "#fff", marginTop: 20, fontSize: 13, wordBreak: "break-all", textDecoration: "underline" }}>
          {phase.explorerUrl}
        </a>
        <button onClick={() => setPhase({ kind: "idle" })} style={btn("#fff", "#10a36d")}>
          Next bounty
        </button>
      </>
    ));
  if (phase.kind === "approved")
    return full(BG.approved, (
      <>
        <div style={{ fontSize: 22, opacity: 0.85 }}>Approved and paid</div>
        <div style={{ fontSize: 64, fontWeight: 800 }}>{phase.amountUsd.toFixed(2)}</div>
        <div style={{ fontSize: 18 }}>USDC lab bottle, human override</div>
        <a href={phase.explorerUrl} target="_blank" rel="noreferrer" style={{ color: "#fff", marginTop: 20, fontSize: 13, wordBreak: "break-all", textDecoration: "underline" }}>
          {phase.explorerUrl}
        </a>
        <button onClick={() => setPhase({ kind: "idle" })} style={btn("#fff", "#10a36d")}>
          Done
        </button>
      </>
    ));
  if (phase.kind === "refused")
    return full(BG.refused, (
      <>
        <div style={{ fontSize: 40, fontWeight: 800 }}>Refused</div>
        <div style={{ fontSize: 18, marginTop: 12 }}>{phase.reason}</div>
        <div style={{ fontSize: 14, marginTop: 8, opacity: 0.85 }}>Bond of {phase.claim.bondUsd.toFixed(2)} USDC forfeited to the river.</div>
        <button onClick={() => setPhase({ kind: "idle" })} style={btn("#fff", "#c2361f")}>
          Back
        </button>
      </>
    ));
  if (phase.kind === "needs_approval")
    return full(BG.needs_approval, (
      <>
        <div style={{ fontSize: 16, letterSpacing: 2, opacity: 0.8 }}>ABOVE THE CAP</div>
        <div style={{ fontSize: 44, fontWeight: 800, marginTop: 8 }}>{approving ? "Paying..." : "Shake to approve"}</div>
        <div style={{ fontSize: 15, marginTop: 14, opacity: 0.9 }}>{phase.reason}</div>
        <button disabled={approving} onClick={() => void approve()} style={{ ...btn("#fff", "#c2361f"), opacity: approving ? 0.6 : 1 }}>
          {approving ? "Approving..." : "Tap to approve instead"}
        </button>
        <button disabled={approving} onClick={() => setPhase({ kind: "idle" })} style={{ ...btn("transparent", "#fff"), borderColor: "#fff", boxShadow: "none", fontSize: 14, padding: "10px 14px" }}>
          Not now
        </button>
      </>
    ));
  if (phase.kind === "pending")
    return full(BG.pending, (
      <>
        <div style={{ fontSize: 34, fontWeight: 800 }}>Checking your strip</div>
        <div style={{ fontSize: 16, marginTop: 10 }}>Gemini is reading the pads and the code. Payment follows if it verifies.</div>
      </>
    ));
  if (phase.kind === "error")
    return full(BG.error, (
      <>
        <div style={{ fontSize: 30, fontWeight: 800 }}>Problem</div>
        <div style={{ fontSize: 15, marginTop: 10, wordBreak: "break-word" }}>{phase.message}</div>
        <button onClick={() => setPhase({ kind: "idle" })} style={btn("#fff", "#c2361f")}>
          Back
        </button>
      </>
    ));

  if (phase.kind === "claimed") {
    const c = phase.claim;
    return (
      <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Claimed at {POINT_BY_ID[c.pointId]?.name}, bounty {c.priceUsd.toFixed(2)} USDC plus your {c.bondUsd.toFixed(2)} bond back</div>
        <div style={{ fontSize: 14, marginTop: 14 }}>Write this code on paper next to the strip:</div>
        <div style={{ fontSize: 64, fontWeight: 800, fontFamily: "var(--mono)", letterSpacing: 2, margin: "6px 0 14px" }}>{c.code}</div>
        {c.bondExplorerUrl && (
          <a href={c.bondExplorerUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontFamily: "var(--mono)" }}>
            bond paid over x402, tx {c.bondSignature?.slice(0, 10)}...
          </a>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => void onFile(e, c)} />
        <button onClick={() => fileRef.current?.click()} style={btn("#5a3cf0", "#fff", true)}>
          Photograph the strip
        </button>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 16 }}>Demo images</div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button onClick={() => void useDemo(c, "clean")} style={btn("#fff", "#161616")}>
            Clean strip
          </button>
          <button onClick={() => void useDemo(c, "high")} style={btn("#fff", "#161616")}>
            High strip
          </button>
          <button onClick={() => void useDemo(c, "shoe")} style={btn("#fff", "#161616")}>
            A shoe
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ fontSize: 12, letterSpacing: 2, color: "var(--muted)" }}>BOUNTIES NEAR YOU</div>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>You are at Sheep's Green{state?.incident ? `. Incident: ${state.incident.description}` : ""}</div>
      {state?.halted && <div style={{ color: "var(--fault)", fontSize: 13, marginTop: 6 }}>Spending is halted by a funder.</div>}
      {(state?.pendingApprovals.length ?? 0) > 0 && (
        <div style={{ marginTop: 12, padding: 12, background: "#c2361f", color: "#fff", border: "2px solid #161616", boxShadow: "3px 3px 0 #161616" }}>
          <div style={{ fontSize: 13, letterSpacing: 1 }}>WAITING FOR A HUMAN</div>
          <div style={{ fontSize: 15, marginTop: 4 }}>{state!.pendingApprovals[0].priceUsd.toFixed(2)} USDC above the cap. Shake the phone, or tap.</div>
          <button disabled={approving} onClick={() => void approve()} style={{ ...btn("#fff", "#c2361f"), marginTop: 10, width: "100%" }}>
            {approving ? "Approving..." : "Tap to approve"}
          </button>
        </div>
      )}
      {phase.kind === "claiming" && <div style={{ marginTop: 12 }}>Paying the 0.02 bond over x402...</div>}
      {bounties.length === 0 && phase.kind === "idle" && <div style={{ marginTop: 16, fontSize: 15 }}>No open bounties right now. The treasurer posts one when a reading is worth buying.</div>}
      {bounties.map((b) => (
        <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--hairline)" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{POINT_BY_ID[b.pointId]?.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {b.km === 0 ? "here" : `${b.km.toFixed(1)} km away`} · {b.reason.split(". ")[0]}
            </div>
          </div>
          <button disabled={phase.kind === "claiming"} onClick={() => void claim(b)} style={{ ...btn("#5a3cf0", "#fff"), marginTop: 0, minWidth: 92 }}>
            {b.priceUsd.toFixed(2)}
          </button>
        </div>
      ))}
    </div>
  );
}

function btn(bg: string, fg: string, wide = false): React.CSSProperties {
  return { marginTop: 18, background: bg, color: fg, border: "2px solid #161616", padding: "14px 18px", fontSize: 18, fontWeight: 700, width: wide ? "100%" : undefined, boxShadow: "3px 3px 0 #161616", cursor: "pointer" };
}
