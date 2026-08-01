import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseScannedValue,
  tryParseScannedValue,
  isValidStellarPublicKey,
  encodePayload,
  decodePayload,
  validatePayload,
  sanitizeText,
  buildToken,
  splitToken,
  qrLink,
  tokenFromLink,
  sourceOf,
  MAX_QR_LENGTH,
  type RequestPayload,
  type AddressPayload,
} from "../src/lib/payments/qr-format";
import { PaymentError, paymentErrorInfo, PAYMENT_ERRORS } from "../src/lib/payments/errors";
import {
  computeTransferTotals,
  parseAmountInput,
  assertTransferAmount,
  transferFeeUsdc,
  TRANSFER_MIN_USDC,
  TRANSFER_MAX_USDC,
} from "../src/lib/payments/fees";

// Real, checksum-valid Stellar accounts (Circle's USDC issuers).
const VALID_KEY = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const OTHER_KEY = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const future = () => Math.floor(Date.now() / 1000) + 600;

function requestPayload(overrides: Partial<RequestPayload> = {}): RequestPayload {
  return {
    v: 1,
    t: "req",
    i: "clx0000000000000000000000",
    n: "Maria Santos",
    a: 25.5,
    c: "USDC",
    m: "Lunch",
    x: future(),
    k: "abc123nonce",
    ...overrides,
  };
}

function token(payload: RequestPayload | AddressPayload, signature = "sIgNaTuRe_00"): string {
  return buildToken(encodePayload(payload), signature);
}

// ---------------------------------------------------------------------------
// StrKey validation
// ---------------------------------------------------------------------------

test("accepts real Stellar public keys and rejects corrupted ones", () => {
  assert.equal(isValidStellarPublicKey(VALID_KEY), true);
  assert.equal(isValidStellarPublicKey(OTHER_KEY), true);

  // A single flipped character breaks the CRC16 checksum — this is what stops
  // a mis-read QR from producing a plausible-but-wrong destination.
  const corrupted = `${VALID_KEY.slice(0, 10)}X${VALID_KEY.slice(11)}`;
  assert.equal(isValidStellarPublicKey(corrupted), false);

  assert.equal(isValidStellarPublicKey(VALID_KEY.slice(0, 55)), false); // too short
  assert.equal(isValidStellarPublicKey(`${VALID_KEY}A`), false); // too long
  assert.equal(isValidStellarPublicKey(VALID_KEY.toLowerCase()), false);
  assert.equal(isValidStellarPublicKey(""), false);
  // A secret seed (S…) must never pass as a destination.
  assert.equal(isValidStellarPublicKey(`S${VALID_KEY.slice(1)}`), false);
});

// ---------------------------------------------------------------------------
// Payload encoding
// ---------------------------------------------------------------------------

test("payloads round-trip through base64url", () => {
  const payload = requestPayload();
  assert.deepEqual(decodePayload(encodePayload(payload)), payload);

  const address: AddressPayload = { v: 1, t: "adr", g: VALID_KEY, n: "Ana", c: "USDC", k: "n1" };
  assert.deepEqual(decodePayload(encodePayload(address)), address);
});

test("payloads survive non-ASCII names", () => {
  const payload = requestPayload({ n: "José Ramírez 🇵🇭" });
  assert.deepEqual(decodePayload(encodePayload(payload))?.n, "José Ramírez 🇵🇭");
});

test("validatePayload rejects malformed structures", () => {
  assert.equal(validatePayload(null), null);
  assert.equal(validatePayload("nope"), null);
  assert.equal(validatePayload({ ...requestPayload(), v: 2 }), null, "unknown version");
  assert.equal(validatePayload({ ...requestPayload(), t: "xyz" }), null, "unknown type");
  assert.equal(validatePayload({ ...requestPayload(), a: -5 }), null, "negative amount");
  assert.equal(validatePayload({ ...requestPayload(), a: 0 }), null, "zero amount");
  assert.equal(validatePayload({ ...requestPayload(), a: "25" }), null, "string amount");
  assert.equal(validatePayload({ ...requestPayload(), k: "" }), null, "empty nonce");
  assert.equal(validatePayload({ ...requestPayload(), x: "soon" }), null, "non-numeric expiry");
  assert.equal(
    validatePayload({ v: 1, t: "adr", g: "GNOTAKEY", n: "X", c: "USDC", k: "n" }),
    null,
    "address payload must carry a valid key",
  );
  assert.equal(validatePayload({ ...requestPayload(), n: "x".repeat(200) }), null, "name too long");
});

test("an open request (no amount) is valid", () => {
  const open = requestPayload();
  delete open.a;
  const parsed = validatePayload(open);
  assert.ok(parsed);
  assert.equal("a" in parsed, false);
});

test("display text is stripped of control characters", () => {
  // A NUL and an ANSI escape smuggled into a payee name must not survive into
  // the DOM or an on-chain memo. Built from char codes so this source file
  // stays plain text (raw control bytes make git treat it as binary).
  const NUL = String.fromCharCode(0);
  const ESC = String.fromCharCode(27);
  const LF = String.fromCharCode(10);

  assert.equal(sanitizeText(`Ma${NUL}ria${ESC}[31m`, 40), "Maria[31m");
  assert.equal(sanitizeText(`line${LF}break`, 40), "linebreak");
  assert.equal(sanitizeText("  padded  ", 40), "padded");
  assert.equal(sanitizeText("x".repeat(100), 10).length, 10);
});

// ---------------------------------------------------------------------------
// Token + link handling
// ---------------------------------------------------------------------------

test("splitToken enforces the RW1.<payload>.<sig> shape", () => {
  assert.ok(splitToken(token(requestPayload())));
  assert.equal(splitToken("RW1.only-two-parts"), null);
  assert.equal(splitToken("XX1.payload.sig"), null, "wrong prefix");
  assert.equal(splitToken("RW1..sig"), null, "empty payload");
  assert.equal(splitToken("RW1.pay+load.sig"), null, "non-base64url characters");
});

test("tokens are recovered from deep links, and only from real ones", () => {
  const t = token(requestPayload());
  assert.equal(tokenFromLink(qrLink("https://remitwise.app", t)), t);
  assert.equal(tokenFromLink(qrLink("https://remitwise.app/", t)), t);
  assert.equal(tokenFromLink(`https://remitwise.app/dashboard?qr=${t}`), t);
  assert.equal(tokenFromLink("https://remitwise.app/qr/not-a-token"), null);
  assert.equal(tokenFromLink("https://example.com/pricing"), null);
  assert.equal(tokenFromLink(`javascript:alert(1)//qr/${t}`), null, "non-http scheme");
});

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

test("parses a RemitWise payment request from a raw token or a link", () => {
  const payload = requestPayload();
  const raw = token(payload);

  for (const input of [raw, qrLink("https://remitwise.app", raw)]) {
    const scan = parseScannedValue(input);
    assert.equal(scan.kind, "rw_request");
    if (scan.kind !== "rw_request") throw new Error("unreachable");
    assert.equal(scan.payload.i, payload.i);
    assert.equal(scan.payload.a, 25.5);
    assert.equal(scan.token, raw);
    assert.equal(sourceOf(scan), "qr_request");
  }
});

test("an expired request is rejected before the user ever sees a review screen", () => {
  const expired = token(requestPayload({ x: Math.floor(Date.now() / 1000) - 1 }));
  assert.throws(() => parseScannedValue(expired), (err: unknown) => {
    assert.ok(err instanceof PaymentError);
    assert.equal(err.code, "qr_expired");
    return true;
  });
});

test("a mangled payload is reported as damaged, not unsupported", () => {
  const result = tryParseScannedValue("RW1.!!!notbase64!!!.sig");
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "qr_malformed");
});

test("parses SEP-7 payment URIs", () => {
  const uri =
    `web+stellar:pay?destination=${VALID_KEY}&amount=12.25&asset_code=USDC` +
    `&asset_issuer=${OTHER_KEY}&memo=Invoice%20881&msg=Coffee%20Shop`;
  const scan = parseScannedValue(uri);
  assert.equal(scan.kind, "sep7");
  if (scan.kind !== "sep7") throw new Error("unreachable");
  assert.equal(scan.destination, VALID_KEY);
  assert.equal(scan.amount, 12.25);
  assert.equal(scan.assetCode, "USDC");
  assert.equal(scan.assetIssuer, OTHER_KEY);
  assert.equal(scan.memo, "Invoice 881");
  assert.equal(scan.label, "Coffee Shop");
  assert.equal(sourceOf(scan), "sep7");
});

test("SEP-7 `tx` operations are refused — RemitWise only signs what it builds", () => {
  assert.throws(
    () => parseScannedValue("web+stellar:tx?xdr=AAAAAgAAAAA"),
    (err: unknown) => err instanceof PaymentError && err.code === "qr_unsupported",
  );
});

test("SEP-7 with a bad destination or amount is malformed", () => {
  assert.throws(
    () => parseScannedValue("web+stellar:pay?destination=GNOPE&amount=1"),
    (err: unknown) => err instanceof PaymentError && err.code === "qr_malformed",
  );
  assert.throws(
    () => parseScannedValue(`web+stellar:pay?destination=${VALID_KEY}&amount=-3`),
    (err: unknown) => err instanceof PaymentError && err.code === "qr_malformed",
  );
});

test("plain wallet-address codes are payable", () => {
  for (const input of [VALID_KEY, `  ${VALID_KEY}  `, `stellar:${VALID_KEY}`]) {
    const scan = parseScannedValue(input);
    assert.equal(scan.kind, "address");
    if (scan.kind !== "address") throw new Error("unreachable");
    assert.equal(scan.destination, VALID_KEY);
    assert.equal(sourceOf(scan), "address");
  }
});

test("someone else's QR code fails with a specific reason", () => {
  const cases: [string, string][] = [
    ["https://example.com/menu", "qr_unsupported"],
    ["WIFI:S:CafeNet;T:WPA;P:hunter2;;", "qr_unsupported"],
    ["", "qr_unreadable"],
    ["   ", "qr_unreadable"],
    ["x".repeat(MAX_QR_LENGTH + 1), "qr_unsupported"],
  ];
  for (const [input, code] of cases) {
    const result = tryParseScannedValue(input);
    assert.equal(result.ok, false, `expected ${input.slice(0, 20)} to fail`);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.code, code);
  }
});

// ---------------------------------------------------------------------------
// Error catalogue
// ---------------------------------------------------------------------------

test("every error code has presentable copy and a recovery action", () => {
  for (const [code, info] of Object.entries(PAYMENT_ERRORS)) {
    assert.ok(info.title.length > 0, `${code} needs a title`);
    assert.ok(info.message.length > 0, `${code} needs a message`);
    assert.ok(info.recoveryLabel.length > 0, `${code} needs a recovery label`);
    assert.ok(info.status >= 400 && info.status < 600, `${code} needs an HTTP status`);
  }
  // An unknown code from a newer server must still render something sane.
  assert.equal(paymentErrorInfo("totally_new_code").title, PAYMENT_ERRORS.server_error.title);
  assert.equal(paymentErrorInfo(null).title, PAYMENT_ERRORS.server_error.title);
});

// ---------------------------------------------------------------------------
// Money: fees, totals, limits
// ---------------------------------------------------------------------------

test("in-network payments are free, external ones carry the network fee", () => {
  assert.equal(transferFeeUsdc(true), 0);
  assert.ok(transferFeeUsdc(false) > 0);
});

test("review totals are exact and flag an unaffordable payment", () => {
  const free = computeTransferTotals(25.5, 0, 100);
  assert.deepEqual(free, {
    amount: 25.5,
    fee: 0,
    total: 25.5,
    balanceAfter: 74.5,
    sufficient: true,
  });

  const withFee = computeTransferTotals(0.1, 0.2, 100);
  assert.equal(withFee.total, 0.3, "no float drift in the fee sum");
  assert.equal(withFee.balanceAfter, 99.7);

  const exact = computeTransferTotals(99.9, 0.1, 100);
  assert.equal(exact.sufficient, true);
  assert.equal(exact.balanceAfter, 0);

  const short = computeTransferTotals(100, 0.1, 100);
  assert.equal(short.sufficient, false);
  assert.equal(short.balanceAfter, 0, "never renders a negative balance");
});

test("typed amounts are accepted only when they are real money values", () => {
  assert.equal(parseAmountInput("25"), 25);
  assert.equal(parseAmountInput("25.5"), 25.5);
  assert.equal(parseAmountInput("1,250.75"), 1250.75);
  assert.equal(parseAmountInput(" 8.00 "), 8);

  for (const bad of ["", "abc", "12abc", "1.234", "-5", "0", ".5", "1.", "1e3", "Infinity"]) {
    assert.equal(parseAmountInput(bad), null, `${bad} should be rejected`);
  }
});

test("transfer limits are enforced with specific codes", () => {
  assert.equal(assertTransferAmount(10), 10);
  assert.equal(assertTransferAmount(TRANSFER_MIN_USDC), TRANSFER_MIN_USDC);
  assert.equal(assertTransferAmount(TRANSFER_MAX_USDC), TRANSFER_MAX_USDC);

  const codeOf = (amount: number) => {
    try {
      assertTransferAmount(amount);
      return "ok";
    } catch (err) {
      return err instanceof PaymentError ? err.code : "other";
    }
  };
  assert.equal(codeOf(0.01), "amount_too_small");
  assert.equal(codeOf(TRANSFER_MAX_USDC + 1), "amount_too_large");
  assert.equal(codeOf(0), "amount_invalid");
  assert.equal(codeOf(-1), "amount_invalid");
  assert.equal(codeOf(Number.NaN), "amount_invalid");
  assert.equal(codeOf(Number.POSITIVE_INFINITY), "amount_invalid");
});
