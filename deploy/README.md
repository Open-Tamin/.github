# OpenTamin's one release owner (T=0)

**Authority and scope:** This public `Open-Tamin/.github` repository is the release controller for **only** the private source `Open-Tamin/platform` and the Cloudflare Workers on `opentamin.com`. No KYE workflow, GitHub deployer, secret, budget ledger or runtime service is permitted. The private financial proposal, scenario code and customer data are never committed here.

## Two hard security boundaries
1. `source-read`: protected main-only GitHub environment with **only** `SOURCE_DEPLOY_KEY` (read-only key installed on the private `Open-Tamin/platform` repository). The build job clones exactly main through pinned GitHub SSH host identity, confirms a reviewed two-parent GitHub PR merge commit, unloads the key **before** running any source code, resolves Kit exclusively from the Open-Tamin-owned hash-verified public mirror, builds and seals once, runs the source's Canonical tests and Playwright visual QA, and uploads only the sealed artefact and SHA evidence.
2. `production-opentamin`: separate protected main-only environment. Secrets: `SOURCE_DEPLOY_KEY`, scoped `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `OPS_NOTIFY_TO`, `KISH_ACCESS_PASSWORD` and `KISH_SESSION_SECRET` (optionally `KISH_ALLOWED_EMAILS` and required resilience/drill secrets). The production job re-reads main and requires exactly the tested SHA, verifies the sealed artefact, performs read-only `deploy/opentamin.mjs admit`, then uses Kit's canonical `release ship` for D1 migrations/Workers deployment, followed by SHA-bound smoke and evidence.

**Secrets are not carried in code or PR comments.** Owner must provision the two environments and their main-only policy before any production mutation. The GitHub connection in this chat cannot configure Cloudflare/GitHub environment secrets.

## T=0 adoption of existing production
- `opentamin.com/api/build` already reported a deployed commit, while the private source still declares `release.json.state=bootstrap`. Never re-bootstrap a running Cloudflare Worker or mark the release `ready` without an independent live inventory and signed recovery receipt.
- `/api/health` returned **503** (monitor unknown). A healthy monitor is a pre-effect condition, except during a separately authorised recovery transaction with full Cloudflare inventory, backup and rollback evidence; there is **no** silent bypass in the controller.
- Before removing former KYE references, migrate the canonical Kit registry entry for opentamin to the single `Open-Tamin/.github` deployer. The old KYE controller has **no** OpenTamin project entry; the registry pointer was stale, not an operating service.
- Compare the current Worker bindings, D1 migration revisions (including Kish 0021), R2 backup targets, DNS routes, and historical build receipt. If a required receipt is missing, deployment remains denied.
- Protect `Open-Tamin/.github` main against unreviewed pushes, force push and deletion; require green `OpenTamin control plane canonical tests` and a reviewed merge.
- Execute `.github/workflows/opentamin-production.yml` on protected main with a meaningful reason; its durable GitHub run ID, sealed build SHA, admission receipt, Cloudflare result and seven smoke results become evidence.
- Post-cutover, the one canonical smoke contract asserts `/` 200, `/api/build` 200 with the exact tested SHA, `/api/health` 200, unauthenticated `/kish/` 401, protected Kish JS 403, both Vazirmatn TTFs 200. Authenticated drag/drop and D1 session/consent need live Playwright tests with approved private credentials before inviting the owner.

## Recovery
Every stage is fail-closed; no `continue-on-error`, no retries that repeat D1 changes blindly, no competing deployer. If a mutation starts then fails, preserve the run and Cloudflare receipts, freeze further changes, restore only from a verified last-good checkpoint and owner-reviewed recovery transaction. Do not report a successful launch until post-deploy smoke and functional UX pass.

The only runtime Kit supply is `Open-Tamin/.github`'s own content-addressed GitHub Release mirror; upstream Kit source changes are pulled and SHA-256-verified by `vendor/sync-kit.mjs` outside the production runtime.
