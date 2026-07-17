import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toStroops, fromStroops, addUsdc, subUsdc, pctUsdc, eqUsdc, round7,
} from "../src/lib/money";

test("float traps are exact in stroop space", () => {
  assert.equal(addUsdc(0.1, 0.2), 0.3);
  assert.equal(subUsdc(0.3, 0.1), 0.2);
  // classic drift case: many small adds
  let total = 0;
  for (let i = 0; i < 1000; i++) total = addUsdc(total, 0.01);
  assert.equal(total, 10);
});

test("toStroops/fromStroops round-trip at 7-decimal resolution", () => {
  assert.equal(toStroops(1), 10_000_000n);
  assert.equal(toStroops(0.0000001), 1n);
  assert.equal(fromStroops(toStroops(1784.1234567)), 1784.1234567);
  assert.equal(round7(58.12345678), 58.1234568); // clamped + rounded
});

test("pctUsdc computes contract-identical splits", () => {
  assert.equal(pctUsdc(500, 0.2), 100);
  assert.equal(pctUsdc(333.3333333, 0.25), 83.3333333);
  // saved + available always reconstructs the original amount
  const amt = 123.4567891;
  const saved = pctUsdc(amt, 0.2);
  const available = subUsdc(round7(amt), saved);
  assert.equal(addUsdc(saved, available), round7(amt));
});

test("subUsdc floorZero prevents negative balances", () => {
  assert.equal(subUsdc(5, 8, { floorZero: true }), 0);
  assert.equal(subUsdc(5, 8), -3);
});

test("eqUsdc compares at stroop resolution", () => {
  assert.ok(eqUsdc(0.1 + 0.2, 0.3));
  assert.ok(!eqUsdc(1.0000001, 1.0000002));
});

test("invalid amounts are rejected", () => {
  assert.throws(() => toStroops(NaN));
  assert.throws(() => toStroops(Infinity));
});
