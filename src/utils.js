import crypto from "node:crypto";

export function stableHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function stableId(prefix, value) {
  return `${prefix}_${stableHash(value).slice(0, 14)}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function words(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

export function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

export function jsonSafeSummary(value, max = 180) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function fetchJson(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    if (!response.ok) {
      const detail = body?.message || body?.error_description || body?.name || response.statusText;
      const error = new Error(`Upstream request failed (${response.status}): ${detail}`);
      error.status = 502;
      error.upstreamStatus = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export function publicError(error) {
  const status = Number(error.status) || 500;
  return {
    status: status >= 400 && status < 600 ? status : 500,
    body: {
      error: status >= 500 ? "The request could not be completed." : error.message,
      code: error.code || "REQUEST_FAILED"
    }
  };
}

export function requestId() {
  return crypto.randomUUID();
}
