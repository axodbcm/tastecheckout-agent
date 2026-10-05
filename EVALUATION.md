# Evaluation

## Automated evaluation

Run:

```bash
npm run evaluate
```

The evaluation executes four deterministic briefs spanning music/outdoors/craft, photography/architecture/travel, cooking/cinema/books, and electronic music/nature/design.

Every scenario must pass all of these checks:

| Check | Required result |
| --- | --- |
| Recommendations available | At least one |
| Budget safety | 100% at or below the hard budget ceiling |
| Qloo grounding | 100% retain a Qloo affinity and mention Qloo in the reason |
| Determinism | Same brief yields the same IDs and fit scores |
| Trace completeness | Understand, discover, and decide stages present |

The process exits non-zero if any required check fails.

## Automated tests

`npm test` verifies:

- deterministic Qloo demo output;
- live Qloo request shape, hackathon base URL usage, `X-Api-Key`, `/search`, `/v2/insights`, and explainability;
- Channel3's role is limited to `POST /v1/search`;
- PayPal production URLs are rejected;
- validation and hard budget enforcement;
- no PayPal order exists after planning;
- missing explicit human approval is rejected;
- a stale or forged approval token is rejected;
- capture before payer approval is rejected;
- demo payer approval permits a subsequent capture;
- health metadata exposes the architectural safeguards.

## Manual acceptance script

### Deterministic demo

1. Start with `npm start` and open `http://localhost:4173`.
2. Submit the prefilled Maya brief.
3. Confirm the Qloo taste map and at least four recommendation cards appear.
4. Confirm every card is at or below the displayed budget.
5. Open the agent trace and verify Qloo → catalog → ranking order.
6. Confirm the approval button is disabled until the review checkbox is selected.
7. Approve one gift and confirm order status is `CREATED`.
8. Try capture immediately; confirm the UI reports that payer approval is required.
9. Simulate payer approval; confirm status changes to `APPROVED`.
10. Capture; confirm status changes to `COMPLETED` and the UI states that no money moved.

### Live Qloo

1. Set `QLOO_MODE=live` and `QLOO_API_KEY`.
2. Leave catalog and PayPal in demo mode.
3. Submit a brief containing recognizable cultural entities.
4. Verify the response disclosure says live Qloo and inspect the trace.
5. Verify empty or invalid taste signals fail visibly rather than silently falling back.

### Live PayPal Sandbox

1. Set `PAYPAL_MODE=live`, Sandbox client credentials, and return/cancel URLs.
2. Leave Qloo and catalog in demo mode if desired.
3. Generate and approve a gift.
4. Confirm a Sandbox payer-action link appears.
5. Attempt capture before Sandbox approval; verify rejection.
6. Approve with a Sandbox payer account.
7. Return and capture; verify the server reports `COMPLETED`.

Live-provider acceptance is intentionally not claimed in this repository because no keys were requested or used during development.
