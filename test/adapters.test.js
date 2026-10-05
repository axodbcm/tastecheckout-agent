import assert from "node:assert/strict";
import test from "node:test";
import { Channel3Adapter } from "../src/adapters/catalog.js";
import { PayPalSandboxAdapter } from "../src/adapters/paypal.js";
import { DemoQlooAdapter, QlooAdapter, QlooHarnessAdapter } from "../src/adapters/qloo.js";

const profile = {
  recipient: "Maya",
  relationship: "friend",
  occasion: "Birthday",
  tastes: ["jazz", "hiking"],
  avoid: [],
  note: "",
  budget: 90,
  currency: "USD"
};

test("Qloo demo is deterministic and discloses that no live request occurred", async () => {
  const adapter = new DemoQlooAdapter();
  const first = await adapter.analyze(profile);
  const second = await adapter.analyze(profile);
  assert.deepEqual(first, second);
  assert.equal(first.provider, "qloo-demo");
  assert.match(first.disclaimer, /Deterministic demo data/);
  assert.ok(first.affinities.some((item) => item.name === "vinyl"));
});

test("live Qloo adapter uses search plus v2 insights with X-Api-Key", { concurrency: false }, async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const parsed = new URL(url);
    const body = parsed.pathname === "/search"
      ? { results: [{ id: `seed-${parsed.searchParams.get("query")}`, name: parsed.searchParams.get("query") }] }
      : { results: { entities: [{ id: `result-${parsed.searchParams.get("filter.type")}`, name: "Cultural match", affinity: 0.91 }] } };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => { global.fetch = originalFetch; });

  const adapter = new QlooAdapter({ apiKey: "test-key", baseUrl: "https://hackathon.api.qloo.com" });
  const result = await adapter.analyze(profile);
  assert.equal(result.mode, "live");
  assert.equal(calls.filter((call) => new URL(call.url).pathname === "/search").length, 2);
  assert.equal(calls.filter((call) => new URL(call.url).pathname === "/v2/insights").length, 4);
  assert.ok(calls.every((call) => call.options.headers["X-Api-Key"] === "test-key"));
  assert.ok(calls.filter((call) => call.url.includes("/v2/insights")).every((call) => call.url.includes("feature.explainability=true")));
});

test("event-supported Qloo harness adapter runs grounded recommend workflows", async () => {
  const calls = [];
  const runner = async (request) => {
    calls.push(request);
    return {
      status: "ok",
      summary: `Resolved ${request.input.target_type}`,
      results: [{ id: `qloo-${request.input.target_type}`, name: `${request.input.target_type} match`, affinity: 0.9 }],
      execution: { transport: "cli" },
      provenance: { endpoint: "/v2/insights" }
    };
  };
  const adapter = new QlooHarnessAdapter({ runner, apiKey: "event-key" });
  const result = await adapter.analyze(profile);

  assert.equal(result.provider, "qloo-harness");
  assert.equal(result.affinities.length, 4);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.operation === "recommend"));
  assert.ok(calls.every((call) => call.input.explain === true));
  assert.deepEqual(calls[0].input.signals, profile.tastes);
  assert.match(result.disclaimer, /official qloo exec recommend/);
});

test("Channel3 adapter calls search for discovery and never a checkout endpoint", { concurrency: false }, async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ products: [{ id: "p1", title: "Gift", price: 40, currency: "USD", offers: [{ url: "https://merchant.example/item" }] }] }), { status: 200 });
  };
  t.after(() => { global.fetch = originalFetch; });

  const adapter = new Channel3Adapter({ apiKey: "channel-key", baseUrl: "https://api.trychannel3.com", country: "US", currency: "USD" });
  const result = await adapter.search({ query: "jazz design gift", budget: 80, currency: "USD" });
  assert.equal(result.products.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, "/v1/search");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["x-api-key"], "channel-key");
  assert.doesNotMatch(calls[0].url, /checkout/i);
});

test("PayPal live adapter refuses a production base URL", () => {
  assert.throws(() => new PayPalSandboxAdapter({
    clientId: "id",
    clientSecret: "secret",
    baseUrl: "https://api-m.paypal.com",
    returnUrl: "http://localhost/return",
    cancelUrl: "http://localhost/cancel"
  }), /Sandbox only/);
});
