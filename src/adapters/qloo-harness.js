import { spawn } from "node:child_process";

const OUTPUT_LIMIT = 2 * 1024 * 1024;
const ACCEPTED_STATUSES = new Set(["ok", "partial", "degraded"]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function harnessError(message, code = "QLOO_HARNESS_ERROR", status = 502) {
  return Object.assign(new Error(message), { code, status });
}

export function runQlooWorkflow({ command = "qloo", operation, input, timeoutMs = 30_000, apiKey = "" }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["exec", operation], {
      env: { ...process.env, ...(apiKey ? { QLOO_API_KEY: apiKey } : {}) },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const append = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next) > OUTPUT_LIMIT) {
        child.kill();
        finish(reject, harnessError("Qloo harness output exceeded the safety limit.", "QLOO_OUTPUT_TOO_LARGE"));
      }
      return next;
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(reject, harnessError("Qloo harness timed out.", "QLOO_TIMEOUT", 504));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => {
      const hint = error.code === "ENOENT"
        ? "Install @qloo/qloo-harness 0.1.26 or newer and ensure the qloo command is on PATH."
        : error.message;
      finish(reject, harnessError(hint, "QLOO_HARNESS_UNAVAILABLE", 503));
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        const detail = stderr.trim().split(/\r?\n/).slice(-2).join(" ");
        return finish(reject, harnessError(`Qloo harness exited with code ${code}${detail ? `: ${detail}` : "."}`, "QLOO_WORKFLOW_FAILED"));
      }
      try {
        finish(resolve, JSON.parse(stdout));
      } catch {
        finish(reject, harnessError("Qloo harness returned invalid JSON.", "QLOO_INVALID_RESPONSE"));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(input));
  });
}

export class QlooHarnessAdapter {
  constructor({ apiKey = "", command = "qloo", timeoutMs = 30_000, runner = runQlooWorkflow }) {
    this.apiKey = apiKey;
    this.command = command;
    this.timeoutMs = timeoutMs;
    this.runner = runner;
    this.name = "qloo-harness";
    this.mode = "live";
  }

  async analyze(profile) {
    const domains = ["brand", "book", "artist", "movie"];
    const envelopes = await Promise.all(domains.map((targetType) => this.runner({
      command: this.command,
      operation: "recommend",
      input: { target_type: targetType, signals: profile.tastes, explain: true, limit: 6 },
      timeoutMs: this.timeoutMs,
      apiKey: this.apiKey
    })));

    const failed = envelopes.find((envelope) => !ACCEPTED_STATUSES.has(envelope?.status));
    if (failed) {
      const code = failed?.error?.code || "QLOO_NEEDS_INPUT";
      throw harnessError(failed?.summary || "Qloo could not resolve the supplied cultural signals.", code, code === "QLOO_AUTH" ? 503 : 422);
    }

    const affinities = envelopes.flatMap((envelope, domainIndex) => asArray(envelope.results).map((entity, index) => ({
      id: entityId(entity),
      name: entityName(entity),
      domain: domains[domainIndex],
      score: entityScore(entity, index),
      explanation: `Qloo ${domains[domainIndex]} affinity via the official recommend workflow.`
    })))
      .filter((item) => item.id && item.name)
      .sort((a, b) => b.score - a.score)
      .slice(0, 16);

    if (!affinities.length) {
      throw harnessError("Qloo returned no cross-domain affinities for the resolved taste signals.", "QLOO_NO_AFFINITIES", 422);
    }

    return {
      provider: this.name,
      mode: this.mode,
      seedEntities: profile.tastes.map((name) => ({ name })),
      affinities,
      insight: `Qloo connected the recipient's stated tastes to ${affinities.slice(0, 3).map((item) => item.name).join(", ")}.`,
      disclaimer: "Live cultural affinities returned through the official qloo exec recommend workflow.",
      provenance: envelopes.map((envelope, index) => ({
        targetType: domains[index], status: envelope.status, summary: envelope.summary,
        execution: envelope.execution, provenance: envelope.provenance
      }))
    };
  }
}
