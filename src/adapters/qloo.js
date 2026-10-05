import { fetchJson, stableHash, words } from "../utils.js";
import { QlooHarnessAdapter } from "./qloo-harness.js";

const CULTURAL_EXPANSIONS = {
  jazz: ["vinyl", "night", "improvisation", "design"],
  hiking: ["trail", "outdoors", "nature", "sustainable"],
  animation: ["whimsical", "storytelling", "illustration", "craft"],
  ghibli: ["animation", "japanese", "nature", "whimsical"],
  cinema: ["film", "world", "storytelling", "design"],
  cooking: ["food", "hosting", "craft", "world"],
  photography: ["art", "analog", "cities", "travel"],
  architecture: ["design", "cities", "modern", "art"],
  books: ["literature", "independent", "cozy", "writing"],
  electronic: ["music", "technology", "studio", "creative"],
  travel: ["cities", "world", "culture", "journal"],
  nature: ["outdoors", "forest", "sustainable", "wellness"]
};

function flattenEntities(body) {
  const candidates = [
    body?.results,
    body?.results?.entities,
    body?.data,
    body?.data?.entities,
    body?.entities,
    body?.items
  ];
  return candidates.find(Array.isArray) || [];
}

function entityId(entity) {
  return entity?.entity_id || entity?.id || entity?.entity?.id || entity?.properties?.id;
}

function entityName(entity) {
  return entity?.name || entity?.title || entity?.entity?.name || entity?.properties?.name || "Cultural signal";
}

function entityScore(entity, index) {
  const score = entity?.query?.affinity ?? entity?.affinity ?? entity?.score ?? entity?.popularity;
  const parsed = Number(score);
  return Number.isFinite(parsed) ? parsed : Math.max(0.25, 0.92 - index * 0.08);
}

export class DemoQlooAdapter {
  constructor() {
    this.name = "qloo-demo";
    this.mode = "demo";
  }

  async analyze(profile) {
    const inputWords = [...new Set(profile.tastes.flatMap(words))];
    const expanded = [];
    for (const token of inputWords) {
      expanded.push(token, ...(CULTURAL_EXPANSIONS[token] || []));
    }
    const pool = [...new Set(expanded.length ? expanded : ["design", "culture", "craft", "thoughtful"])]
      .filter((token) => !profile.avoid.flatMap(words).includes(token));
    const seed = Number.parseInt(stableHash(profile.tastes.join("|")).slice(0, 8), 16);
    const affinities = pool
      .map((name, index) => ({
        id: `demo-affinity-${stableHash(name).slice(0, 8)}`,
        name,
        domain: index % 3 === 0 ? "brand" : index % 3 === 1 ? "culture" : "lifestyle",
        score: Number((0.98 - ((index + seed) % 9) * 0.055).toFixed(3)),
        explanation: `Derived from the recipient's stated interest in ${profile.tastes[index % profile.tastes.length] || "culture"}.`
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return {
      provider: this.name,
      mode: this.mode,
      seedEntities: profile.tastes.map((name) => ({ id: `demo-seed-${stableHash(name).slice(0, 8)}`, name })),
      affinities,
      insight: `The strongest gift territory connects ${affinities.slice(0, 3).map((item) => item.name).join(", ")}.`,
      disclaimer: "Deterministic demo data; no Qloo API request was made."
    };
  }
}

export class QlooAdapter {
  constructor({ apiKey, baseUrl }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.name = "qloo";
    this.mode = "live";
  }

  async request(path, params) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
      }
    }
    return fetchJson(url, { headers: { accept: "application/json", "X-Api-Key": this.apiKey } });
  }

  async analyze(profile) {
    const seedResults = await Promise.all(profile.tastes.slice(0, 5).map(async (taste) => {
      const body = await this.request("/search", { query: taste, take: 3 });
      const entity = flattenEntities(body)[0];
      return entity ? { id: entityId(entity), name: entityName(entity), input: taste } : null;
    }));
    const seedEntities = seedResults.filter((entity) => entity?.id);
    if (!seedEntities.length) {
      const error = new Error("Qloo could not resolve any of the supplied tastes to cultural entities.");
      error.status = 422;
      error.code = "QLOO_NO_SIGNALS";
      throw error;
    }

    const ids = seedEntities.map((entity) => entity.id);
    const domains = ["urn:entity:brand", "urn:entity:book", "urn:entity:artist", "urn:entity:movie"];
    const insightBodies = await Promise.all(domains.map((type) => this.request("/v2/insights", {
      "filter.type": type,
      "signal.interests.entities": ids,
      "feature.explainability": "true",
      take: 8
    })));

    const affinities = insightBodies.flatMap((body, domainIndex) => flattenEntities(body).map((entity, index) => ({
      id: entityId(entity),
      name: entityName(entity),
      domain: domains[domainIndex].replace("urn:entity:", ""),
      score: entityScore(entity, index),
      explanation: `Qloo cross-domain affinity from ${seedEntities.map((seedEntity) => seedEntity.name).join(", ")}.`
    })))
      .filter((item) => item.id && item.name)
      .sort((a, b) => b.score - a.score)
      .slice(0, 16);

    if (!affinities.length) {
      const error = new Error("Qloo returned no cross-domain affinities for the resolved taste signals.");
      error.status = 422;
      error.code = "QLOO_NO_AFFINITIES";
      throw error;
    }

    return {
      provider: this.name,
      mode: this.mode,
      seedEntities,
      affinities,
      insight: `Qloo connected the recipient's stated tastes to ${affinities.slice(0, 3).map((item) => item.name).join(", ")}.`,
      disclaimer: "Live cultural affinities returned by Qloo's hackathon API."
    };
  }
}

export function createQlooAdapter(config) {
  if (config.mode !== "live") return new DemoQlooAdapter();
  return config.surface === "direct" ? new QlooAdapter(config) : new QlooHarnessAdapter(config);
}

export { QlooHarnessAdapter } from "./qloo-harness.js";
