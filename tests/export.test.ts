import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTransactionsCsv,
  csvCell,
  isMonthKey,
  monthKeyOf,
  monthLabel,
  monthRange,
} from "../src/lib/export";
import type { TransactionView } from "../src/lib/types";

function tx(overrides: Partial<TransactionView> = {}): TransactionView {
  return {
    id: "t1",
    type: "remittance_received",
    amount: 400,
    asset: "USDC",
    sender: "Maria Santos",
    memo: "July support",
    savedAmount: 80,
    availableAmount: 320,
    status: "completed",
    stellarTxId: "abc123def456",
    createdAt: "2026-07-15T10:30:00.000Z",
    ...overrides,
  };
}

test("csvCell quotes separators and doubles quotes", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('with "quotes"'), '"with ""quotes"""');
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell(null), "");
});

test("csvCell neutralizes spreadsheet formula injection", () => {
  assert.equal(csvCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  assert.equal(csvCell("+1234"), "'+1234");
  assert.equal(csvCell("-cmd"), "'-cmd");
  assert.equal(csvCell("@evil"), "'@evil");
});

test("buildTransactionsCsv emits header, rows, and explorer URLs", () => {
  const csv = buildTransactionsCsv([tx()], "testnet");
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith("Date (UTC),Type,Sender,Reference"));
  assert.ok(lines[1].includes("Remittance received"));
  assert.ok(lines[1].includes("Maria Santos"));
  assert.ok(lines[1].includes("400.00"));
  assert.ok(lines[1].includes("80.00"));
  assert.ok(
    lines[1].includes("https://stellar.expert/explorer/testnet/tx/abc123def456"),
  );
});

test("buildTransactionsCsv escapes hostile sender text", () => {
  const csv = buildTransactionsCsv(
    [tx({ sender: "=HYPERLINK(\"http://evil\")", memo: "a,b" })],
    "testnet",
  );
  assert.ok(csv.includes("\"'=HYPERLINK"));
  assert.ok(csv.includes('"a,b"'));
});

test("month helpers validate, label, and bound a month", () => {
  assert.ok(isMonthKey("2026-07"));
  assert.ok(!isMonthKey("2026-13"));
  assert.ok(!isMonthKey("2026-7"));
  assert.ok(!isMonthKey("garbage"));

  assert.equal(monthLabel("2026-07"), "July 2026");

  const { from, to } = monthRange("2026-02");
  assert.equal(from.getFullYear(), 2026);
  assert.equal(from.getMonth(), 1);
  assert.equal(from.getDate(), 1);
  // 2026 is not a leap year → Feb 28.
  assert.equal(to.getMonth(), 1);
  assert.equal(to.getDate(), 28);
  assert.equal(to.getHours(), 23);

  assert.equal(monthKeyOf(new Date(2026, 6, 31)), "2026-07");
  assert.equal(monthKeyOf(new Date(2026, 0, 1)), "2026-01");
});

test("monthRange throws on invalid keys", () => {
  assert.throws(() => monthRange("2026-00"));
  assert.throws(() => monthRange("nope"));
});
