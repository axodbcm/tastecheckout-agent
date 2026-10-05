import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODES = new Set(["demo", "live"]);

function mode(value, fallback) {
  const selected = String(value || fallback).toLowerCase();
  if (!MODES.has(selected)) {
    throw new Error(`Unsupported adapter mode: ${selected}`);
  }
  return selected;
}

function requiredWhenLive(selectedMode, value, name) {
  if (selectedMode === "live" && !value) {
    throw new Error(`${name} is required when its adapter runs in live mode`);
  }
  return value || "";
}

export function loadConfig(env = process.env) {
  const dataMode = mode(env.DATA_MODE, "demo");
  const qlooMode = mode(env.QLOO_MODE, dataMode);
  const catalogMode = mode(env.CATALOG_MODE, dataMode);
  const paypalMode = mode(env.PAYPAL_MODE, dataMode);
  const origin = env.APP_ORIGIN || `http://localhost:${env.PORT || 4173}`;

  return Object.freeze({
    port: Number(env.PORT || 4173),
    origin,
    publicDir: path.join(ROOT, "public"),
    rootDir: ROOT,
    approvalSecret: env.APPROVAL_SECRET || "local-demo-only-secret",
    qloo: {
      mode: qlooMode,
      surface: env.QLOO_SURFACE || "harness",
      apiKey: env.QLOO_API_KEY || "",
      command: env.QLOO_COMMAND || "qloo",
      timeoutMs: Number(env.QLOO_TIMEOUT_MS || 30_000),
      baseUrl: env.QLOO_BASE_URL || "https://hackathon.api.qloo.com"
    },
    catalog: {
      mode: catalogMode,
      apiKey: requiredWhenLive(catalogMode, env.CHANNEL3_API_KEY, "CHANNEL3_API_KEY"),
      baseUrl: env.CHANNEL3_BASE_URL || "https://api.trychannel3.com",
      country: env.CHANNEL3_COUNTRY || "US",
      currency: env.CHANNEL3_CURRENCY || "USD"
    },
    paypal: {
      mode: paypalMode,
      clientId: requiredWhenLive(paypalMode, env.PAYPAL_CLIENT_ID, "PAYPAL_CLIENT_ID"),
      clientSecret: requiredWhenLive(paypalMode, env.PAYPAL_CLIENT_SECRET, "PAYPAL_CLIENT_SECRET"),
      baseUrl: env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com",
      returnUrl: env.PAYPAL_RETURN_URL || `${origin}/?paypal=return`,
      cancelUrl: env.PAYPAL_CANCEL_URL || `${origin}/?paypal=cancel`
    }
  });
}

export { ROOT };
