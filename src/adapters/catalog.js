import { DEMO_PRODUCTS } from "../data/demo-catalog.js";
import { fetchJson, words } from "../utils.js";

function numericPrice(value) {
  const candidates = [value, value?.amount, value?.value, value?.amount?.value];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeProduct(product, index, fallbackCurrency) {
  const offer = product?.offers?.find((candidate) => numericPrice(candidate?.price) !== null) || product?.offers?.[0] || {};
  const price = numericPrice(product?.price) ?? numericPrice(offer?.price) ?? numericPrice(product?.min_price);
  const image = product?.image_url || product?.image || product?.images?.[0]?.url || product?.images?.[0] || null;
  return {
    id: String(product?.id || product?.product_id || product?.canonical_product_id || `channel3-${index}`),
    title: product?.title || product?.name || "Catalog item",
    brand: product?.brand?.name || product?.brand_name || product?.brand || "Independent merchant",
    category: product?.category?.name || product?.category_name || product?.categories?.[0]?.name || "gift",
    price,
    currency: product?.currency || offer?.currency || offer?.price?.currency || fallbackCurrency,
    tags: [
      ...(product?.tags || []),
      product?.brand?.name,
      product?.category?.name,
      product?.description
    ].filter(Boolean).flatMap(words).slice(0, 24),
    image,
    accent: "#78a7a0",
    merchantUrl: offer?.url || offer?.merchant_url || product?.url || product?.product_url || null,
    rawSource: "channel3"
  };
}

export class DemoCatalogAdapter {
  constructor() {
    this.name = "channel3-demo-catalog";
    this.mode = "demo";
  }

  async search({ query, budget, currency }) {
    const queryWords = new Set(words(query));
    const products = DEMO_PRODUCTS
      .filter((product) => product.currency === currency)
      .map((product) => ({
        ...product,
        rawSource: "deterministic-demo",
        discoveryScore: product.tags.reduce((score, tag) => score + (queryWords.has(tag) ? 1 : 0), 0)
      }))
      .filter((product) => product.price <= budget * 1.35)
      .sort((a, b) => b.discoveryScore - a.discoveryScore || a.price - b.price);
    return {
      provider: this.name,
      mode: this.mode,
      products,
      disclaimer: "Deterministic demo catalog; no Channel3 API request was made."
    };
  }
}

export class Channel3Adapter {
  constructor({ apiKey, baseUrl, country, currency }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.country = country;
    this.currency = currency;
    this.name = "channel3";
    this.mode = "live";
  }

  async search({ query, budget, currency }) {
    const body = await fetchJson(`${this.baseUrl}/v1/search`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": this.apiKey
      },
      body: JSON.stringify({
        query,
        limit: 30,
        config: { country: this.country, currency: currency || this.currency }
      })
    });
    const rawProducts = Array.isArray(body) ? body : body?.products || body?.results || body?.items || [];
    const products = rawProducts
      .map((product, index) => normalizeProduct(product, index, currency || this.currency))
      .filter((product) => Number.isFinite(product.price) && product.price <= budget * 1.35);

    return {
      provider: this.name,
      mode: this.mode,
      products,
      disclaimer: "Channel3 was used for product discovery only. Checkout remains exclusively with PayPal."
    };
  }
}

export function createCatalogAdapter(config) {
  return config.mode === "live" ? new Channel3Adapter(config) : new DemoCatalogAdapter();
}
