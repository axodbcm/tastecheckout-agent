import { fetchJson, stableId } from "../utils.js";

function approvalLink(body) {
  return body?.links?.find((link) => ["approve", "payer-action"].includes(link.rel))?.href || null;
}

export class DemoPayPalAdapter {
  constructor() {
    this.name = "paypal-demo";
    this.mode = "demo";
    this.orders = new Map();
  }

  async createOrder({ referenceId, item, returnUrl }) {
    const id = stableId("DEMOORDER", `${referenceId}:${item.id}:${item.price}`);
    const order = {
      id,
      status: "CREATED",
      intent: "CAPTURE",
      item,
      links: [{ rel: "payer-action", href: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}demoToken=${id}` }]
    };
    this.orders.set(id, order);
    return { id, status: order.status, approveUrl: approvalLink(order) };
  }

  async simulatePayerApproval(id) {
    const order = this.orders.get(id);
    if (!order) throw Object.assign(new Error("Demo PayPal order not found."), { status: 404 });
    if (order.status !== "CREATED") throw Object.assign(new Error("Only a created order can receive payer approval."), { status: 409 });
    order.status = "APPROVED";
    return { id, status: order.status };
  }

  async getOrder(id) {
    const order = this.orders.get(id);
    if (!order) throw Object.assign(new Error("Demo PayPal order not found."), { status: 404 });
    return { id, status: order.status };
  }

  async captureOrder(id) {
    const order = this.orders.get(id);
    if (!order) throw Object.assign(new Error("Demo PayPal order not found."), { status: 404 });
    if (order.status !== "APPROVED") {
      throw Object.assign(new Error("Payer approval must be verified before capture."), { status: 409, code: "PAYER_APPROVAL_REQUIRED" });
    }
    order.status = "COMPLETED";
    return { id, status: order.status, captureId: stableId("DEMOCAPTURE", id) };
  }
}

export class PayPalSandboxAdapter {
  constructor({ clientId, clientSecret, baseUrl, returnUrl, cancelUrl }) {
    const hostname = new URL(baseUrl).hostname;
    if (!hostname.includes("sandbox.paypal.com")) {
      throw new Error("This project intentionally permits PayPal Sandbox only.");
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.returnUrl = returnUrl;
    this.cancelUrl = cancelUrl;
    this.name = "paypal-sandbox";
    this.mode = "live";
  }

  async accessToken() {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const body = await fetchJson(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${credentials}`
      },
      body: "grant_type=client_credentials"
    });
    return body.access_token;
  }

  async request(path, { method = "GET", body, idempotencyKey } = {}) {
    const token = await this.accessToken();
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      prefer: "return=representation"
    };
    if (idempotencyKey) headers["PayPal-Request-Id"] = idempotencyKey.slice(0, 108);
    return fetchJson(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  async createOrder({ referenceId, item }) {
    const value = Number(item.price).toFixed(2);
    const body = await this.request("/v2/checkout/orders", {
      method: "POST",
      idempotencyKey: `tastecheckout-create-${referenceId}`,
      body: {
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: referenceId,
          description: "Human-approved gift selected by TasteCheckout",
          items: [{
            name: item.title.slice(0, 127),
            description: `Discovered via ${item.rawSource || "catalog"}`.slice(0, 127),
            quantity: "1",
            category: "PHYSICAL_GOODS",
            unit_amount: { currency_code: item.currency, value }
          }],
          amount: {
            currency_code: item.currency,
            value,
            breakdown: { item_total: { currency_code: item.currency, value } }
          }
        }],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: "PAY_NOW",
              return_url: this.returnUrl,
              cancel_url: this.cancelUrl
            }
          }
        }
      }
    });
    return { id: body.id, status: body.status, approveUrl: approvalLink(body) };
  }

  async getOrder(id) {
    const body = await this.request(`/v2/checkout/orders/${encodeURIComponent(id)}`);
    return { id: body.id, status: body.status };
  }

  async captureOrder(id) {
    const current = await this.getOrder(id);
    if (current.status !== "APPROVED") {
      throw Object.assign(new Error("PayPal has not confirmed payer approval; capture is blocked."), { status: 409, code: "PAYER_APPROVAL_REQUIRED" });
    }
    const body = await this.request(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {
      method: "POST",
      body: {},
      idempotencyKey: `tastecheckout-capture-${id}`
    });
    return {
      id: body.id,
      status: body.status,
      captureId: body?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null
    };
  }
}

export function createPayPalAdapter(config) {
  return config.mode === "live" ? new PayPalSandboxAdapter(config) : new DemoPayPalAdapter();
}
