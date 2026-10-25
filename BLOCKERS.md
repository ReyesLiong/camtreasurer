# Blockers and fallbacks

Written during the build on 25 Oct 2026. Both items below need an action outside the code.

## 1. GEMINI_API_KEY is a placeholder

`.env.local` still holds the placeholder text for `GEMINI_API_KEY` (it starts with `<pas` and contains a space). Google answers `API_KEY_INVALID`. This blocks strip verification (`/api/cam/submit`), the incident narrative, mandate compilation and the race handlers (`npm run race:try`).

Fix: paste the real key from Google AI Studio into `.env.local` and restart `npm run dev`.

Fallback while it is broken: set `CAM_SIMULATE_VERIFY=1` in `.env.local`. Verification then uses a stand-in verdict that is labelled "simulated verification" in the decision log and on the phone. The phone's demo buttons pass which demo image they used (clean, high or shoe) so the stand-in treats them correctly; a real camera photo is treated as a clean strip. The template incident narrative is used instead of Gemini's. Mandate compilation has no fallback and reports the error.

## 2. The river wallet has no devnet SOL

`AGENT_PRIVATE_KEY` (address `6raRNk2xoVewCzMqVYAsyEmNeDkrrRhDFkv2ziyeL8jt`) holds 20 devnet USDC but 0 SOL, so every direct `payUsdc` transfer fails with "no record of a prior credit". The RPC airdrop returned an internal error. The x402 bond (sampler to river) still works because the facilitator pays those fees, so the ledger already carries one real signature.

Fix: request devnet SOL for that address at https://faucet.solana.com, then press "Reset day" on the dashboard (or restart the dev server). The startup payments (`SIM_REAL_PAYMENTS`, default 6) run again and the live payouts work.

## Other notes

- `PAY_TO_ADDRESS` was changed to the river wallet's address so bonds land in the river (brief section 10 and 15.3). The previous value is in the scratchpad backup `env.local.bak`.
- The `canvas` and `sharp` packages were not installed; the demo images were rendered from SVG with macOS QuickLook (`qlmanage`) and `sips`.
