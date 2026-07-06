/**
 * Seeds a fully-populated, ON-CHAIN demo account for live presentations.
 *
 *   Email:    demo@remitwise.app
 *   Password: demo1234
 *
 * Provisions the demo wallet on Stellar (Friendbot + USDC trustline) and runs
 * real remittances through the deployed Soroban vault, so the demo account is
 * genuinely backed by on-chain state. Requires `stellar.config.json`
 * (run `npm run stellar:bootstrap` first).
 */
import { PrismaClient } from "@prisma/client"; // side effect: loads .env
import { Keypair } from "@stellar/stellar-sdk";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { deriveKey, encryptWithKey } from "../src/lib/crypto-core";
import {
  makeHorizon,
  makeSoroban,
  sponsoredProvision,
  invokeContract,
  addressArg,
  i128Arg,
  usdcToStroops,
  stroopsToUsdc,
  getUsdcBalance,
} from "../src/lib/stellar/chain";
import { allocateSavings } from "../src/lib/savings/allocation";

const prisma = new PrismaClient();
const DEMO_EMAIL = "demo@remitwise.app";

const cfgPath = path.join(process.cwd(), "stellar.config.json");
if (!fs.existsSync(cfgPath)) {
  console.error("Missing stellar.config.json — run `npm run stellar:bootstrap` first.");
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const horizon = makeHorizon(cfg.horizonUrl);
const soroban = makeSoroban(cfg.sorobanRpcUrl);
const PASS = cfg.networkPassphrase;

const encKeySource =
  process.env.WALLET_ENCRYPTION_KEY ||
  process.env.AUTH_SECRET ||
  "remitwise-insecure-dev-secret-change-me-0000000000000000";
const ENC_KEY = deriveKey(encKeySource);

const GOAL_COLORS: Record<string, string> = {
  emergency: "#2563eb",
  education: "#7c3aed",
  medical: "#e11d48",
};
const GOALS = [
  { name: "Emergency Fund", category: "emergency", targetAmount: 2000, priority: "high", allocationPct: 50 },
  { name: "Children's Education", category: "education", targetAmount: 3000, priority: "medium", allocationPct: 30 },
  { name: "Family Medical", category: "medical", targetAmount: 1500, priority: "medium", allocationPct: 20 },
];
const REMITTANCES = [
  { amount: 450, sender: "Maria Santos", memo: "Monthly support", daysAgo: 34 },
  { amount: 300, sender: "Upwork Payments", memo: "Freelance payout", daysAgo: 25 },
  { amount: 600, sender: "Juan Dela Cruz", memo: "Family remittance", daysAgo: 16 },
  { amount: 500, sender: "Global Freelance Co.", memo: "Project milestone", daysAgo: 8 },
  { amount: 380, sender: "Ahmed Al-Rashid", memo: "Contract payment", daysAgo: 2 },
];
const round7 = (n: number) => Math.round(n * 1e7) / 1e7;

async function main() {
  console.log("🌱 Seeding RemitWise on-chain demo…");
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const user = await prisma.user.create({
    data: { email: DEMO_EMAIL, name: "Demo User", passwordHash, savingsRate: 0.2 },
  });

  const kp = Keypair.random();
  await prisma.wallet.create({
    data: {
      userId: user.id,
      publicKey: kp.publicKey(),
      secretKey: encryptWithKey(ENC_KEY, kp.secret()),
      network: "testnet",
    },
  });

  console.log("   gasless provisioning (treasury-sponsored account + USDC trustline, 0 XLM)…");
  await sponsoredProvision({
    horizon,
    passphrase: PASS,
    treasurySecret: cfg.distributor.secret,
    userSecret: kp.secret(),
    code: cfg.usdc.code,
    issuer: cfg.usdc.issuer,
  });
  await prisma.wallet.update({ where: { userId: user.id }, data: { provisioned: true } });
  console.log(`   wallet: ${kp.publicKey()} (0 XLM — sponsored)`);

  for (const g of GOALS) {
    await prisma.goal.create({
      data: {
        userId: user.id,
        name: g.name,
        category: g.category,
        targetAmount: g.targetAmount,
        color: GOAL_COLORS[g.category] ?? "#2563eb",
        priority: g.priority,
        allocationPct: g.allocationPct,
      },
    });
  }

  let available = 0;
  let savings = 0;

  for (const r of REMITTANCES) {
    console.log(`   remittance $${r.amount} from ${r.sender} → on-chain…`);
    const dep = await invokeContract({
      soroban,
      passphrase: PASS,
      contractId: cfg.vaultContractId,
      sourceSecret: cfg.distributor.secret,
      method: "deposit_remittance",
      args: [addressArg(cfg.distributor.publicKey), addressArg(kp.publicKey()), i128Arg(usdcToStroops(r.amount))],
    });
    const [savedS, availS] = dep.returnValue as [bigint, bigint];
    const saved = round7(stroopsToUsdc(savedS));
    const avail = round7(stroopsToUsdc(availS));
    available = round7(available + avail);
    savings = round7(savings + saved);

    const createdAt = new Date(Date.now() - r.daysAgo * 86400000);
    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "remittance_received",
        amount: r.amount,
        asset: "USDC",
        sender: r.sender,
        memo: r.memo,
        savedAmount: saved,
        availableAmount: avail,
        stellarTxId: dep.hash,
        createdAt,
      },
    });
    await earmarkToGoals(user.id, saved);
  }

  await prisma.wallet.update({
    where: { userId: user.id },
    data: { availableBalance: available, savingsBalance: savings },
  });

  const bal = await getUsdcBalance(horizon, kp.publicKey(), cfg.usdc.code, cfg.usdc.issuer);
  console.log(`✅ Demo ready — DB available $${available.toFixed(2)}, savings $${savings.toFixed(2)}`);
  console.log(`   On-chain USDC (available): ${bal.balance}`);
  console.log(`   Explorer: https://stellar.expert/explorer/testnet/account/${kp.publicKey()}`);
  console.log("   Login:  demo@remitwise.app / demo1234");
}

/** Uses the same unit-tested allocation math as the app engine. */
async function earmarkToGoals(userId: string, amount: number) {
  const goals = await prisma.goal.findMany({
    where: { userId, isCompleted: false },
    orderBy: { createdAt: "asc" },
  });
  for (const a of allocateSavings(goals, amount)) {
    await prisma.goal.update({
      where: { id: a.id },
      data: { currentAmount: a.newCurrent, isCompleted: a.completed },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
