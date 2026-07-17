import "server-only";
import { Keypair, TransactionBuilder, WebAuth } from "@stellar/stellar-sdk";
import { getStellarConfig } from "@/lib/stellar/config";
import type {
  AnchorProvider,
  DepositSession,
  DepositStatus,
  WithdrawalSession,
  WithdrawalStatus,
} from "./types";

/**
 * Real SEP-24 anchor client.
 *
 * Speaks the actual Stellar interoperability stack:
 *   SEP-1  — discover endpoints from the anchor's stellar.toml
 *   SEP-10 — prove account ownership via a signed challenge, receive a JWT
 *   SEP-24 — open interactive deposit/withdraw sessions, poll transactions
 *
 * Activate by setting:
 *   ANCHOR_PROVIDER=sep24
 *   ANCHOR_HOME_DOMAIN=anchor.example.com
 *
 * The SEP-10 challenge is signed with the treasury key (the platform account
 * holds the anchor relationship; per-user KYC happens inside the anchor's
 * interactive flow, as SEP-24 intends).
 */

interface AnchorEndpoints {
  transferServer: string; // TRANSFER_SERVER_SEP0024
  webAuth: string; //        WEB_AUTH_ENDPOINT
  signingKey: string; //     SIGNING_KEY
}

interface Sep24TransactionRecord {
  id: string;
  kind: "deposit" | "withdrawal";
  status: string;
  more_info_url?: string;
  stellar_transaction_id?: string;
  withdraw_anchor_account?: string;
  withdraw_memo?: string;
  withdraw_memo_type?: string;
  message?: string;
}

const TOML_CACHE_MS = 10 * 60 * 1000;

export class Sep24Anchor implements AnchorProvider {
  readonly name: string;
  private readonly homeDomain: string;
  private endpoints: { value: AnchorEndpoints; expires: number } | null = null;
  private jwt: { token: string; expires: number } | null = null;

  constructor(homeDomain: string) {
    this.homeDomain = homeDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    this.name = `sep24:${this.homeDomain}`;
  }

  // ---- SEP-1: endpoint discovery ------------------------------------------

  private async discover(): Promise<AnchorEndpoints> {
    if (this.endpoints && Date.now() < this.endpoints.expires) return this.endpoints.value;

    const res = await fetch(`https://${this.homeDomain}/.well-known/stellar.toml`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Anchor TOML fetch failed (${res.status}).`);
    const toml = await res.text();

    const read = (key: string): string | null => {
      const m = toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, "m"));
      return m ? m[1] : null;
    };
    const transferServer = read("TRANSFER_SERVER_SEP0024");
    const webAuth = read("WEB_AUTH_ENDPOINT");
    const signingKey = read("SIGNING_KEY");
    if (!transferServer || !webAuth || !signingKey) {
      throw new Error(`Anchor ${this.homeDomain} TOML lacks SEP-24/SEP-10 endpoints.`);
    }
    const value = {
      transferServer: transferServer.replace(/\/+$/, ""),
      webAuth,
      signingKey,
    };
    this.endpoints = { value, expires: Date.now() + TOML_CACHE_MS };
    return value;
  }

  // ---- SEP-10: web authentication -----------------------------------------

  private async authenticate(): Promise<string> {
    if (this.jwt && Date.now() < this.jwt.expires) return this.jwt.token;

    const cfg = getStellarConfig();
    const { webAuth, signingKey } = await this.discover();
    const account = Keypair.fromSecret(cfg.distributor.secret);

    const challengeRes = await fetch(
      `${webAuth}?account=${encodeURIComponent(account.publicKey())}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!challengeRes.ok) throw new Error(`SEP-10 challenge failed (${challengeRes.status}).`);
    const { transaction, network_passphrase: challengePass } = (await challengeRes.json()) as {
      transaction: string;
      network_passphrase?: string;
    };
    const passphrase = challengePass ?? cfg.networkPassphrase;

    // Verify the challenge really came from the anchor before signing it.
    WebAuth.readChallengeTx(transaction, signingKey, passphrase, this.homeDomain, this.homeDomain);

    const tx = TransactionBuilder.fromXDR(transaction, passphrase);
    tx.sign(account);

    const tokenRes = await fetch(webAuth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: tx.toXDR() }),
      signal: AbortSignal.timeout(15000),
    });
    if (!tokenRes.ok) throw new Error(`SEP-10 token exchange failed (${tokenRes.status}).`);
    const { token } = (await tokenRes.json()) as { token: string };

    // SEP-10 JWTs default to 5-minute expiry; refresh with a safety margin.
    this.jwt = { token, expires: Date.now() + 4 * 60 * 1000 };
    return token;
  }

  // ---- SEP-24: interactive flows -------------------------------------------

  private async interactive(
    kind: "deposit" | "withdraw",
    fields: Record<string, string>,
  ): Promise<{ id: string; url: string }> {
    const cfg = getStellarConfig();
    const { transferServer } = await this.discover();
    const token = await this.authenticate();

    const res = await fetch(`${transferServer}/transactions/${kind}/interactive`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ asset_code: cfg.usdc.code, ...fields }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`SEP-24 ${kind} failed (${res.status}).`);
    const json = (await res.json()) as { id: string; url: string };
    return json;
  }

  private async transaction(id: string): Promise<Sep24TransactionRecord> {
    const { transferServer } = await this.discover();
    const token = await this.authenticate();
    const res = await fetch(`${transferServer}/transaction?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`SEP-24 transaction lookup failed (${res.status}).`);
    const { transaction } = (await res.json()) as { transaction: Sep24TransactionRecord };
    return transaction;
  }

  // ---- AnchorProvider ------------------------------------------------------

  async initiateDeposit(input: {
    destinationPublicKey: string;
    amountFiat: number;
    fiatCurrency: string;
    reference: string;
  }): Promise<DepositSession> {
    const { id, url } = await this.interactive("deposit", {
      account: input.destinationPublicKey,
      amount: String(input.amountFiat),
      // SEP-38 style off-chain asset identifier for the sender's currency.
      source_asset: `iso4217:${input.fiatCurrency}`,
    });
    return { id, interactiveUrl: url, status: "awaiting_payment" };
  }

  async getDepositStatus(id: string): Promise<DepositSession> {
    const t = await this.transaction(id);
    return {
      id: t.id,
      interactiveUrl: t.more_info_url ?? "",
      status: mapDepositStatus(t.status),
      stellarTxId: t.stellar_transaction_id,
    };
  }

  async initiateWithdrawal(input: {
    amountUsdc: number;
    fiatCurrency: string;
    railCode: string;
    accountName: string;
    accountNumber: string;
    reference: string;
  }): Promise<WithdrawalSession> {
    const { id } = await this.interactive("withdraw", {
      amount: String(input.amountUsdc),
      destination_asset: `iso4217:${input.fiatCurrency}`,
      // Bank details ride along for anchors that accept SEP-9 fields directly;
      // interactive anchors re-collect them in their hosted flow.
      dest: input.accountNumber,
      dest_extra: input.railCode,
    });

    // The anchor tells us where to send the USDC once it has created the
    // transaction — poll briefly for the settlement account + memo.
    const deadline = Date.now() + 20000;
    for (;;) {
      const t = await this.transaction(id);
      if (t.withdraw_anchor_account) {
        return {
          id,
          status: "pending_anchor",
          settlementAddress: t.withdraw_anchor_account,
          settlementMemo: t.withdraw_memo ?? input.reference.slice(0, 28),
        };
      }
      if (Date.now() > deadline) {
        throw new Error("Anchor did not provide a settlement account in time.");
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  async getWithdrawalStatus(id: string): Promise<WithdrawalSession> {
    const t = await this.transaction(id);
    return {
      id: t.id,
      status: mapWithdrawalStatus(t.status),
      settlementAddress: t.withdraw_anchor_account ?? "",
      settlementMemo: t.withdraw_memo ?? "",
      failureReason: t.status === "error" ? (t.message ?? "Anchor reported an error.") : undefined,
    };
  }
}

function mapDepositStatus(s: string): DepositStatus {
  switch (s) {
    case "completed":
      return "completed";
    case "incomplete":
    case "pending_user_transfer_start":
      return "awaiting_payment";
    case "expired":
      return "expired";
    case "error":
    case "no_market":
    case "too_small":
    case "too_large":
      return "failed";
    default:
      return "processing"; // pending_anchor / pending_stellar / pending_trust / …
  }
}

function mapWithdrawalStatus(s: string): WithdrawalStatus {
  switch (s) {
    case "completed":
      return "completed";
    case "incomplete":
    case "pending_user_transfer_start":
      return "pending_anchor";
    case "pending_external":
      return "paying_out";
    case "error":
    case "expired":
      return "failed";
    default:
      return "converting"; // pending_anchor / pending_stellar / …
  }
}
