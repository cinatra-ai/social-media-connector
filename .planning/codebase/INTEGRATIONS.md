# External Integrations

**Analysis Date:** 2026-06-09

## APIs & External Services

**Social Media Providers (via pluggable connector interface):**
- LinkedIn — the first concrete provider; implemented in the separate `@cinatra-ai/linkedin-connector` package (not in this repo). This package defines the provider-agnostic contract and routing facade that the LinkedIn connector satisfies.
- Future providers (Twitter/X, Threads, Mastodon, Bluesky) — referenced in code comments in `src/mcp/module.ts` and `src/register.ts`; none are implemented here.
  - SDK/Client: provider packages implement `SocialMediaConnector` from `@cinatra-ai/sdk-extensions/social-contract`
  - Auth: resolved externally by the host via `ctx.authSession.getActor()` (injected through `ExtensionHostContext`)

**Cinatra MCP Server:**
- The connector registers a `social_media_publish` MCP tool via two paths:
  - `src/register.ts` — IoC path using `ctx.mcp.registerTool` (SDK-native, uses `ExtensionHostContext`)
  - `src/mcp/module.ts` — legacy host-static path using structural `SocialToolServer` interface (`registerSocialMediaPrimitives`, `createSocialMediaModule`)
- Tool input schema defined with `zod` in both files

## Data Storage

**Databases:**
- Not applicable — this package has no direct database access. Provider-specific account/credential storage is owned by concrete connector packages and the host.

**File Storage:**
- Not applicable

**Caching:**
- Not applicable

## Authentication & Identity

**Auth Provider:**
- Host-injected via `ctx.authSession.getActor()` in `src/register.ts` — returns `{ userId, organizationId }`
- Legacy path uses a `SocialPublishActorResolver` callback injected into `registerSocialMediaPrimitives` in `src/mcp/module.ts`
- The connector itself performs no auth — it reads a trusted actor resolved by the host

## Monitoring & Observability

**Error Tracking:**
- Not detected — no error tracking SDK imported

**Logs:**
- `console.warn` in `src/registry.ts` for duplicate connector registration

## CI/CD & Deployment

**Hosting:**
- Cinatra Marketplace / `registry.cinatra.ai` (internal registry)

**CI Pipeline:**
- GitHub Actions: `.github/workflows/ci.yml` — runs on push/PR to `main`
  - Classifies repo as "source mirror" (has `@cinatra-ai/*` optional peers) or standalone
  - Source mirror mode: skips standalone install, typecheck, and test (monorepo handles those)
  - Standalone mode: runs `pnpm install --no-frozen-lockfile`, `tsc --noEmit`, `pnpm test`, `npm pack --dry-run`
- GitHub Actions: `.github/workflows/release.yml` — triggered on GitHub Release publish or manual `workflow_dispatch`
  - Delegates to `cinatra-ai/.github/.github/workflows/reusable-extension-release.yml@main`
  - Requires `CINATRA_MARKETPLACE_VENDOR_TOKEN` org secret and `id-token: write` permission for provenance attestation

## Environment Configuration

**Required env vars:**
- None directly required by this package — all configuration is injected by the host at runtime via `configureSocialMediaSystem(deps)` and `ExtensionHostContext`

**Secrets location:**
- `CINATRA_MARKETPLACE_VENDOR_TOKEN` — GitHub org secret, used only in release workflow

## Webhooks & Callbacks

**Incoming:**
- Not applicable — this package exposes no HTTP endpoints

**Outgoing:**
- Not applicable — outbound social media API calls are delegated entirely to the concrete provider connector (e.g. `@cinatra-ai/linkedin-connector`)

---

*Integration audit: 2026-06-09*
