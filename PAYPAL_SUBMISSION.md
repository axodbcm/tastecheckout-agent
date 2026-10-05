# PayPal AI Hackathon submission draft

Status: **prepared locally; not registered, published, filmed, or submitted**.

## Project name

TasteCheckout

## Tagline

An AI gift agent that understands taste—and knows when to stop and ask.

## Short description

TasteCheckout combines Qloo cultural intelligence with PayPal Sandbox to create a safer agentic-commerce workflow. The agent turns a recipient's cultural interests into an explainable, budget-safe shortlist. A human selects and explicitly approves one gift before the server creates a PayPal order. The payer then approves in PayPal, and the server verifies that state before capture.

## The problem

Shopping agents face two trust failures: recommendations can be generic, and transaction automation can move faster than human intent. TasteCheckout addresses both. Qloo improves what the agent recommends; PayPal provides a real, inspectable payment state machine; explicit approval boundaries keep the person in control.

## Meaningful use of PayPal + AI

### AI

Qloo is the cultural-intelligence platform at the center of the agent. It resolves taste entities, generates cross-domain affinities, and grounds every recommendation. The local decision layer applies transparent budget and exclusion constraints rather than hiding them in a black box.

### PayPal

PayPal is not a decorative button. Orders v2 defines the transaction lifecycle:

1. the server obtains Sandbox OAuth credentials;
2. only after human approval, the server creates an order with itemized amount data;
3. PayPal returns a payer-action URL;
4. the payer approves in Sandbox;
5. the server retrieves the order and requires `APPROVED`;
6. only then does the server call capture with an idempotency key.

Credentials and access tokens never enter the browser. A client-supplied approval boolean cannot bypass provider verification.

## Channel3 boundary

Channel3 is used only for `POST /v1/search` product discovery. Channel3 publicly lists `/lookup` as available and `/checkout` as coming soon. TasteCheckout therefore does not call, simulate, or claim Channel3 checkout; PayPal remains the sole checkout implementation.

## Judging criteria mapping

### Technological implementation

The project integrates PayPal Sandbox OAuth and Orders v2 create, retrieve, and capture operations on the server. It combines those operations with a multi-stage Qloo agent, signed plan approvals, idempotency, traces, adapter contract tests, and negative state-transition tests.

### Design

The UI presents recommendation reasoning and money state with equal clarity. Buttons remain disabled until their prerequisites are met; order status is visible; demo and live modes are disclosed; the layout is responsive and keyboard accessible.

### Potential impact

The approval architecture generalizes to any agentic purchase where personalization and user trust matter: gifts, travel add-ons, procurement, personal shopping, and concierge services.

### Innovation / idea

Instead of optimizing for maximum automation, TasteCheckout treats restraint as a product feature. The agent is culturally capable enough to narrow the field, but the payment boundary is explicitly human.

### Presentation

The end-to-end story fits in under three minutes and exposes visible state changes: taste resolution, explainable shortlist, blocked order creation, human approval, blocked capture, payer approval, and completed capture.

## Under-three-minute demo script

**0:00–0:20 — Problem.** “Gift search knows inventory, not people. Commerce agents can also act before intent is clear. TasteCheckout solves both.”

**0:20–0:45 — Brief.** Show the recipient's films, music, hobbies, budget, and exclusions. Submit.

**0:45–1:15 — Qloo.** Show cross-domain affinities and open the agent trace. Point out `/search`, `/v2/insights`, and explainability.

**1:15–1:45 — Decisions.** Compare two cards. Show the retained Qloo affinity, fit score, exact price, and budget compliance.

**1:45–2:05 — Human gate.** Show that the approval button is disabled. Select a gift, check the review control, and create the PayPal Sandbox order.

**2:05–2:35 — PayPal.** Open the payer-action URL and approve with a Sandbox payer. Return to the app.

**2:35–2:50 — Capture.** Ask the server to verify and capture. Show `COMPLETED`.

**2:50–3:00 — Close.** “Cultural intelligence chooses better territory. PayPal makes the transaction real. The human stays in control.”

## How to run

```bash
npm start
```

Default demo mode requires no credentials and never moves money. Live PayPal judging requires only server-side variables:

```text
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_RETURN_URL=https://YOUR-DEMO/?paypal=return
PAYPAL_CANCEL_URL=https://YOUR-DEMO/?paypal=cancel
```

## Submission checklist

- [x] PayPal and AI are central
- [x] Functional local build and complete setup instructions
- [x] Public-ready MIT license
- [x] Server-side Sandbox Orders v2 implementation
- [x] Human-approval and payer-approval tests
- [x] Architecture, evaluation, traces, and security documentation
- [ ] Public GitHub repository URL — requires owner approval
- [ ] Hosted demo URL or judge-ready repository — requires owner approval
- [ ] Public YouTube demo under three minutes — required; requires owner approval
- [ ] Devpost registration and final submission — requires owner action
- [ ] Live Sandbox smoke test — requires PayPal Sandbox credentials

## Tools used

Node.js, Qloo Hackathon API, optional Channel3 Product API, PayPal Sandbox Orders v2, HTML, CSS, JavaScript, and the Node test runner.

## Development assistance disclosure

OpenAI Codex assisted with implementation scaffolding, test creation, documentation, and QA. The entrant remains responsible for understanding, testing, presenting, and owning the work.
