import { DemoCatalogAdapter } from "../src/adapters/catalog.js";
import { DemoQlooAdapter } from "../src/adapters/qloo.js";
import { buildGiftPlan } from "../src/domain/agent.js";

const scenarios = [
  { recipient: "Maya", relationship: "friend", occasion: "Birthday", tastes: ["jazz", "hiking", "Japanese craft"], avoid: ["alcohol"], note: "Small apartment", budget: 85, currency: "USD" },
  { recipient: "Leo", relationship: "brother", occasion: "Thank you", tastes: ["photography", "architecture", "travel"], avoid: [], note: "Enjoys making things", budget: 95, currency: "USD" },
  { recipient: "Nora", relationship: "colleague", occasion: "Housewarming", tastes: ["cooking", "cinema", "books"], avoid: ["leather"], note: "Hosts small dinners", budget: 70, currency: "USD" },
  { recipient: "Sam", relationship: "partner", occasion: "Anniversary", tastes: ["electronic music", "nature", "design"], avoid: [], note: "Prefers useful gifts", budget: 55, currency: "USD" }
];

const adapters = { qloo: new DemoQlooAdapter(), catalog: new DemoCatalogAdapter() };
const results = [];
for (const scenario of scenarios) {
  const first = await buildGiftPlan(scenario, adapters);
  const second = await buildGiftPlan(scenario, adapters);
  results.push({
    recipient: scenario.recipient,
    recommendations: first.recommendations.length,
    budgetSafe: first.recommendations.every((item) => item.price <= scenario.budget),
    qlooGrounded: first.recommendations.every((item) => item.qlooAffinity?.name && item.reason.includes("Qloo")),
    deterministic: JSON.stringify(first.recommendations.map((item) => [item.id, item.fitScore])) === JSON.stringify(second.recommendations.map((item) => [item.id, item.fitScore])),
    completeTrace: ["understand", "discover", "decide"].every((stage) => first.trace.some((entry) => entry.stage === stage))
  });
}

const checks = results.flatMap((result) => [result.budgetSafe, result.qlooGrounded, result.deterministic, result.completeTrace]);
const report = {
  scenarios: results.length,
  passRate: checks.filter(Boolean).length / checks.length,
  thresholds: { minimumRecommendations: 1, requiredPassRate: 1 },
  results
};
console.log(JSON.stringify(report, null, 2));
if (report.passRate !== 1 || results.some((result) => result.recommendations < 1)) process.exitCode = 1;
