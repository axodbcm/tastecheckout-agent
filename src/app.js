import fs from "node:fs/promises";
import path from "node:path";
import { createCatalogAdapter } from "./adapters/catalog.js";
import { createPayPalAdapter } from "./adapters/paypal.js";
import { createQlooAdapter } from "./adapters/qloo.js";
import { approvalToken, buildGiftPlan, safeTokenEqual } from "./domain/agent.js";
import { MemoryStore } from "./domain/store.js";
import { publicError, requestId } from "./utils.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function securityHeaders(response, id) {
  response.setHeader("X-Request-Id", id);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error("Request body is too large."), { status: 413, code: "BODY_TOO_LARGE" });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400, code: "INVALID_JSON" });
  }
}

function publicPlan(plan, secret) {
  return { ...plan, approvalToken: approvalToken(plan, secret) };
}

function publicOrder(order) {
  const { providerOrderId, ...visible } = order;
  return visible;
}

async function serveStatic(response, publicDir, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = path.resolve(publicDir, relative);
  const root = path.resolve(publicDir) + path.sep;
  if (!target.startsWith(root)) return false;
  try {
    const data = await fs.readFile(target);
    response.statusCode = 200;
    response.setHeader("Content-Type", MIME[path.extname(target)] || "application/octet-stream");
    response.setHeader("Cache-Control", target.endsWith("index.html") ? "no-cache" : "public, max-age=300");
    response.end(data);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return false;
    throw error;
  }
}

export function createRuntime(config, overrides = {}) {
  const qloo = overrides.qloo || createQlooAdapter(config.qloo);
  const catalog = overrides.catalog || createCatalogAdapter(config.catalog);
  const paypal = overrides.paypal || createPayPalAdapter(config.paypal);
  const store = overrides.store || new MemoryStore();
  const limits = new Map();

  function rateLimited(request) {
    const key = request.socket.remoteAddress || "local";
    const now = Date.now();
    const current = limits.get(key) || { start: now, count: 0 };
    if (now - current.start > 60_000) {
      current.start = now;
      current.count = 0;
    }
    current.count += 1;
    limits.set(key, current);
    return current.count > 120;
  }

  const handler = async (request, response) => {
    const id = requestId();
    securityHeaders(response, id);
    try {
      if (rateLimited(request)) throw Object.assign(new Error("Too many requests."), { status: 429, code: "RATE_LIMITED" });
      const url = new URL(request.url, config.origin);
      const method = request.method || "GET";

      if (method === "GET" && url.pathname === "/api/health") {
        return sendJson(response, 200, {
          status: "ok",
          service: "tastecheckout-agent",
          adapters: { qloo: qloo.mode, catalog: catalog.mode, paypal: paypal.mode },
          safeguards: { paypalServerSide: true, payerApprovalBeforeCapture: true, channel3DiscoveryOnly: true }
        });
      }

      if (method === "POST" && url.pathname === "/api/plans") {
        const plan = await buildGiftPlan(await readJson(request), { qloo, catalog });
        store.savePlan(plan);
        return sendJson(response, 201, publicPlan(plan, config.approvalSecret));
      }

      const traceMatch = url.pathname.match(/^\/api\/plans\/([^/]+)\/traces$/);
      if (method === "GET" && traceMatch) {
        const plan = store.getPlan(traceMatch[1]);
        return sendJson(response, 200, { planId: plan.id, trace: plan.trace });
      }

      const approveMatch = url.pathname.match(/^\/api\/plans\/([^/]+)\/approve$/);
      if (method === "POST" && approveMatch) {
        const body = await readJson(request);
        const plan = store.getPlan(approveMatch[1]);
        const expectedToken = approvalToken(plan, config.approvalSecret);
        if (!safeTokenEqual(body.approvalToken, expectedToken)) {
          throw Object.assign(new Error("The plan approval token is missing, stale, or invalid."), { status: 409, code: "INVALID_APPROVAL_TOKEN" });
        }
        if (body.confirmation !== "I APPROVE THIS PURCHASE") {
          throw Object.assign(new Error("Explicit human purchase approval is required."), { status: 409, code: "HUMAN_APPROVAL_REQUIRED" });
        }
        const approval = store.beginApproval(plan.id, body.productId);
        if (approval.repeated) return sendJson(response, 200, publicOrder(approval.order));
        try {
          const providerOrder = await paypal.createOrder({
            referenceId: `${plan.id}:${approval.product.id}`,
            item: approval.product,
            returnUrl: config.paypal.returnUrl,
            cancelUrl: config.paypal.cancelUrl
          });
          plan.trace.push({ stage: "checkout", provider: paypal.name, action: "create server-side PayPal order after human approval", status: "ok", durationMs: 0, input: approval.product.id, output: providerOrder.status });
          const order = store.completeApproval(plan.id, providerOrder, paypal.name);
          return sendJson(response, 201, publicOrder(order));
        } catch (error) {
          store.failApproval(plan.id);
          throw error;
        }
      }

      const demoApprovalMatch = url.pathname.match(/^\/api\/demo\/orders\/([^/]+)\/payer-approve$/);
      if (method === "POST" && demoApprovalMatch) {
        if (paypal.mode !== "demo") throw Object.assign(new Error("Demo payer approval is disabled outside demo mode."), { status: 404 });
        const order = store.getOrder(demoApprovalMatch[1]);
        const provider = await paypal.simulatePayerApproval(order.providerOrderId);
        store.markPayerApproved(order.id, provider.status);
        return sendJson(response, 200, publicOrder(order));
      }

      const captureMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/capture$/);
      if (method === "POST" && captureMatch) {
        const order = store.getOrder(captureMatch[1]);
        const providerState = await paypal.getOrder(order.providerOrderId);
        if (providerState.status !== "APPROVED") {
          throw Object.assign(new Error("Capture blocked: PayPal has not verified payer approval."), { status: 409, code: "PAYER_APPROVAL_REQUIRED" });
        }
        const capture = await paypal.captureOrder(order.providerOrderId);
        store.markCaptured(order.id, capture);
        const plan = store.getPlan(order.planId);
        plan.trace.push({ stage: "capture", provider: paypal.name, action: "verify payer approval then capture server-side", status: "ok", durationMs: 0, input: order.id, output: capture.status });
        return sendJson(response, 200, publicOrder(order));
      }

      const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
      if (method === "GET" && orderMatch) return sendJson(response, 200, publicOrder(store.getOrder(orderMatch[1])));

      if ((method === "GET" || method === "HEAD") && !url.pathname.startsWith("/api/")) {
        if (await serveStatic(response, config.publicDir, url.pathname)) return;
      }
      sendJson(response, 404, { error: "Not found.", code: "NOT_FOUND" });
    } catch (error) {
      const exposed = publicError(error);
      sendJson(response, exposed.status, { ...exposed.body, requestId: id });
    }
  };

  return { handler, store, adapters: { qloo, catalog, paypal } };
}
