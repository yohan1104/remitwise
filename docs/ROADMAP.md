# 🗺️ RemitWise Roadmap (beyond the MVP)

The hackathon MVP is deliberately focused: **receive → auto-save on-chain →
goals → insights**. Here's where it goes next.

## ✅ Already shipped in the MVP
- **Deployed Soroban savings vault** that enforces the auto-save split on-chain.
- **Real USDC settlement** — every remittance is a real Stellar transaction with
  a verifiable hash; savings are held by the contract.
- **Encrypted custodial keys** + fail-fast production secrets.

## Near term
- **Real on-chain remittance detection** — subscribe to the Horizon payment
  stream and call `receiveRemittance()` on live USDC payments (the engine is
  already shaped for this; only the trigger changes).
- **Non-custodial signing** — integrate Freighter / WalletConnect so users
  hold their own keys; remove secret storage entirely.
- **Managed auth** — swap to Clerk or Supabase Auth (single integration point
  in `lib/auth`).
- **Withdrawals & off-ramp** — cash out to bank/e-wallet via a Stellar anchor (SEP-24).

## Mid term
- **Vault v2** — per-goal on-chain sub-vaults, time-locks, and claimable
  balances so goals are enforced on-chain too, not just earmarked.
- **Recurring & rule-based savings** — round-ups, payday rules, goal priorities.
- **Multi-currency & FX** — receive in any Stellar asset, auto-convert, show
  local-currency values.
- **Richer AI coach** — proactive nudges, spending categorization, "what if"
  goal simulations.
- **Mobile app** — React Native / Expo sharing the same service layer.

## Explicitly *not* in the MVP (future considerations)
These were intentionally out of scope to keep the demo focused:
- Loans & credit
- Investments / yield
- Family / shared accounts
- Bill payments
- Insurance
- Crypto trading
- Full credit scoring

Each is a natural expansion once the core savings loop has traction.
