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
  payments/       QR payments (person-to-person, spendable balance)
    qr-format.ts    Wire format: RW1 tokens, SEP-7 URIs, StrKey validation (isomorphic)
    qr-sign.ts      HMAC-SHA256 token signing/verification (tamper evidence)
    intent.ts       Short-lived signed resolution handed to the confirm step
    resolve.ts      Scan → verified recipient + quote (the only authority)
    transfer.ts     Reserve → settle → credit, idempotent and refund-safe
    requests.ts     Payee-side payment codes (create/list/cancel/claim)
    fees.ts         Limits + fee policy + review-screen math (pure)
    errors.ts       Typed failure codes → user copy + recovery action (pure)
  qr/             Client-side detection
    decode.ts       BarcodeDetector with a jsQR fallback; multi-code strategies
    image.ts        Upload decoding: validation, downscaling, multi-pass
    use-scanner.ts  Camera lifecycle (permissions, torch, lens, frame sampling)
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

## Payment lifecycle 3 — QR payment (person to person)

```
PAYEE                                   PAYER
POST /api/payments/requests             scan (camera) or upload (image)
  │  PaymentRequest row + nonce           │  decode → parse → POST /api/payments/qr/resolve
  ▼                                       ▼
QR encodes /qr/<RW1.payload.sig>  ───▶  verify signature → re-read the row →
  (any camera app can open it)            resolve recipient → quote fee
                                          │
                                          ▼  signed PaymentIntent (5 min TTL)
                                        REVIEW: name, identifier, amount,
                                        fee, total, balance after, note
                                          │  explicit confirmation
                                          ▼
                                 POST /api/transfers { intentToken, idempotencyKey }
                                          │
      claim request (single-winner updateMany)  ─┐
      reserve funds (balance CAS + Transfer + pending ledger row) [atomic]
                                          ▼
      user-signed USDC payment, treasury fee-bumped
      (2 ops when a fee applies: recipient + treasury, one transaction)
                                          ▼
      completed: credit recipient, both ledger rows, AuditLog   [atomic]
      failed:    refund the reservation, release the request     [atomic]
```

Accepted codes: RemitWise tokens (signed), RemitWise deep links, SEP-7
`web+stellar:pay` URIs, and bare Stellar addresses. SEP-7 `tx` is deliberately
refused — RemitWise never signs a transaction it did not build.

Safety properties, each with a test:

- **Tamper evidence.** Editing the amount or payee inside a token breaks its
  HMAC (`qr_tampered`). The signature proves origin, not authorisation — the
  payment request row is re-read on every resolve *and* every confirm.
- **No client-supplied recipients.** The confirm endpoint accepts only the
  server's own signed intent; the amount is the single client-influenced field,
  and only when the payee left it open.
- **No double spend.** The debit is a compare-and-set on the balance that was
  read (exact stroop arithmetic, bounded retry), so concurrent payments cannot
  both succeed against the same funds.
- **No double submit.** `Transfer.idempotencyKey` is unique: a replayed
  confirmation returns the original transfer instead of sending again.
- **No replay of a code.** Single-use requests are claimed by an atomic status
  flip; the loser gets `request_already_paid`.
- **Money is never stranded.** Funds are reserved before settlement and
  refunded if it fails, so a failed payment leaves the balance untouched and a
  `failed` row explaining why.

Fee policy: RemitWise → RemitWise is free; paying an external Stellar address
costs a flat network fee (`FEE_TRANSFER_NETWORK_USD`, default $0.10) collected
to the treasury *inside the same transaction*, so the on-chain debit always
equals the mirrored one.

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
