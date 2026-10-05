import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createRuntime } from "../src/app.js";
import { loadConfig } from "../src/config.js";

async function startTestServer() {
  const config = loadConfig({
    PORT: "0",
    APP_ORIGIN: "http://127.0.0.1",
    DATA_MODE: "demo",
    QLOO_MODE: "demo",
    CATALOG_MODE: "demo",
    PAYPAL_MODE: "demo",
    APPROVAL_SECRET: "test-secret-with-enough-entropy"
  });
  const runtime = createRuntime(config);
  const server = http.createServer(runtime.handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { runtime, server, baseUrl: `http://127.0.0.1:${port}` };
}

async function json(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  return { response, body: await response.json() };
}

test("human approval and payer approval are both enforced before capture", async (t) => {
  const { runtime, server, baseUrl } = await startTestServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const created = await json(baseUrl, "/api/plans", {
    method: "POST",
    body: JSON.stringify({
      recipient: "Maya",
      relationship: "friend",
      occasion: "Birthday",
      tastes: ["jazz", "hiking"],
      avoid: [],
      note: "",
      budget: 85,
      currency: "USD"
    })
  });
  assert.equal(created.response.status, 201);
  assert.equal(runtime.store.orders.size, 0, "planning must not create a PayPal order");
  const plan = created.body;
  const productId = plan.recommendations[0].id;

  const noHumanApproval = await json(baseUrl, `/api/plans/${plan.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ productId, approvalToken: plan.approvalToken })
  });
  assert.equal(noHumanApproval.response.status, 409);
  assert.equal(noHumanApproval.body.code, "HUMAN_APPROVAL_REQUIRED");
  assert.equal(runtime.store.orders.size, 0);

  const staleToken = await json(baseUrl, `/api/plans/${plan.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ productId, approvalToken: "0".repeat(64), confirmation: "I APPROVE THIS PURCHASE" })
  });
  assert.equal(staleToken.response.status, 409);
  assert.equal(staleToken.body.code, "INVALID_APPROVAL_TOKEN");
  assert.equal(runtime.store.orders.size, 0);

  const approved = await json(baseUrl, `/api/plans/${plan.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ productId, approvalToken: plan.approvalToken, confirmation: "I APPROVE THIS PURCHASE" })
  });
  assert.equal(approved.response.status, 201);
  assert.equal(approved.body.status, "CREATED");

  const repeatedApproval = await json(baseUrl, `/api/plans/${plan.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ productId, approvalToken: plan.approvalToken, confirmation: "I APPROVE THIS PURCHASE" })
  });
  assert.equal(repeatedApproval.response.status, 200);
  assert.equal(repeatedApproval.body.id, approved.body.id);
  assert.equal(runtime.store.orders.size, 1, "approval replay must not create a second order");

  const prematureCapture = await json(baseUrl, `/api/orders/${approved.body.id}/capture`, { method: "POST", body: "{}" });
  assert.equal(prematureCapture.response.status, 409);
  assert.equal(prematureCapture.body.code, "PAYER_APPROVAL_REQUIRED");

  const payerApproved = await json(baseUrl, `/api/demo/orders/${approved.body.id}/payer-approve`, { method: "POST", body: "{}" });
  assert.equal(payerApproved.response.status, 200);
  assert.equal(payerApproved.body.status, "APPROVED");

  const captured = await json(baseUrl, `/api/orders/${approved.body.id}/capture`, { method: "POST", body: "{}" });
  assert.equal(captured.response.status, 200);
  assert.equal(captured.body.status, "COMPLETED");
  assert.ok(captured.body.captureId);
});

test("health endpoint states the integration boundaries", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { response, body } = await json(baseUrl, "/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(body.safeguards, { paypalServerSide: true, payerApprovalBeforeCapture: true, channel3DiscoveryOnly: true });
});
