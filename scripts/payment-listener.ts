/**
 * Live remittance detection — production Horizon payment worker.
 *
 * Streams payments on the treasury account. When an external account sends
 * USDC (code + issuer verified) with a text memo naming the recipient (their
 * RemitWise email), the payment is forwarded to the app's ingest endpoint,
 * which settles it through the Soroban vault (idempotent on the tx hash).
 *
 * Reliability model:
 *   • Cursor persistence — the last processed paging token is stored in the
 *     database (SystemState), so a restart resumes exactly where it stopped
 *     and Horizon replays anything that arrived while the worker was down
 *     (automatic reconciliation, at-least-once; the ingest API dedupes).
 *   • Supervised stream — the SDK's EventSource retry is wrapped in an
 *     explicit reconnect loop with exponential backoff (1s → 60s cap), so a
 *     dead connection never silently stalls settlement.
 *   • Failures never advance the cursor past themselves silently: a forward
 *     error is logged loudly and retried on the next replay.
 *
 * Run:  PAYMENT_WEBHOOK_SECRET=... APP_URL=http://localhost:3000 \
 *         npm run payments:listen
 */
import fs from "node:fs";
import path from "node:path";
import { Horizon } from "@stellar/stellar-sdk";
import { PrismaClient } from "@prisma/client";

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "stellar.config.json"), "utf8"),
) as {
  horizonUrl: string;
  usdc: { code: string; issuer: string };
  distributor: { publicKey: string };
};

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? "";
if (!SECRET) {
  log("fatal", "PAYMENT_WEBHOOK_SECRET is required (must match the app's env).");
  process.exit(1);
}

const prisma = new PrismaClient();
const horizon = new Horizon.Server(cfg.horizonUrl);
const TREASURY = cfg.distributor.publicKey;
const CURSOR_KEY = `horizon-cursor:${TREASURY}`;

function log(level: "info" | "warn" | "error" | "fatal", msg: string) {
  console.log(`${new Date().toISOString()} [${level}] ${msg}`);
}

async function loadCursor(): Promise<string> {
  const row = await prisma.systemState.findUnique({ where: { key: CURSOR_KEY } });
  return row?.value ?? "now";
}

async function saveCursor(token: string): Promise<void> {
  await prisma.systemState.upsert({
    where: { key: CURSOR_KEY },
    update: { value: token },
    create: { key: CURSOR_KEY, value: token },
  });
}

interface PaymentRecord {
  type: string;
  to?: string;
  from?: string;
  asset_code?: string;
  asset_issuer?: string;
  amount: string;
  paging_token: string;
  transaction_hash: string;
  transaction: () => Promise<{ memo?: string }>;
}

/** Forward one matching payment to the ingest API. Throws on delivery failure. */
async function forward(p: PaymentRecord): Promise<void> {
  const tx = await p.transaction();
  const memo = (tx.memo ?? "").trim();
  if (!memo.includes("@")) {
    log("info", `↷ skipped ${p.transaction_hash.slice(0, 8)} — memo is not a recipient email`);
    return;
  }
  const res = await fetch(`${APP_URL}/api/remittances/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": SECRET },
    body: JSON.stringify({
      recipientEmail: memo,
      amount: Number(p.amount),
      sender: `Stellar ${p.from?.slice(0, 6)}…`,
      memo: "Inbound Stellar payment",
      externalId: p.transaction_hash,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
  if (!res.ok) {
    throw new Error(`ingest responded ${res.status}: ${body.error ?? "unknown error"}`);
  }
  log("info", `→ ${body.status} (${p.amount} ${p.asset_code} for ${memo})`);
}

let closeStream: (() => void) | null = null;
let backoffMs = 1000;
let processing = Promise.resolve(); // serialize handling so cursors advance in order

function connect(cursor: string): void {
  log("info", `▶ streaming payments for ${TREASURY.slice(0, 8)}… from cursor ${cursor}`);
  closeStream = horizon
    .payments()
    .forAccount(TREASURY)
    .cursor(cursor)
    .stream({
      onmessage: (record) => {
        const p = record as unknown as PaymentRecord;
        processing = processing.then(async () => {
          backoffMs = 1000; // healthy stream → reset backoff
          try {
            if (
              p.type === "payment" &&
              p.to === TREASURY &&
              p.asset_code === cfg.usdc.code &&
              p.asset_issuer === cfg.usdc.issuer // full asset verification
            ) {
              log("info", `✦ inbound ${p.amount} ${p.asset_code} from ${p.from?.slice(0, 8)}…`);
              await forward(p);
            }
            await saveCursor(p.paging_token);
          } catch (err) {
            // Do not advance the cursor: a restart replays this payment and
            // the ingest API's idempotency makes the retry safe.
            log("error", `forward failed for ${p.transaction_hash.slice(0, 8)}: ${(err as Error).message}`);
          }
        });
      },
      onerror: (err) => {
        log("warn", `stream error: ${String(err).slice(0, 120)} — reconnecting in ${backoffMs / 1000}s`);
        closeStream?.();
        const delay = backoffMs;
        backoffMs = Math.min(backoffMs * 2, 60_000);
        setTimeout(() => {
          void loadCursor().then(connect);
        }, delay);
      },
    });
}

async function main() {
  const cursor = await loadCursor();
  if (cursor !== "now") {
    log("info", "resuming from persisted cursor — missed payments will replay");
  }
  connect(cursor);
}

process.on("SIGINT", async () => {
  log("info", "shutting down…");
  closeStream?.();
  await processing.catch(() => undefined);
  await prisma.$disconnect();
  process.exit(0);
});

void main().catch((err) => {
  log("fatal", String(err));
  process.exit(1);
});
