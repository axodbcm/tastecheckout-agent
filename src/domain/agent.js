import crypto from "node:crypto";
import { clamp, jsonSafeSummary, roundMoney, words } from "../utils.js";

const CURRENCIES = new Set(["USD", "EUR", "GBP", "CAD", "AUD"]);

function cleanText(value, name, { min = 1, max = 120 } = {}) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length < min || text.length > max) {
    const error = new Error(`${name} must be between ${min} and ${max} characters.`);
    error.status = 422;
    error.code = "INVALID_PROFILE";
    throw error;
  }
  return text;
}

function cleanList(value, name, { min = 0, max = 8 } = {}) {
  const list = (Array.isArray(value) ? value : String(value || "").split(/[,\n]/))
    .map((item) => String(item).trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const unique = [...new Set(list)].slice(0, max + 1);
  if (unique.length < min || unique.length > max || unique.some((item) => item.length > 80)) {
    const error = new Error(`${name} must contain between ${min} and ${max} short entries.`);
    error.status = 422;
    error.code = "INVALID_PROFILE";
    throw error;
  }
  return unique;
}

export function normalizeProfile(input) {
  const budget = Number(input?.budget);
  const currency = String(input?.currency || "USD").toUpperCase();
  if (!Number.isFinite(budget) || budget < 20 || budget > 5000) {
    throw Object.assign(new Error("Budget must be between 20 and 5000."), { status: 422, code: "INVALID_PROFILE" });
  }
  if (!CURRENCIES.has(currency)) {
    throw Object.assign(new Error("Unsupported currency."), { status: 422, code: "INVALID_PROFILE" });
  }
  return {
    recipient: cleanText(input?.recipient, "Recipient", { max: 60 }),
    relationship: cleanText(input?.relationship, "Relationship", { max: 60 }),
    occasion: cleanText(input?.occasion, "Occasion", { max: 60 }),
    note: String(input?.note || "").trim().slice(0, 240),
    tastes: cleanList(input?.tastes, "Tastes", { min: 2, max: 6 }),
    avoid: cleanList(input?.avoid, "Avoid list", { min: 0, max: 6 }),
    budget: roundMoney(budget),
    currency
  };
}

async function traced(trace, stage, provider, action, input, work) {
  const started = Date.now();
  try {
    const result = await work();
    trace.push({
      stage,
      provider,
      action,
      status: "ok",
      durationMs: Date.now() - started,
      input: jsonSafeSummary(input),
      output: jsonSafeSummary(Array.isArray(result?.products) ? `${result.products.length} products` : result?.insight || result?.provider || "completed")
    });
    return result;
  } catch (error) {
    trace.push({ stage, provider, action, status: "error", durationMs: Date.now() - started, input: jsonSafeSummary(input), output: error.code || error.message });
    throw error;
  }
}

function productTokens(product) {
  return new Set(words([product.title, product.brand, product.category, ...(product.tags || [])].join(" ")));
}

function bestAffinity(product, affinities, profile) {
  const tokens = productTokens(product);
  const ranked = affinities.map((affinity) => ({
    affinity,
    overlap: words(affinity.name).filter((token) => tokens.has(token)).length
  })).sort((a, b) => b.overlap - a.overlap || b.affinity.score - a.affinity.score);
  return ranked[0]?.affinity || { name: profile.tastes[0], score: 0.5, domain: "stated taste" };
}

function rankProducts(products, tasteProfile, profile) {
  const interestTokens = new Set([
    ...profile.tastes.flatMap(words),
    ...tasteProfile.affinities.slice(0, 12).flatMap((affinity) => words(affinity.name))
  ]);
  const avoidTokens = new Set(profile.avoid.flatMap(words));

  return products
    .filter((product) => Number.isFinite(product.price) && product.price <= profile.budget && product.currency === profile.currency)
    .map((product) => {
      const tokens = productTokens(product);
      const matches = [...interestTokens].filter((token) => tokens.has(token));
      const avoidMatches = [...avoidTokens].filter((token) => tokens.has(token));
      const tasteScore = clamp(matches.length / 5, 0, 1);
      const budgetScore = 1 - Math.abs(profile.budget * 0.72 - product.price) / profile.budget;
      const discoveryScore = clamp(Number(product.discoveryScore || 0) / 5, 0, 1);
      const score = clamp(tasteScore * 0.58 + budgetScore * 0.27 + discoveryScore * 0.15 - avoidMatches.length * 0.35, 0, 1);
      const affinity = bestAffinity(product, tasteProfile.affinities, profile);
      return {
        ...product,
        fitScore: Math.round(score * 100),
        matchedSignals: matches.slice(0, 5),
        qlooAffinity: { name: affinity.name, domain: affinity.domain, score: affinity.score },
        reason: `${product.title} translates the Qloo affinity “${affinity.name}” into a concrete ${product.category} gift while staying within the ${profile.budget} ${profile.currency} ceiling.`
      };
    })
    .sort((a, b) => b.fitScore - a.fitScore || a.price - b.price)
    .slice(0, 6);
}

function discoveryQuery(profile, tasteProfile) {
  const signals = tasteProfile.affinities.slice(0, 6).map((item) => item.name);
  return [
    `thoughtful ${profile.occasion} gift for a ${profile.relationship}`,
    `interests: ${profile.tastes.join(", ")}`,
    `cultural affinities: ${signals.join(", ")}`,
    profile.note ? `context: ${profile.note}` : ""
  ].filter(Boolean).join("; ");
}

export async function buildGiftPlan(rawProfile, { qloo, catalog }) {
  const profile = normalizeProfile(rawProfile);
  const trace = [];
  const tasteProfile = await traced(trace, "understand", qloo.name, "resolve cultural taste graph", { tastes: profile.tastes }, () => qloo.analyze(profile));
  const query = discoveryQuery(profile, tasteProfile);
  const catalogResult = await traced(trace, "discover", catalog.name, "search product catalog", { query, budget: profile.budget, currency: profile.currency }, () => catalog.search({ query, budget: profile.budget, currency: profile.currency }));
  const recommendations = rankProducts(catalogResult.products, tasteProfile, profile);
  if (!recommendations.length) {
    throw Object.assign(new Error("No products satisfied the budget, currency, and safety filters."), { status: 422, code: "NO_ELIGIBLE_PRODUCTS" });
  }
  trace.push({
    stage: "decide",
    provider: "tastecheckout-ranking-agent",
    action: "rank with cultural fit, budget, and exclusions",
    status: "ok",
    durationMs: 0,
    input: `${catalogResult.products.length} discovered products`,
    output: `${recommendations.length} human-reviewable recommendations`
  });

  return {
    id: crypto.randomUUID(),
    status: "AWAITING_HUMAN_APPROVAL",
    createdAt: new Date().toISOString(),
    profile,
    tasteProfile,
    recommendations,
    trace,
    boundaries: {
      channel3: "Discovery only; Channel3 checkout is not used.",
      paypal: "Order creation and capture are server-side. Capture requires verified payer approval.",
      human: "No PayPal order exists until a person selects and explicitly approves one recommendation."
    }
  };
}

export function approvalToken(plan, secret) {
  const payload = JSON.stringify({
    id: plan.id,
    products: plan.recommendations.map(({ id, price, currency }) => ({ id, price, currency }))
  });
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeTokenEqual(actual, expected) {
  if (typeof actual !== "string" || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
