# Technology Stack

**Analysis Date:** 2026-06-09

## Languages

**Primary:**
- TypeScript — all source files under `src/` (`.ts`)

**Secondary:**
- Not applicable

## Runtime

**Environment:**
- Node.js 24 (pinned in `.github/workflows/ci.yml` via `actions/setup-node`)

**Package Manager:**
- pnpm (via corepack — `corepack enable` in CI)
- Lockfile: not committed (CI uses `--no-frozen-lockfile` for standalone install)

## Frameworks

**Core:**
- None (pure library/connector package — no web server or application framework)

**Testing:**
- Vitest ^4.1.6 — test runner; config at `vitest.config.ts`; tests in `src/__tests__/`

**Build/Dev:**
- TypeScript compiler (`tsc`) — config at `tsconfig.json`; targets ES2023, ESNext modules, `bundler` moduleResolution

## Key Dependencies

**Critical:**
- `zod` ^4.4.3 — runtime schema validation for MCP tool input (`src/mcp/module.ts`, `src/register.ts`)
- `server-only` 0.0.1 — Next.js/RSC guard; prevents server-side modules from being imported in browser bundles; applied at top of `src/facade.ts`, `src/registry.ts`, `src/mcp/module.ts`, `src/register.ts`

**Peer Dependencies:**
- `@cinatra-ai/sdk-extensions` (optional peer, any version) — provides `ExtensionHostContext`, `SocialMediaConnectorDefinition`, and the `social-contract` sub-path export; resolved only inside the cinatra monorepo, not from a public registry

## Configuration

**Environment:**
- No `.env` file detected; connector does not read env vars directly — host injects deps via `configureSocialMediaSystem(deps)`
- The `cinatra` field in `package.json` declares the extension manifest: `apiVersion: cinatra.ai/v1`, `kind: connector`, `serverEntry: ./register`, `requestedHostPorts: ["mcp", "authSession"]`, `sdkAbiRange: "^2"`

**Build:**
- `tsconfig.json` — strict mode, `verbatimModuleSyntax`, `isolatedModules`, emits to `dist/`, declarations and source maps enabled

## Platform Requirements

**Development:**
- Node.js 24+, pnpm (corepack)
- Must be consumed inside the cinatra monorepo workspace for type resolution of `@cinatra-ai/sdk-extensions`

**Production:**
- Deployed as a Cinatra Marketplace extension via the reusable GitHub Actions release workflow (`cinatra-ai/.github/.github/workflows/reusable-extension-release.yml`)
- Package published to `registry.cinatra.ai` (Cinatra internal registry), not npm

---

*Stack analysis: 2026-06-09*
