# Codebase Concerns

**Analysis Date:** 2026-06-09

## Tech Debt

**Dual registration path (legacy host-static vs SDK IoC):**
- Issue: Two parallel registration paths exist simultaneously. `src/mcp/module.ts` (`createSocialMediaModule` / `registerSocialMediaPrimitives`) is the "legacy host-static" path that is currently production-serving. `src/register.ts` (`register(ctx)`) is the new SDK IoC path. Both register the same `social_media_publish` tool. The host deduplicates by tool name, but this is a fragile coordination contract.
- Files: `src/mcp/module.ts`, `src/register.ts`
- Impact: Maintenance cost of keeping both in sync. Any change to tool schema or behavior must be replicated in both files. Risk of the two paths diverging silently.
- Fix approach: Complete the host→connector cutover described in the comments and delete `src/mcp/module.ts` once the host retires the static registration path.

**`noImplicitAny: false` weakens strict mode:**
- Issue: `tsconfig.json` sets `"strict": true` but then explicitly overrides `"noImplicitAny": false`. This punches a significant hole in type safety — implicit `any` parameters and return types are silently allowed despite the `strict` flag.
- Files: `tsconfig.json`
- Impact: Type-unsafe code can compile without errors. The `any` suppression in `src/mcp/module.ts` line 23 (`eslint-disable-next-line @typescript-eslint/no-explicit-any`) is a visible symptom of this weakness.
- Fix approach: Enable `noImplicitAny: true` (or remove the override entirely), then fix resulting type errors. Start with the structural `SocialToolServer` type in `src/mcp/module.ts`.

**Structural duck-type for `SocialToolServer` uses explicit `any`:**
- Issue: `src/mcp/module.ts` declares a local `SocialToolServer` type with `registerTool(...args: any[]): unknown` to avoid importing from `@cinatra-ai/mcp-server`. This is intentional for IoC but carries the `any` variadic args as permanent tech debt.
- Files: `src/mcp/module.ts` (line 22–25)
- Impact: Type errors in the `registerTool` call signature are invisible to TypeScript. A breaking host API change would not be caught at compile time.
- Fix approach: When the legacy path is retired and only `register(ctx)` remains, remove `src/mcp/module.ts` entirely. Until then, tighten the structural type to match the actual call signature used.

**`nonEmpty` helper duplicated across files:**
- Issue: The `nonEmpty` string-trimming helper is defined independently in both `src/register.ts` (line 26) and `src/mcp/module.ts` (line 65). These are byte-for-byte identical.
- Files: `src/register.ts`, `src/mcp/module.ts`
- Impact: Minor — any future change to the helper must be made in two places. Risk of the two copies drifting.
- Fix approach: Extract to a shared internal utility (e.g., `src/internal/nonEmpty.ts`) and import from both files.

**`main` and `types` point to TypeScript source, not compiled output:**
- Issue: `package.json` sets `"main": "./src/index.ts"` and `"types": "./src/index.ts"`. For a package consumed via monorepo workspace the host builds directly from source, which is fine. But if ever published standalone, consumers would receive raw TypeScript, not compiled JS or `.d.ts` declarations.
- Files: `package.json`
- Impact: Not a current issue given the source-mirror model (CI skips standalone install/typecheck/test for first-party peer repos). Becomes a real problem if the package is published to a registry or consumed outside the monorepo.
- Fix approach: Add dual `exports` conditions (`import`/`types` pointing to `dist/`) and update `main`/`types` to compiled output. Guard with a `prepublishOnly` build step.

## Known Bugs

Not detected — the package surface is small and logic is straightforward delegation.

## Security Considerations

**No input sanitization on `content` field:**
- Risk: The `social_media_publish` tool accepts a `content: z.string().min(1)` field and passes it directly to the connector's `publish` method with no length cap, HTML/script sanitization, or rate-limit guard at the facade layer. Prompt injection into social media post content is a real threat surface for an AI-driven tool.
- Files: `src/register.ts` (line 18–24), `src/mcp/module.ts` (line 34–41), `src/facade.ts` (line 88–104)
- Current mitigation: None in this package — relies entirely on provider (e.g., LinkedIn connector) to enforce limits.
- Recommendations: Add a `maxLength` constraint to the `content` schema (social platforms have character limits: LinkedIn ~3000 chars). Consider a facade-layer content policy hook in `SocialMediaSystemDeps`.

**`actor` resolved inside MCP handler with no fallback guard:**
- Risk: In `src/register.ts`, `ctx.authSession.getActor()` can return `null` or `undefined`. The `nonEmpty` helper silently converts that to `undefined`, so `userId` and `orgId` become `undefined`. The `resolveConnectorId` dep then must handle a completely anonymous call.
- Files: `src/register.ts` (lines 40–42)
- Current mitigation: Facade delegates to `resolveConnectorId` which is host-provided — the host is expected to reject unauthenticated calls.
- Recommendations: Add an explicit guard in the MCP handler: if `actor` is null, throw an authentication error before attempting to publish.

**`.npmrc` present — existence noted:**
- The `.npmrc` file is present in the repo root. Its contents are not read per security policy. Verify it does not contain registry auth tokens that should instead be in CI secrets.
- Files: `.npmrc`

## Performance Bottlenecks

**globalThis singleton lookup on every facade call:**
- Problem: Both `getDeps()` and `getProvider()` in `src/facade.ts` do a `globalThis[Symbol.for(...)]` lookup on every call to `publishSocialMediaPostThroughSystem` and `getSocialMediaConnectorStatusThroughSystem`.
- Files: `src/facade.ts` (lines 55–65, 67–81)
- Cause: Necessary for cross-compilation singleton correctness in Next.js. Acceptable overhead — Symbol-keyed property access is O(1).
- Improvement path: Not a practical concern at current scale. Document as a known pattern.

## Fragile Areas

**globalThis cross-compilation singleton pattern:**
- Files: `src/registry.ts` (lines 60–67), `src/facade.ts` (lines 45–53)
- Why fragile: The `Symbol.for(...)` anchoring on `globalThis` is the correct fix for Next.js multi-compilation splits, but it is invisible to TypeScript's module system. If the Symbol key string changes (e.g., version bump from `v1` to `v2` without migrating existing state), the registry silently becomes empty at runtime. There is no mechanism to detect a stale key.
- Safe modification: Always change BOTH the Symbol key string AND ensure `configureSocialMediaSystem` is called again before any publish is attempted. Add a test that simulates re-registration across symbol key changes.
- Test coverage: Not tested — the import-boundary test does not cover singleton behavior.

**`resolveActor` is optional in `createSocialMediaModule`:**
- Files: `src/mcp/module.ts` (line 96–101, line 63)
- Why fragile: `resolveActor` defaults to `{}` (empty object) when not provided. This means `userId` and `orgId` are always `undefined` in the legacy path if the host forgets to pass the resolver. No warning is emitted.
- Safe modification: Make `resolveActor` required, or add a `console.warn` when it is absent and a publish is attempted.
- Test coverage: Not tested.

## Scaling Limits

**In-memory registry with no eviction:**
- Current capacity: Unbounded — `Map<string, SocialMediaConnector>` grows with every `registerSocialMediaConnector` call. In practice only a handful of providers will ever be registered per process.
- Limit: Not a practical concern. Connectors are registered at boot, not dynamically at request time.
- Scaling path: Not applicable for current use pattern.

## Dependencies at Risk

**`zod` v4 (^4.4.3) — very new major version:**
- Risk: Zod v4 is a recent major release. The broader ecosystem (ORMs, form libraries, tRPC) still predominantly targets Zod v3. If the host monorepo or other connectors pin Zod v3, version conflicts will arise.
- Impact: Schema validation in `src/register.ts` and `src/mcp/module.ts` could break if the host's Zod version is incompatible. `zod` is in `dependencies` (not `peerDependencies`), so both versions may be bundled simultaneously.
- Migration plan: Consider moving `zod` to a peer dependency with a broad range (`^3 || ^4`), or coordinate a monorepo-wide Zod version policy.

**`server-only` (0.0.1) — pinned to an exact ancient version:**
- Risk: `server-only` is pinned to `0.0.1` (exact). This package is a sentinel that throws if imported in a client context. The version has not changed meaningfully, but exact pinning prevents automatic patch updates.
- Impact: Low — the package is a compile-time guard with no runtime logic.
- Migration plan: Change to `"server-only": "*"` or `">=0.0.1"` to track future updates without manual bumps.

**`vitest` v4 (^4.1.6) — very new major version:**
- Risk: Vitest v4 is a recent major release. Compatibility with the monorepo's test runner version may require coordination.
- Impact: Tests only — does not affect runtime behavior.
- Migration plan: Coordinate vitest version with the monorepo if tests are run in the monorepo context.

## Missing Critical Features

**No routing beyond "first registered connector":**
- Problem: `SocialMediaSystemDeps.resolveConnectorId` is a host-provided hook, but the facade comment explicitly notes "Full sender-identity routing (per-org default provider, per-user override) can be added later." No multi-provider routing is implemented in this package.
- Blocks: Multi-provider deployments (e.g., LinkedIn + Twitter/X simultaneously) cannot be routed per-user or per-org without host-side resolver logic.

**No `getStatus` exposed through MCP:**
- Problem: `getSocialMediaConnectorStatusThroughSystem` is exported from `src/facade.ts` and `src/index.ts`, but neither MCP registration path (`src/register.ts` nor `src/mcp/module.ts`) exposes a `social_media_get_status` MCP tool.
- Blocks: AI agents cannot check connector health/auth status via MCP without custom host wiring.

## Test Coverage Gaps

**Only import-boundary test exists:**
- What's not tested: Registry singleton behavior, facade routing logic, `publishSocialMediaPostThroughSystem` happy path and error paths, `getSocialMediaConnectorStatusThroughSystem`, MCP handler input validation, `nonEmpty` helper edge cases, `getProvider` error when no connector registered, `getDeps` error when system not configured.
- Files: `src/registry.ts`, `src/facade.ts`, `src/register.ts`, `src/mcp/module.ts`
- Risk: Any regression in the routing/delegation logic would be invisible until a provider-level integration test or production failure catches it.
- Priority: High — the facade and registry are the core runtime logic of this package and have zero behavioral test coverage.

**globalThis singleton not tested:**
- What's not tested: The cross-compilation singleton anchoring behavior — that re-importing the module returns the same registry instance and does not create a second empty registry.
- Files: `src/registry.ts` (lines 60–67)
- Risk: The most subtle and impactful failure mode (documented as having previously broken the email-connector registry) has no regression test.
- Priority: High.

**`createSocialMediaModule` with no `resolveActor` not tested:**
- What's not tested: The fallback behavior when `resolveActor` is omitted — that `userId`/`orgId` become `undefined` and publish proceeds without actor context.
- Files: `src/mcp/module.ts` (line 96–101)
- Risk: Silent authentication bypass in the legacy MCP path.
- Priority: Medium.

---

*Concerns audit: 2026-06-09*
