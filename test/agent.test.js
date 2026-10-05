import assert from "node:assert/strict";
import test from "node:test";
import { DemoCatalogAdapter } from "../src/adapters/catalog.js";
import { DemoQlooAdapter } from "../src/adapters/qloo.js";
import { buildGiftPlan, normalizeProfile } from "../src/domain/agent.js";

const profile = {
  recipient: "Maya",
  relationship: "close friend",
  occasion: "Birthday",
  tastes: ["Studio Ghibli", "jazz", "hiking", "Japanese craft"],
  avoid: ["alcohol"],
  note: "Small apartment",
  budget: 85,
  currency: "USD"
};

test("agent produces budget-safe recommendations with Qloo evidence and traces", async () => {
  const plan = await buildGiftPlan(profile, { qloo: new DemoQlooAdapter(), catalog: new DemoCatalogAdapter() });
  assert.equal(plan.status, "AWAITING_HUMAN_APPROVAL");
  assert.ok(plan.recommendations.length >= 4);
  assert.ok(plan.recommendations.every((item) => item.price <= profile.budget));
  assert.ok(plan.recommendations.every((item) => item.qlooAffinity?.name));
  assert.deepEqual(plan.trace.map((entry) => entry.stage), ["understand", "discover", "decide"]);
  assert.match(plan.boundaries.channel3, /Discovery only/);
  assert.match(plan.boundaries.paypal, /server-side/);
});

test("profile validation rejects underspecified tastes and unsafe budgets", () => {
  assert.throws(() => normalizeProfile({ ...profile, tastes: ["jazz"] }), /between 2 and 6/);
  assert.throws(() => normalizeProfile({ ...profile, budget: 5 }), /between 20 and 5000/);
});

test("same brief yields the same ranked products in deterministic demo mode", async () => {
  const adapters = { qloo: new DemoQlooAdapter(), catalog: new DemoCatalogAdapter() };
  const first = await buildGiftPlan(profile, adapters);
  const second = await buildGiftPlan(profile, adapters);
  assert.deepEqual(
    first.recommendations.map(({ id, fitScore }) => ({ id, fitScore })),
    second.recommendations.map(({ id, fitScore }) => ({ id, fitScore }))
  );
});
