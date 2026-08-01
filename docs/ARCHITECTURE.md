# RemitWise Architecture

How money and data move through the platform. Written for an engineer joining
the team; each section links the modules that own the behavior.

## Module map

```
src/lib/
  anchors/        Fiat ↔ Stellar bridge (SEP-24 seam)
    types.ts        Provider-agnostic contracts + status models
    index.ts        Provider factory (ANCHOR_PROVIDER: mock | sep24)
    sep24.ts        Real anchor client: SEP-1 discovery, SEP-10 auth, SEP-24 flows
    mock.ts         Simulated partner (same topology, time-driven lifecycle)
    quotes.ts       FX + fee quoting (integer-stroop math, oracle-labelled)
    rails.ts        Payout corridors/banks registry (data, not code)
    currencies.ts   Sender currencies (reference rates)
  payouts/
    engine.ts       Withdrawal orchestration (quote → anchor → on-chain → track)
    deposits.ts     Deposit orchestration (intent → sender pays → settle)
  savings/
    engine.ts       Remittance settlement through the vault + goal earmarking
    allocation.ts   Pure allocation math (unit-tested)
  stellar/
    config.ts       Network/env config + fail-fast asset validation
    assets.ts       Circle USDC registry, trustline verification, SAC ids
    chain.ts        Low-level Stellar ops (sponsored provision, fee-bump pay, invoke)
    soroban.ts      Vault contract bindings
    signing.ts      Custody seam (who signs for a user)
    oracle.ts       Reflector FX oracle reads
  money.ts        BigInt stroop arithmetic — the only money math allowed
  audit.ts        Append-only financial/auth event log
  rate-limit.ts   Sliding-window limits (general per-IP, financial per-user)
scripts/
  payment-listener.ts  Horizon worker: stream → ingest (cursor-persistent)
contracts/savings-vault/  Soroban contract enforcing the auto-save split
```

Design rule: **business logic never touches infrastructure directly.** Engines
call seams (`getAnchor()`, `getUserSigner()`, `getStellarConfig()`); swapping a
provider or network is configuration.

## Payment lifecycle 1 — inbound remittance (on-ramp)

```
Sender bank (USD/EUR/GBP/…)                       RECIPIENT DASHBOARD
     │  pays on anchor's interactive page               ▲
     ▼                                                  │ live status (poll)
DepositIntent (quote locked: fx, fees, USDC out)        │
     │  anchor confirms fiat received                   │
     ▼                                                  │
settleDeposit ── atomic claim (awaiting_payment→processing)
     │
     ▼
receiveRemittance ─ treasury → vault.deposit_remittance (Soroban)
     │                 contract retains savings %, releases the rest
     ▼
DB mirror + goal earmarks + AuditLog + tx hash ─→ dashboard & AI insights
```

- Direct Stellar payments (someone sends USDC to the treasury with the
  recipient's email as memo) enter the same path via the **Horizon worker** →
  `POST /api/remittances/ingest` (webhook-secret auth, idempotent on tx hash).
- The worker persists its cursor in `SystemState` and replays gaps after
  downtime; duplicates are absorbed by ingest idempotency.

## Payment lifecycle 2 — cash-out (off-ramp)

```
User confirms quote (server-computed, snapshotted on the Withdrawal row)
     │
     ▼
Anchor session opens → returns settlement address + memo
     │        trustline of settlement account verified (exists/authorized/headroom)
     ▼
User-signed USDC payment → anchor   (treasury fee-bumps: users hold 0 XLM)
     │
     ▼
Balance debit + cash_out Transaction (pending) + AuditLog     [atomic]
     │
     ▼
Status tracking: pending_anchor → converting → paying_out → completed
     (optimistic-concurrency transitions; failure keeps reason + evidence)
```

Payout destinations come from `rails.ts` — adding a corridor is a data change.
Phase-2 scope: Philippine banks + e-wallets (PHP).

## Custody model

All signing decisions flow through `stellar/signing.ts` (`getUserSigner`).

- **Today (custodial):** per-user ed25519 secrets encrypted at rest
  (AES-256-GCM, key = `WALLET_ENCRYPTION_KEY`); decrypted transiently to sign,
  never logged or serialized. Treasury sponsors reserves/trustlines and
  fee-bumps user transactions, so users hold zero XLM.
- **Contract-level protection regardless of custody:** vault withdrawals and
  rate changes require the *owner's* signature on-chain — the platform cannot
  move a user's savings.
- **Migration path (non-custodial):** `Wallet` gains `mode = external`; for
  external wallets `getUserSigner` raises `SignatureRequiredError` carrying
  unsigned XDR, the API returns it as a `requires_signature` response, and the
  client signs with Freighter/WalletConnect and resubmits. Engines are already
  written against the seam, so the change is contained to `signing.ts`, one
  API envelope, and a client signing hook. Import-your-own-key exists today
  (`/api/wallet/import`).

## Financial correctness invariants

1. All arithmetic in integer stroops (`lib/money.ts`); floats only at
   display/API boundaries.
2. The chain is the source of truth; the DB is a fast-read mirror written in
   the same `$transaction` as the evidence (tx hash).
3. Every external event is idempotent: ingest dedupes on tx hash, ramp
   transitions are single-winner `updateMany` claims.
4. Quotes are locked server-side and snapshotted; nothing financial is trusted
   from the client.
5. Every money movement leaves an `AuditLog` row and (where on-chain) a
   verifiable explorer link.

## Environment variables

See `.env.example` for the annotated list; `docs/MAINNET.md` for production
values and the go-live procedure.
