/**
 * Live remittance detection — the production replacement for the demo's
 * "Simulate Remittance" button.
 *
 * Streams payments on the treasury account via Horizon. When an EXTERNAL
 * account sends USDC to the treasury with a text memo naming the recipient
 * (their RemitWise email), the payment is forwarded to the app's ingest
 * endpoint, which settles it through the Soroban vault exactly like every
 * other remittance (idempotent on the inbound tx hash).
 *
 * Run:  PAYMENT_WEBHOOK_SECRET=... APP_URL=http://localhost:3000 \
 *         npx tsx scripts/payment-listener.ts
 */
import fs from "node:fs";
import path from "node:path";
import { Horizon } from "@stellar/stellar-sdk";

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "stellar.config.json"), "utf8"),
);
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? "";
if (!SECRET) {
  console.error("PAYMENT_WEBHOOK_SECRET is required (must match the app's env).");
  process.exit(1);
}

const horizon = new Horizon.Server(cfg.horizonUrl);
const TREASURY = cfg.distributor.publicKey as string;

async function forward(payment: {
  transaction_hash: string;
  from: string;
  amount: string;
  transaction: () => Promise<{ memo?: string }>;
}) {
  const tx = await payment.transaction();
  const memo = (tx.memo ?? "").trim();
  if (!memo.includes("@")) {
    console.log(`  ↷ skipped ${payment.transaction_hash.slice(0, 8)} — memo is not a recipient email`);
    return;
  }
  const res = await fetch(`${APP_URL}/api/remittances/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": SECRET },
    body: JSON.stringify({
      recipientEmail: memo,
      amount: Number(payment.amount),
      sender: `Stellar ${payment.from.slice(0, 6)}…`,
      memo: "Inbound Stellar payment",
      externalId: payment.transaction_hash,
    }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`  → ${res.ok ? body.status : `ERROR ${res.status}: ${body.error}`}`);
}

console.log(`▶ watching ${TREASURY.slice(0, 8)}… for inbound USDC (memo = recipient email)`);
horizon
  .payments()
  .forAccount(TREASURY)
  .cursor("now")
  .stream({
    onmessage: (record) => {
      const p = record as unknown as {
        type: string;
        to?: string;
        from?: string;
        asset_code?: string;
        amount: string;
        transaction_hash: string;
        transaction: () => Promise<{ memo?: string }>;
      };
      if (p.type !== "payment" || p.to !== TREASURY) return;
      if (p.asset_code !== cfg.usdc.code) return;
      console.log(`✦ inbound ${p.amount} ${p.asset_code} from ${p.from?.slice(0, 8)}…`);
      void forward(p as Parameters<typeof forward>[0]).catch((e) =>
        console.error("  forward failed:", e.message),
      );
    },
    onerror: (err) => console.error("stream error (auto-retries):", String(err).slice(0, 120)),
  });
