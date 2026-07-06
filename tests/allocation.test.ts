import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateSavings, suggestAllocations, round2, round7 } from "../src/lib/savings/allocation";

const goal = (
  id: string,
  target: number,
  current = 0,
  extra: Partial<{ allocationPct: number; priority: string; status: string; claimedAt: string | null }> = {},
) => ({ id, name: id, targetAmount: target, currentAmount: current, ...extra });

// ---------------------------------------------------------------------------
// Legacy fallback (no plan configured) — original behavior preserved
// ---------------------------------------------------------------------------

test("fallback: distributes proportionally to remaining need and conserves the amount", () => {
  const out = allocateSavings([goal("a", 2000), goal("b", 3000), goal("c", 1500)], 100);
  assert.equal(out.length, 3);
  assert.equal(round2(out.reduce((s, a) => s + a.added, 0)), 100);
  assert.equal(out.find((a) => a.id === "a")!.added, 30.77);
  assert.equal(out.find((a) => a.id === "b")!.added, 46.15);
  assert.equal(out.find((a) => a.id === "c")!.added, 23.08);
});

test("fallback: caps at target and marks goal completed", () => {
  const out = allocateSavings([goal("a", 50, 40)], 100);
  assert.equal(out[0].added, 10);
  assert.equal(out[0].completed, true);
});

test("skips completed goals and handles empty/zero inputs", () => {
  assert.deepEqual(allocateSavings([goal("done", 100, 100)], 50), []);
  assert.deepEqual(allocateSavings([], 50), []);
  assert.deepEqual(allocateSavings([goal("a", 100)], 0), []);
  assert.deepEqual(allocateSavings([goal("a", 100)], -5), []);
});

// ---------------------------------------------------------------------------
// Plan-based distribution (allocationPct)
// ---------------------------------------------------------------------------

test("plan: splits exactly by configured percentages", () => {
  const out = allocateSavings(
    [
      goal("emergency", 2000, 0, { allocationPct: 50 }),
      goal("education", 3000, 0, { allocationPct: 30 }),
      goal("travel", 1000, 0, { allocationPct: 20 }),
    ],
    100,
  );
  assert.equal(out.find((a) => a.id === "emergency")!.added, 50);
  assert.equal(out.find((a) => a.id === "education")!.added, 30);
  assert.equal(out.find((a) => a.id === "travel")!.added, 20);
});

test("plan: overflow cascades to unfilled goals and conserves the amount", () => {
  // emergency only needs $10 of its $50 share → $40 overflow cascades 30:20.
  const out = allocateSavings(
    [
      goal("emergency", 100, 90, { allocationPct: 50 }),
      goal("education", 3000, 0, { allocationPct: 30 }),
      goal("travel", 1000, 0, { allocationPct: 20 }),
    ],
    100,
  );
  const total = round2(out.reduce((s, a) => s + a.added, 0));
  assert.equal(total, 100);
  assert.equal(out.find((a) => a.id === "emergency")!.added, 10);
  assert.equal(out.find((a) => a.id === "emergency")!.completed, true);
  assert.equal(out.find((a) => a.id === "education")!.added, 54);
  assert.equal(out.find((a) => a.id === "travel")!.added, 36);
});

test("plan: paused and archived goals receive nothing", () => {
  const out = allocateSavings(
    [
      goal("active", 1000, 0, { allocationPct: 50 }),
      goal("paused", 1000, 0, { allocationPct: 30, status: "paused" }),
      goal("archived", 1000, 0, { allocationPct: 20, status: "archived" }),
    ],
    100,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "active");
  assert.equal(out[0].added, 100);
});

test("plan: claimed goals receive nothing", () => {
  const out = allocateSavings(
    [
      goal("claimed", 100, 100, { allocationPct: 50, claimedAt: "2026-01-01" }),
      goal("open", 1000, 0, { allocationPct: 50 }),
    ],
    80,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "open");
  assert.equal(out[0].added, 80);
});

test("plan: overflow beyond all targets stays unallocated", () => {
  const out = allocateSavings(
    [goal("a", 10, 0, { allocationPct: 60 }), goal("b", 20, 0, { allocationPct: 40 })],
    1000,
  );
  assert.equal(round2(out.reduce((s, a) => s + a.added, 0)), 30);
  assert.ok(out.every((a) => a.completed));
});

test("plan: normalizes when percentages don't sum to 100 (e.g. a goal was paused)", () => {
  const out = allocateSavings(
    [goal("a", 1000, 0, { allocationPct: 30 }), goal("b", 1000, 0, { allocationPct: 30 })],
    100,
  );
  assert.equal(out.find((a) => a.id === "a")!.added, 50);
  assert.equal(out.find((a) => a.id === "b")!.added, 50);
});

test("rounding remainder is absorbed, nothing lost", () => {
  const out = allocateSavings(
    [
      goal("a", 10, 0, { allocationPct: 33 }),
      goal("b", 10, 0, { allocationPct: 33 }),
      goal("c", 10, 0, { allocationPct: 34 }),
    ],
    0.1,
  );
  assert.equal(round2(out.reduce((s, a) => s + a.added, 0)), 0.1);
});

// ---------------------------------------------------------------------------
// Priority-based suggestions
// ---------------------------------------------------------------------------

test("suggestAllocations weights high=3 medium=2 low=1 and sums to 100", () => {
  const pcts = suggestAllocations([
    { priority: "high" },
    { priority: "medium" },
    { priority: "low" },
  ]);
  assert.equal(pcts.reduce((s, p) => s + p, 0), 100);
  assert.ok(pcts[0] > pcts[1] && pcts[1] > pcts[2]);
});

test("suggestAllocations handles single goal and empty list", () => {
  assert.deepEqual(suggestAllocations([{ priority: "low" }]), [100]);
  assert.deepEqual(suggestAllocations([]), []);
});

test("round7 matches Stellar stroop precision round-trips", () => {
  assert.equal(round7(0.1 + 0.2), 0.3);
  const stroops = BigInt(Math.round(round7(58.1234567) * 1e7));
  assert.equal(Number(stroops) / 1e7, 58.1234567);
});
