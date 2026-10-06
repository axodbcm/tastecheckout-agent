# Deployment runbook

TasteCheckout needs a server runtime because Qloo credentials must never reach
the browser. The included container pins the Node.js version required by the
official Qloo Hackathon Kit.

Current public deployment: <https://tastecheckout-agent.onrender.com>. It runs
on Render's free Docker service in disclosed demo mode until the event key is
delivered. The service may take roughly a minute to wake after inactivity.

## Minimum hosted configuration

Build the repository with `Dockerfile`, expose the platform-provided `PORT`,
and configure these server-side variables:

```text
APP_ORIGIN=https://your-public-host.example
QLOO_MODE=live
QLOO_SURFACE=harness
QLOO_API_KEY=<event-issued credential>
QLOO_COMMAND=qloo
CATALOG_MODE=demo
PAYPAL_MODE=demo
APPROVAL_SECRET=<long random value>
```

`QLOO_API_KEY` and `APPROVAL_SECRET` are secrets. Add them through the hosting
provider's encrypted environment settings, never through a commit, build
argument, browser field in the application, screenshot, or demo recording.
`CATALOG_MODE` and `PAYPAL_MODE` can remain `demo` for the Qloo submission so
the contest path cannot create a real order or move money.

## Container verification

With Docker installed:

```bash
docker build -t tastecheckout-agent .
docker run --rm -p 4173:4173 \
  -e QLOO_MODE=demo \
  -e CATALOG_MODE=demo \
  -e PAYPAL_MODE=demo \
  tastecheckout-agent
```

Check `http://localhost:4173/api/health`, then run a complete recommendation
flow at `http://localhost:4173`.

## Live Qloo smoke test

After the event credential is present only in the hosted server environment:

1. Open `/api/health` and verify that `qloo` reports `live`.
2. Submit a brief containing public cultural interests only.
3. Confirm that the trace identifies the Qloo harness and real provenance.
4. Confirm that the interface does not display the credential or personal data.
5. Keep the returned trace and one redacted screenshot as submission evidence.

If the harness fails, do not silently fall back and claim a live result. Switch
the deployment back to disclosed demo mode until the credential or integration
is repaired.

## Dependency note

The contest currently requires `@qloo/qloo-harness` 0.1.26. An audit on
2026-10-06 reported four transitive advisories (two moderate and two high), with
no complete fix available from the required package. The adapter therefore
executes the harness as a bounded subprocess with a 30-second timeout and a
2 MiB output cap. Re-run `npm audit --omit=dev` before final submission and
upgrade when Qloo publishes a compatible patched release.
