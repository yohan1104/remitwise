import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateSavings, round2, round7 } from "../src/lib/savings/allocation";

const goal = (id: string, target: number, current = 0) => ({
  id,
  name: id,
  targetAmount: target,
  currentAmount: current,
});

test("distributes proportionally to remaining need and conserves the full amount", () => {
  const out = allocateSavings([goal("a", 2000), goal("b", 3000), goal("c", 1500)], 100);
  assert.equal(out.length, 3);
  const total = round2(out.reduce((s, a) => s + a.added, 0));
  assert.equal(total, 100); // nothing lost to rounding
  // weighted by remaining: 2000/6500, 3000/6500, 1500/6500
  assert.equal(out[0].added, 30.77);
  assert.equal(out[1].added, 46.15);
  assert.equal(out[2].added, 23.08);
});

test("caps at target and marks goal completed", () => {
  const out = allocateSavings([goal("a", 50, 40)], 100);
  assert.equal(out.length, 1);
  assert.equal(out[0].added, 10);
  assert.equal(out[0].newCurrent, 50);
  assert.equal(out[0].completed, true);
});

test("overflow beyond all targets is not allocated (stays unearmarked savings)", () => {
  const out = allocateSavings([goal("a", 10), goal("b", 20)], 1000);
  const total = out.reduce((s, a) => s + a.added, 0);
  assert.equal(total, 30);
  assert.ok(out.every((a) => a.completed));
});

test("skips completed goals and handles empty/zero inputs", () => {
  assert.deepEqual(allocateSavings([goal("done", 100, 100)], 50), []);
  assert.deepEqual(allocateSavings([], 50), []);
  assert.deepEqual(allocateSavings([goal("a", 100)], 0), []);
  assert.deepEqual(allocateSavings([goal("a", 100)], -5), []);
});

test("last goal absorbs rounding remainder exactly", () => {
  // 3-way split of 0.10 across equal goals → 0.03/0.03/0.04
  const out = allocateSavings([goal("a", 1), goal("b", 1), goal("c", 1)], 0.1);
  const total = round2(out.reduce((s, a) => s + a.added, 0));
  assert.equal(total, 0.1);
});

test("round7 matches Stellar stroop precision round-trips", () => {
  assert.equal(round7(0.1 + 0.2), 0.3);
  assert.equal(round7(123.45678944), 123.4567894);
  const stroops = BigInt(Math.round(round7(58.1234567) * 1e7));
  assert.equal(Number(stroops) / 1e7, 58.1234567);
});
