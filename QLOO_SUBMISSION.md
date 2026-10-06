# Qloo Agentic Hackathon submission draft

Status: **public source repository; Devpost registration and project draft complete; live demo and final submission pending**.

## Project name

TasteCheckout

## Tagline

Culturally fluent gifting, grounded by Qloo and kept human.

## Short description

TasteCheckout is an agentic gift-shopping experience that turns the things a person loves into thoughtful, explainable gift territory. Qloo resolves a few cultural touchstones into cross-domain affinities; the agent uses those affinities to discover and rank gifts under a hard budget; a human chooses what moves forward.

## Inspiration

Most gift recommenders reduce people to age, gender, and popular products. The hard part is not finding something purchasable—it is understanding why an object would feel personally meaningful. A recipient may love a film studio, a music scene, a hiking ritual, and a design tradition at the same time. Qloo makes those cross-domain connections computable.

## What it does

The user enters 2–6 cultural interests, a relationship, an occasion, budget, exclusions, and optional context. TasteCheckout then:

1. sends the stated interests to the official `qloo exec recommend` workflow;
2. runs validated brand, book, artist, and movie recommendation workflows with explainability enabled;
3. composes a culturally grounded gift-search brief;
4. discovers products through Channel3 or a disclosed demo catalog;
5. ranks products by cultural relevance, budget fit, and exclusions;
6. explains each recommendation through a retained Qloo affinity;
7. stops for human selection before checkout.

The product only becomes useful because Qloo can connect preferences across domains. Removing Qloo leaves a generic keyword search; keeping it produces reasons that reflect a person's cultural constellation.

## How Qloo is central

- Human-readable tastes are resolved by the official Qloo harness rather than treated as ungrounded keywords.
- The harness executes the event's canonical recommend workflow and returns normalized provenance.
- Cross-domain calls generate the cultural vocabulary used for product discovery.
- `feature.explainability=true` is enabled on every Insights request.
- Every displayed gift retains the Qloo affinity that caused it to rank.
- The agent trace visibly distinguishes live Qloo results from deterministic demo data.

## Technology

- Qloo Hackathon Kit: `qloo exec recommend` (0.1.26 or newer)
- Node.js 22.19 server and agent pipeline
- Optional Channel3 `POST /v1/search` discovery adapter
- PayPal Sandbox Orders v2 for the separate commerce boundary
- Accessible vanilla web frontend
- Node test runner and deterministic evaluation harness

## Judging criteria mapping

### Technological implementation

Qloo is used through four grounded, cross-domain recommend workflows. Results are normalized, ranked, explained, traced, and consumed by a downstream discovery agent. The repository includes contract tests for workflow name, structured signals, target domains, provenance, and explainability.

### Design

The experience is a complete responsive workflow: brief → taste map → shortlist → human checkpoint → checkout state. It includes semantic labels, keyboard-selectable recommendations, visible focus, live regions, reduced-motion support, and mobile breakpoints.

### Potential impact

The initial audience is anyone who knows *something* about a recipient but cannot translate that knowledge into a gift. The same pattern can serve client gifting, employee recognition, concierge retail, and culturally grounded commerce agents.

### Quality of the idea

The product treats gifting as a cross-domain taste problem instead of a product-search problem. Qloo is the bridge between cultural identity and commerce, while the human remains the final decision-maker.

## How to test

```bash
npm start
```

Open `http://localhost:4173`. Demo mode needs no credentials and discloses that no Qloo request occurred. For judging with live Qloo, provide these server-side variables:

```text
QLOO_MODE=live
QLOO_SURFACE=harness
QLOO_API_KEY=...
QLOO_COMMAND=qloo
```

No API key is sent to the browser.

The official event kit requires Node.js 22.19 or newer and
`@qloo/qloo-harness` 0.1.26 or newer. The credential may instead be stored by
`qloo setup --qloo`; `QLOO_API_KEY` is only an optional server-side injection.

## Submission text checklist

- [x] Working local application
- [x] Qloo is functionally central
- [x] English description and test instructions
- [x] Open-source MIT license
- [x] Complete source code and environment template
- [x] Official Qloo harness 0.1.26 pinned in the lockfile
- [x] Reproducible Node 22.19 container and deployment runbook
- [x] Deterministic no-key mode
- [x] Architecture, evaluation, security, and traces
- [x] Public GitHub repository URL — https://github.com/axodbcm/tastecheckout-agent
- [x] Registered for the Qloo Agentic Hackathon on Devpost
- [x] TasteCheckout Devpost draft created
- [ ] Externally hosted live demo URL — required by Qloo
- [ ] Final Devpost submission
- [ ] Live Qloo smoke test — requires a Qloo hackathon API key

The Qloo overview explicitly requires a fully published external demo and public
open-source repository. The repository requirement is complete; the hosted demo,
live Qloo smoke test, and Devpost submission are still pending.

## Development assistance disclosure

OpenAI Codex assisted with implementation scaffolding, test creation, documentation, and QA. The entrant remains responsible for understanding, testing, presenting, and owning the work.
