# CamTreasurer: the river has a treasurer

Product requirements and build brief for a solo hackathon demo. Oxford and Cambridge AI Race, 25 Oct 2026. Submission by 18:30, pitches from 18:30. This file is the single source of truth to paste into Claude Code, together with the two drop-ins already supplied (lib/race/handlers.ts, lib/ai/gemini.ts).

## 1. One sentence

A wallet that makes hundreds of small, rule-bound spending decisions a day to keep the River Cam watched, every one verified before it pays, explained in plain English, and public.

The product is the decision stream. Funders write a mandate in plain English; the agent turns it into priced actions all day; the ledger shows what it decided and why. Samplers, test strips and labs are what the decisions buy.

## 2. Problem, with the numbers to say on stage

- English storm overflows spilled 291,492 times for 1.87 million hours in 2025 (Environment Agency, March 2026).
- The Environment Agency was late to attend 74% of serious pollution incidents (analysis, autumn 2025). By the time an officer arrives, the discharge has stopped and the evidence has gone.
- Overflow monitors sit on the pipe and say nothing about what reached the river. Continuous sondes cost thousands each and cover a handful of points.
- On this river: Cam Valley Forum volunteers run "Sewage Sleuthing"; Varsity reported Boat Race rowers at risk of sepsis and kidney failure from polluted water; a Cambridge councillor called a local sewage hotspot a risk to lives.
- National citizen science is big but scheduled: the Rivers Trust's Big River Watch draws thousands of volunteers twice a year; Riverfly volunteers sample monthly. Pollution does not wait for the survey weekend.

Gap in one line: monitors see the pipe, the regulator arrives late, volunteers sample on schedule. Nobody is on the bank in the hour that matters, and nobody is deciding, minute by minute, where a pound of monitoring money should go.

## 3. Why agent payments are structural here (the defence)

The key sentence: a human treasurer cannot make 500 priced decisions a day. A bank cannot give software a card with these rules on it. A wallet with a cap, a budget and verification before pay can, and a language model is what lets those decisions be about something as messy as a photo of a test strip and a councillor's sentence about rowers.

Concede first: in Britain a charity could pay volunteers by bank transfer. The point is that no person owns this budget, no person authorises any payment, and the payer and the verifier are software. Open Banking will not let software pay an unknown payee without a human; a wallet with rules will.

Four things with no conventional equivalent:
1. Software holding and spending a budget under enforceable rules, hundreds of times a day, with no account holder.
2. Verification before payment by a model, on evidence a bank cannot read.
3. A pooled fund with no owner, co-funded by parties who distrust each other (clubs, council, water company), readable by all of them.
4. Receipts that are provenance: timestamp, location, evidence hash and reason, on a ledger nobody can edit, usable by a regulator.

Scoped autonomy: code enforces the hard rules, the model judges inside them, humans set the mandate, approve escalations and can halt. Say "scoped autonomy" once.

## 4. Existing solutions and how this differs

| Existing | What it does | What it lacks |
|---|---|---|
| Event Duration Monitors on overflows (water companies, published live) | Says a spill started and how long | Nothing about what reached the river |
| Continuous water quality sondes (Environment Act duty, rolling out) | Precise readings at a few fixed points | Thousands per unit; gaps of kilometres between them |
| Environment Agency incident response | Attends and samples | Late to 74% of serious incidents; most reports never attended |
| Riverfly Partnership, FreshWater Watch, Big River Watch, Cam Valley Forum | Trained volunteers, kits, national datasets, strong goodwill | Scheduled (monthly, twice yearly, Sundays); no way to redirect effort to a point in the hour after an alert; unpaid, so coverage follows volunteer convenience |
| Surfers Against Sewage Safer Seas and Rivers map | Public alerts from overflow data | Alerts, not readings; cannot answer "what is in the water at my steps now" |
| Premise, Streetbees, Field Agent | Pay humans cents to pounds per photo task | A brand scopes a campaign; no agent decides minute by minute; no public receipts |
| WeatherXM, Ambient, Kiko Network (DePIN sensor networks) | Token rewards for owning a sensor | Fixed hardware, speculative tokens; no human-in-the-field tasks, no evidence verification |

What is new: an agent with a mandate that allocates a pooled budget across many points and many small purchases in real time, verifies each piece of evidence before paying, escalates to labs under rules, and publishes every decision with a reason. The volunteers remain the workforce; the agent makes them deployable in the hour that matters.

## 5. Do tiny payments motivate people?

Honest position for the pitch and the Q&A:
- Evidence cuts both ways. Behavioural economics warns that small payments can crowd out goodwill (Gneezy and Rustichini, "pay enough or don't pay at all"); yet Premise and similar networks have collected millions of geotagged photos for cents to a few dollars each, and DePIN networks have put hundreds of thousands of sensors in the field for tiny rewards.
- Design response: the payment is not the motive, it is the dispatch. Goodwill exists already (thousands of UK river volunteers). What goodwill lacks is a way to be told "here, now, this matters". The bounty is a priced, verified request that a phone can route to the nearest willing person. Price signals urgency; the money covers the strip and the walk.
- Pay enough to beat friction when it matters: in incident mode the agent raises bounties to pounds, not pence, because that is when a stranger must leave the path. Routine refreshes stay at pence and go to people already there.
- Let samplers choose: a toggle to donate earnings back to the river's pool, so volunteers keep their identity and the system keeps its dispatch and receipts.
- Reputation on the ledger: verified samples build a sampler's public record, which some volunteers value more than pence.

## 6. Roles

- The Treasurer (agent): holds the pooled devnet USDC budget, runs the decision loop, prices bounties, verifies evidence, pays, escalates, writes reasons.
- Funders (humans): clubs, council, residents; set the mandate in plain English, fund the pool, approve escalations, can halt. Seed three: CUBC, Jesus College Boat Club, Cambridge City Council.
- Bespoke buyers (agents or humans): place priced orders for private, urgent, specific evidence. Seed one: Anglian Water compliance, independent sample at Grantchester outfall within 60 minutes, 0.50 USDC.
- Samplers (anyone with a phone): claim a bounty with a small refundable bond, photograph a test strip with the one-time code in frame, get paid on verification.
- Observers: anyone can read the decision log and ledger.

## 7. Demo script (60 seconds plus demo)

0 to 10. "English rivers took 1.87 million hours of sewage last year; the Environment Agency is late to 74% of serious incidents. The Cam has volunteers who sample on Sundays. Pollution does not wait for Sunday."

10 to 22. Projector: the treasurer's dashboard. "Last 24 hours: 312 decisions, 2.84 USDC spent, 41 readings bought, 9 claims refused, 2 escalations, 1 human halt." Scroll the log for five seconds: "06:10 Sheep's Green, bought reading, 0.08, rowers out at 06:30, last reading 9h old." "06:14 Mill Pond, declined, reading 40 min old, demand low." "11:02 Byron's Pool, refused claim, photo is not a strip, bond forfeited." "11:40 escalated, lab bottle at Grantchester outfall, 2.00 above cap, waiting for a human."

22 to 45. Live. Trigger "Fish kill reported at Jesus Lock". Prices move on the river. Phone: claim Sheep's Green bounty (2p bond, real x402 payment), photograph the CLEAN strip image. Verified, paid, phone green, vibrates, speaks "Paid by the River Cam", explorer link. Prices move upstream. Phone: claim Byron's Pool, photograph the HIGH strip. Paid. Dashboard: "source narrowed to Byron's Pool to Grantchester outfall; lab bottle 2.00 needs a human". Phone red. Shake. Green. Second payment.

45 to 53. "A human treasurer cannot make 500 priced decisions a day. A bank cannot give software a card with these rules. A wallet with a cap, a budget and verification before pay can. That is the job agent payments were built for."

53 to 60. "Three weeks in Cambridge, running on devnet tonight, every transaction on the explorer. I am not leaving."

Backup: screen recording of the full flow, made by 18:05.

## 8. Scope

Must ship:
1. Mandate object: plain text plus compiled parameters (per-payment cap, daily budget, per-point daily cap, per-sampler daily cap, min confidence, escalation threshold, blackout hours, point priorities with weights).
2. Decision loop: every tick, for each point, decide buy / decline / hold with a priced bounty and a one-line reason; incident mode adds the source-search posterior.
3. Startup simulation: one synthetic day (40 points scaled to 8 for the display, synthetic samplers, one incident) producing roughly 300 decisions with reasons; a batch of 6 to 10 real devnet payments pre-signed at startup so the dashboard opens with real signatures.
4. Phone page: bounties near me, claim (x402 bond), camera, states (pending, paid, refused, needs approval), speech and vibration, shake-to-approve.
5. Gemini vision verification of strip photos with the one-time code.
6. Payment on verification: direct devnet USDC transfer, memo `cam:<point>:<evidenceHash16>:<result>`, through the spending tracker; payout = bounty + bond refund.
7. Escalation: lab bounty above the cap, held until a human shakes.
8. Dashboard: decision counters, scrolling decision log with reasons, river SVG with bounty prices, funders panel with mandate text and pooled balance, bespoke orders panel, budget bar.
9. Ledger page: every payment in and out with explorer links.
10. Race adapter handlers (already delivered).

Out of scope: real maps, persistence beyond process memory, auth, real lab integration, multiple sampler wallets (one hard-coded sampler wallet), atomic revenue splits (roadmap).

## 9. Architecture (Next.js 16 starter, App Router)

Reuse from the scaffold, do not rewrite: `lib/ai/gemini.ts` (delivered version with `askGeminiJson`), `lib/payments/{client,transfer,config,server}.ts`, `lib/spending/{policy,tracker,attach}.ts`, `lib/paidapi/buyer.ts`, `app/api/premium/route.ts` (pattern for `paidRoute`), `lib/race/*`, `app/agent-studio/v1/*`.

New files:

```
lib/cam/points.ts            8 access points: id, name, kmUpstream, lat, lng
lib/cam/mandate.ts           Mandate type, seed mandate text, compiled params, compileMandate(text) via askGeminiJson (human approves before apply)
lib/cam/state.ts             in-memory singleton: mandate, funders, orders, bounties, claims, samples, decisions, ledger, posterior, pendingApprovals
lib/cam/decide.ts            the loop: for each point compute urgency (staleness, priority weight, open orders, posterior info gain), price within caps, emit Decision {time, point, action, price, reason}
lib/cam/pricing.ts           price formula and posterior update (clean at k zeroes downstream intervals, bad at k zeroes upstream; renormalise)
lib/cam/verify.ts            Gemini vision: {isStrip, codeVisible, codeMatches, nitrate, ammonia, result, confidence}
lib/cam/pay.ts               payUsdc with tracker guard; records ledger entry; explorer link
lib/cam/simulate.ts          synthetic day: generates decisions, samples and refusals with reasons; triggers N real payments at startup (N from env SIM_REAL_PAYMENTS, default 6)
lib/cam/reasons.ts           askGemini for one-line reasons when needed; template fallback so the loop never blocks on the model
app/api/cam/state/route.ts         GET full state (dashboard and phone poll)
app/api/cam/incident/route.ts      POST start incident
app/api/cam/tick/route.ts          POST run one decision tick (dashboard calls every 3 s in demo; also run on a timer server-side)
app/api/cam/claim/route.ts         GET ?bounty=<id> behind paidRoute, price 0.02 USDC, pay-to the river wallet; returns {claimId, code}
app/api/cam/submit/route.ts        POST {claimId, imageBase64} -> verify -> pay or refuse
app/api/cam/approve/route.ts       POST {bountyId} human approval (shake)
app/api/cam/order/route.ts         GET list, POST bespoke order
app/api/cam/mandate/route.ts       GET, POST {text} -> compiled proposal, POST /apply
app/api/cam/ledger/route.ts        GET payments with explorer links
app/cam/page.tsx                   dashboard
app/cam/phone/page.tsx             sampler phone
app/cam/ledger/page.tsx            public ledger
public/strips/clean.jpg, high.jpg, shoe.jpg
```

### 9.1 Points
Downstream to upstream, km from Jesus Lock: Jesus Lock 0.0, Mill Pond 1.2, Sheep's Green 1.8, Newnham 2.4, Grantchester Meadows 3.6, Byron's Pool 4.8, Grantchester outfall 5.4, Haslingfield 7.5. Approximate lat and lng.

### 9.2 Mandate (seed)
Text: "Keep the rowing reach from Jesus Lock to Newnham fresh before dawn outings (reading under 3 hours old by 06:00). After rain or any overflow alert, prioritise Grantchester outfall and Byron's Pool. Spend at most 5 USDC a day, never more than 1 USDC on one purchase without a human, no bounties after dark, at most 5 paid claims per sampler per day. Buy a lab bottle when two upstream strips read high."
Compiled params: dailyBudgetUsd 5, maxPaymentUsd 1, perPointDailyUsd 1.5, perSamplerDaily 5, minConfidence 0.6, blackout 19:00 to 06:00, priorities {sheeps-green 1.5, mill-pond 1.2, newnham 1.2, grantchester-outfall 1.4 (2.0 after alert), byrons-pool 1.0 (1.8 after alert)}, labTrigger: two high readings upstream of a clean one.

### 9.3 Decision loop
Each tick, per point: staleness = hours since last verified reading; urgency = priority weight times min(staleness/targetFreshness, 2) plus sum of open order prices at the point plus incident info gain. If urgency below threshold: decision "decline" with reason. Else price = clamp(base 0.05 + 0.04 times urgency, 0.02, maxPaymentUsd); post or update bounty; decision "buy" with reason. If a lab trigger is met: decision "escalate", lab bounty 2.00 in `needs_approval`. Reasons: template first ("Sheep's Green: last reading 9h old, rowers out at 06:30, buying at 0.08"); call Gemini only for the incident narrative lines.

### 9.4 Verification
`verifyStrip(imageBase64, expectedCode)` via `askGeminiJson` with an image part. Refuse if not a strip or confidence below minConfidence. For the printed demo images, log the code match but do not enforce it (document this).

### 9.5 Payment and bond
Claim: `/api/cam/claim?bounty=<id>` is wrapped like `/api/premium` (402, 0.02 USDC, pay-to river wallet). The phone page uses the scaffold's client paying fetch pattern via a server proxy `/api/cam/claim-proxy` that pays from SAMPLER_PRIVATE_KEY (second keypair) so the phone never holds keys. On verified submit: `payUsdc(riverSigner, {to: SAMPLER_WALLET, amountUsdc: bounty.price + 0.02, memo})` with `guard: tracker`. On refuse: bond kept, ledger entry "bond forfeited". Above cap: tracker refuses, bounty becomes `needs_approval`; `/api/cam/approve` pays via a one-off tracker with maxPaymentUsd = price (document as the human override).

### 9.6 Phone page
Polls state every 700 ms. Lists open bounties by price with distance from a hard-coded "you are here" (Sheep's Green). Claim shows the one-time code large. Camera via file input with capture, downscale to 800 px. States: pending amber; paid full-screen green, vibrate [200,100,200], speak "Paid by the River Cam, <price> USDC", explorer link; refused red, long vibrate, speak reason; needs_approval red "shake to approve". Shake: devicemotion magnitude above 25 twice within a second posts approve. One tap on load unlocks speech. HTTPS via tunnel.

### 9.7 Dashboard
Top counters from decisions (24h): decisions, spent, readings bought, refused, escalations, halts. Left: river SVG, dots sized by bounty price, labels. Centre: scrolling decision log (newest first, reason lines). Right: funders panel (names, pooled balance, mandate text, "propose change" box that shows the compiled diff for approval), bespoke orders, budget bar (spent vs daily budget), pending approvals. Buttons: "Report incident at Jesus Lock", "Run tick", "Reset day".

## 10. Environment

```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-latest
AGENT_PRIVATE_KEY=           river treasurer wallet (needs devnet SOL and USDC)
PAY_TO_ADDRESS=              set to the river wallet's public address (bonds land in the river)
SAMPLER_PRIVATE_KEY=         second keypair for the demo sampler (needs devnet USDC for bonds, SOL not needed for x402)
SAMPLER_WALLET=              its public address
AGENT_BUDGET_USD=5.00
MAX_PAYMENT_USD=1.00
PAID_API_PRICE_USD=0.02
SIM_REAL_PAYMENTS=6
AGENT_STUDIO_VERIFIER_TOKEN=
AGENT_STUDIO_APP_NAME=CamTreasurer
X402_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
```

Funding: faucet.solana.com (SOL for the river wallet), faucet.circle.com Solana Devnet (USDC for river and sampler). `npm run wallets`. Tunnel: `npx cloudflared tunnel --url http://localhost:3000`; URL on the team page; phone opens `<url>/cam/phone`.

## 11. Build order (16:50 to 18:30)

1. 16:50 to 17:10. points, mandate (seed only, compile later), state, pricing, decide, simulate (synthetic decisions, no payments yet); `/api/cam/state`, `/tick`, `/incident`. Dashboard counters and log as a plain list. Check: 300 decisions with reasons appear.
2. 17:10 to 17:30. verify.ts; `/claim` behind paidRoute and `/claim-proxy`; `/submit` refuse path; test with the three images.
3. 17:30 to 17:50. pay.ts; verified path pays; SIM_REAL_PAYMENTS at startup; `/approve`; `/ledger`. Confirm real signatures on the explorer.
4. 17:50 to 18:10. Phone page complete (claim, camera, states, speech, shake). River SVG, funders panel, orders panel, budget bar.
5. 18:10 to 18:20. Mandate compile endpoint (Gemini) and the propose-change box. Record backup video. Submit.
6. 18:20 to 18:30. Rehearse twice. Open explorer links in tabs beforehand.

If behind at 17:55: drop mandate compile (show text only), drop the SVG (table), keep the bond, the live payment, the refusal and the shake.

## 12. Acceptance criteria

- Startup shows roughly 300 decisions with reasons and at least 6 real devnet signatures in the ledger.
- Incident changes prices and the posterior; the log says why.
- Claiming a bounty makes a real x402 payment of 0.02 from sampler to river; the one-time code appears.
- Submitting clean.jpg pays bounty plus bond, phone green, speaks, explorer link resolves.
- Submitting high.jpg upstream triggers the lab escalation in needs_approval; shake approves and pays.
- Submitting shoe.jpg refuses, bond forfeited, reason shown.
- Funders panel shows mandate text, pooled balance and spend; bespoke order visible.
- `npm run race:try -- respond "What is 6 x 7?"` returns 42; health returns ready.

## 13. Race submission text

Title: CamTreasurer, the river has a treasurer

Problem statement: English rivers took 1.87 million hours of sewage spills in 2025 and the Environment Agency is late to 74% of serious incidents, so the evidence is gone before anyone arrives, while thousands of river volunteers sample on fixed schedules. CamTreasurer gives the River Cam a wallet that makes hundreds of small, rule-bound spending decisions a day: it reads a plain-English mandate from its funders (rowing clubs, the council, residents), decides minute by minute where a reading is worth buying, posts priced bounties that anyone's phone can claim, verifies each test strip photo with Gemini before paying in USDC, moves money upstream to hunt the source after an incident, and escalates to a lab bottle that a human must approve. Every decision has a reason and every payment is a public receipt with the evidence hash; nobody owns the account. Scoped autonomy: code enforces caps, budget, blackout and verification; the model judges inside them; humans set the mandate and can halt.

## 14. Pocket lines

- Why not a bank: "A human treasurer cannot make 500 priced decisions a day. A bank cannot give software a card with these rules. A wallet with a cap, a budget and verification before pay can."
- Sensors: "They tell you a spill happened. This decides, every few minutes, where the next pound of monitoring goes."
- Volunteers: "They are the workforce. This is the dispatcher that can finally tell them here, now, this matters, and cover the strip."
- Tiny payments: "In incident mode it pays pounds, because that is when someone has to leave the path. Routine refreshes pay pence to people already there, and anyone can donate earnings back."
- Photos: "The AI reads a strip with a code in frame, not the water. Bacteria needs a lab, so the river buys a bottle when strips look bad, and a human approves that."
- Commons: "Rowers fund the pool; they do not buy answers. Bespoke buyers with private, urgent needs pay per order."
- Same treasurer elsewhere: a parish council's flood fund, a charity's grant pot, a lab's sample budget.

## 15. Implementation notes for Claude Code (read before step 1)

1. Inputs you have: the generated Next.js project (unzipped, `npm install` done, `.env.local` filled), plus two drop-in files supplied alongside this brief that replace `lib/race/handlers.ts` and `lib/ai/gemini.ts`. Copy them in first. Do not modify other scaffold files except where this brief says to add routes.

2. Gemini vision: `askGeminiJson` in the drop-in takes a text prompt only. Add to `lib/ai/gemini.ts`:
```ts
export async function askGeminiVisionJson<T = unknown>(prompt: string, imageBase64: string, mimeType = "image/jpeg", schema?: Record<string, unknown>): Promise<T> {
  const response = await getClient().models.generateContent({
    model: model(),
    contents: [{ role: "user", parts: [{ text: prompt + (schema ? `\n\nReturn ONLY JSON matching: ${JSON.stringify(schema)}` : "\n\nReturn ONLY JSON.") }, { inlineData: { mimeType, data: imageBase64 } }] }],
    config: { temperature: 0, responseMimeType: "application/json" },
  });
  return extractJson(response.text ?? "") as T;
}
```
Strip the `data:image/...;base64,` prefix before passing.

3. Paid routes: copy the pattern in `app/api/premium/route.ts` exactly (`paidRoute(handler, () => ({ price: "$0.02", description }))`, `export const dynamic = "force-dynamic"`). The pay-to address comes from `PAY_TO_ADDRESS`; set it to the river wallet's public key so bonds land in the river.

4. Second signer for the sampler: add `loadSamplerSigner()` in `lib/cam/pay.ts` that mirrors `loadAgentSigner()` but reads `SAMPLER_PRIVATE_KEY`. `/api/cam/claim-proxy` builds a paying fetch from it (`createPayingFetch(createPaymentClient(samplerSigner))`, no spending tracker needed) and calls the local `/api/cam/claim?bounty=...` URL (`new URL(req.url).origin`). Generate the sampler keypair with the same method `scripts/keygen.ts` uses (print base58 secret and public address), and fund it with devnet USDC from faucet.circle.com.

5. Demo images: do not wait for real photos. Generate `public/strips/clean.jpg`, `high.jpg` and `shoe.jpg` programmatically with the `canvas` npm package or by writing SVGs and converting with `sharp`: a white strip with five coloured pads (clean: pale yellow and pale pink; high: dark orange ammonia pad and deep pink nitrate pad) next to a handwritten-looking code "CAM-4821", and a shoe as a grey blob. The phone page also accepts a real camera photo.

6. Timers in Next.js dev: do not rely on `setInterval` in a module. Run the decision tick lazily inside `GET /api/cam/state` when more than 3 seconds have passed since the last tick, and run the startup simulation lazily on the first state call (guard with a module-level promise). Real startup payments (`SIM_REAL_PAYMENTS`) run once, sequentially, inside that same guard; failures are logged and must not block the dashboard.

7. Explorer links: `https://explorer.solana.com/tx/<signature>?cluster=devnet`. Show them as links in the log and ledger and as text under the phone's green state.

8. Spending tracker: there is one `getSpendingTracker()` singleton in `lib/paidapi/buyer.ts`; reuse it as the guard for `payUsdc` so the budget bar reflects both bounties and anything the river buys. For the human override, construct `new SpendingTracker({ budgetMicros: remaining, maxPaymentMicros: priceMicros })` for that one payment.

9. Phone page must be a client component (`"use client"`), use `navigator.vibrate`, `speechSynthesis`, `window.addEventListener("devicemotion", ...)`, and work over the HTTPS tunnel URL. Hard-code "you are here" as Sheep's Green.

10. Kick-off prompt to use: "Read CamHunt_PRD_and_Build_Brief.md fully. Copy the two drop-ins in. Build section 9 in the order of section 11, following section 15. After step 3, stop and show me the ledger with real devnet signatures and one successful 402 claim before continuing. Typecheck with `npm run typecheck` after each step. No em dashes in any UI text."

## 16. Sources

Environment Agency storm overflow data 2025; Express and Star analysis of EA attendance (74%); Cam Valley Forum Sewage Sleuthing; Varsity on Boat Race rowers; Rivers Trust Big River Watch; Riverfly Partnership; Gneezy and Rustichini (2000) "Pay enough or don't pay at all"; Premise; WeatherXM.
