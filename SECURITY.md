# Security and safety model

TasteCheckout is a hackathon prototype with a deliberately narrow payment boundary. The application can be safely demonstrated without credentials or money in deterministic demo mode. Live payment support is restricted to PayPal Sandbox.

## Enforced controls

### Secrets stay server-side

Qloo, Channel3, and PayPal credentials are read only by server-side adapters. Live Qloo runs through the official local `qloo` harness process and receives its credential from private harness configuration or the child-process environment. The browser receives neither secrets nor OAuth access tokens. PayPal Orders v2 is never called directly from frontend code.

### Sandbox-only PayPal

`PayPalSandboxAdapter` rejects a base URL whose hostname does not contain `sandbox.paypal.com`. This is a fail-closed safeguard against accidentally pointing a hackathon deployment at production payments.

### Two approval boundaries

1. **Gift-giver approval:** the selected item must belong to the stored plan; a valid HMAC token and explicit confirmation are required before order creation.
2. **Payer approval:** before capture, the server retrieves the order from PayPal and requires provider status `APPROVED`.

The client cannot unlock capture by sending a boolean or editing UI state.

### Idempotency and state checks

Create and capture requests send `PayPal-Request-Id` values. The local state machine rejects invalid transitions and duplicate plan checkout reuses the stored order rather than intentionally creating another one.

### Input and HTTP hardening

- request bodies are limited to 64 KiB;
- text lengths, list counts, budget range, and currency are validated;
- external destinations are fixed by server configuration, preventing user-controlled SSRF targets;
- static paths are resolved under the public directory;
- security headers include CSP, `nosniff`, no-referrer, restricted permissions, and frame denial;
- a simple per-address rate limit protects the prototype;
- API errors do not expose upstream response bodies or credentials.

## Data handling

The prototype keeps plans and checkout state in memory and loses them on restart. It does not implement accounts, analytics, cookies, behavioral tracking, or durable personal-data storage. Do not enter sensitive personal or financial information into the gift brief.

## Known production gaps

Before real-world use, add:

- authenticated user sessions and ownership checks;
- CSRF protection tied to those sessions;
- a transactional persistent database;
- distributed rate limiting;
- structured audit-log storage with retention controls;
- webhook verification and reconciliation;
- inventory/price revalidation at checkout;
- merchant fulfillment and refund handling;
- privacy policy, data deletion, and jurisdiction-specific compliance;
- dependency and infrastructure scanning.

This code must not be switched to PayPal production without a separate security, legal, and commerce review.
