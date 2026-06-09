<!-- refreshed: 2026-06-09 -->
# Architecture

**Analysis Date:** 2026-06-09

## System Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Exposure Layer                           │
├────────────────────────────┬────────────────────────────────────┤
│  Host-static module        │  SDK IoC entry                     │
│  `src/mcp/module.ts`       │  `src/register.ts`                 │
│  createSocialMediaModule() │  register(ctx)                     │
└────────────┬───────────────┴──────────────┬─────────────────────┘
             │                              │
             ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Provider-Neutral Facade                      │
│                       `src/facade.ts`                           │
│  publishSocialMediaPostThroughSystem()                          │
│  getSocialMediaConnectorStatusThroughSystem()                   │
│  configureSocialMediaSystem(deps)                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Provider Registry (singleton)                 │
│                       `src/registry.ts`                         │
│  socialMediaConnectorRegistry  (globalThis-anchored)            │
│  registerSocialMediaConnector() / listInstalledSocialMediaConnectors() │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│          Contract Types (re-exported from SDK)                  │
│                       `src/contract.ts`                         │
│  SocialMediaConnector / SocialMediaPost /                       │
│  SocialMediaPublishReceipt / SocialMediaConnectorStatusResult   │
│  (source-of-truth: @cinatra-ai/sdk-extensions/social-contract) │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Concrete Provider Packages (external — NOT in this repo)       │
│  @cinatra-ai/linkedin-connector, future twitter/threads/etc.    │
│  Each calls registerSocialMediaConnector() at host boot         │
└─────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `contract.ts` | Re-exports all provider-neutral types from `@cinatra-ai/sdk-extensions/social-contract` | `src/contract.ts` |
| `registry.ts` | `globalThis`-anchored singleton `Map<id, SocialMediaConnector>`; provider registration and lookup | `src/registry.ts` |
| `facade.ts` | Single chokepoint for outbound posts; resolves provider via injected `SocialMediaSystemDeps`; delegates to connector | `src/facade.ts` |
| `register.ts` | SDK IoC entry — calls `ctx.mcp.registerTool` for `social_media_publish`; reads actor from `ctx.authSession` | `src/register.ts` |
| `mcp/module.ts` | Legacy host-static MCP module; exposes same `social_media_publish` tool via structural `SocialToolServer` type | `src/mcp/module.ts` |
| `index.ts` | Public surface; re-exports contract types + runtime facade symbols | `src/index.ts` |

## Pattern Overview

**Overall:** Provider-neutral connector facade with IoC-injected routing

**Key Characteristics:**
- All contract types live in `@cinatra-ai/sdk-extensions/social-contract`; this package only re-exports them, so concrete providers never import from the facade package at runtime
- The registry and deps slot are anchored on `globalThis` via `Symbol.for(...)` keys to survive Next.js multi-compilation splitting (instrumentation vs. route vs. RSC bundles share one process)
- Two MCP registration paths coexist: the host-static `createSocialMediaModule()` (production path today) and the SDK IoC `register(ctx)` (future path); the host deduplicates by tool name

## Layers

**Contract Layer:**
- Purpose: Type definitions only — no runtime code
- Location: `src/contract.ts`
- Contains: Re-exports of `SocialMediaConnector`, `SocialMediaPost`, `SocialMediaPublishReceipt`, `SocialMediaConnectorStatusResult`, `SocialMediaConnectorId`
- Depends on: `@cinatra-ai/sdk-extensions/social-contract`
- Used by: All other layers and external provider packages (as `import type` only)

**Registry Layer:**
- Purpose: Boot-time registration and lookup of concrete provider implementations
- Location: `src/registry.ts`
- Contains: `SocialMediaConnectorRegistryImpl` class, `socialMediaConnectorRegistry` singleton, `registerSocialMediaConnector`, `listInstalledSocialMediaConnectors`
- Depends on: `src/contract.ts` (type-only)
- Used by: `src/facade.ts`, external host boot code

**Facade Layer:**
- Purpose: Provider-agnostic publish/status entrypoint; routing via injected `SocialMediaSystemDeps`
- Location: `src/facade.ts`
- Contains: `configureSocialMediaSystem`, `publishSocialMediaPostThroughSystem`, `getSocialMediaConnectorStatusThroughSystem`
- Depends on: `src/registry.ts`, `src/contract.ts`
- Used by: `src/mcp/module.ts`, `src/register.ts`, host application code

**MCP Exposure Layer:**
- Purpose: Expose `social_media_publish` MCP tool to LLM clients
- Location: `src/mcp/module.ts` (host-static), `src/register.ts` (SDK IoC)
- Contains: Zod input schema, tool handler, actor resolution
- Depends on: `src/facade.ts`, `zod`, `@cinatra-ai/sdk-extensions` (IoC path only)
- Used by: Host MCP server (`src/lib/mcp-server.ts` in the host repo)

## Data Flow

### Publish Post (SDK IoC path — future)

1. LLM client calls MCP tool `social_media_publish` — handled in `src/register.ts` (`register` function)
2. `ctx.authSession.getActor()` resolves trusted `userId` / `orgId`
3. `publishSocialMediaPostThroughSystem(post, opts)` called in `src/facade.ts`
4. `deps.resolveConnectorId(opts)` (injected via `configureSocialMediaSystem`) returns a connector ID
5. `socialMediaConnectorRegistry.get(id)` retrieves the concrete `SocialMediaConnector` from `src/registry.ts`
6. `connector.publish(post, { userId })` called on the concrete provider (e.g., `@cinatra-ai/linkedin-connector`)
7. `SocialMediaPublishReceipt` returned to caller

### Publish Post (host-static path — current production)

1. LLM client calls MCP tool `social_media_publish` — handled in `src/mcp/module.ts` (`registerSocialMediaPrimitives`)
2. Host-injected `resolveActor()` callback provides `userId` / `orgId`
3. Same facade call chain as above (steps 3–7)

### Status Check

1. Caller invokes `getSocialMediaConnectorStatusThroughSystem(opts)` from `src/facade.ts`
2. Routing via `deps.resolveConnectorId` → registry lookup → `connector.getStatus({ userId })`
3. `SocialMediaConnectorStatusResult` returned

**State Management:**
- No persistent state in this package. The `socialMediaConnectorRegistry` is an in-memory `Map` populated at process boot and never modified after that (except in tests via `_clearForTests()`). The `SocialMediaSystemDeps` slot is set once via `configureSocialMediaSystem`.

## Key Abstractions

**SocialMediaConnector:**
- Purpose: The interface every concrete provider must implement (`publish`, `getStatus`, `definition`)
- Examples: Implemented externally by `@cinatra-ai/linkedin-connector`
- Pattern: Interface defined in `@cinatra-ai/sdk-extensions/social-contract`; referenced as `import type` in this package

**SocialMediaSystemDeps:**
- Purpose: IoC slot for host-provided routing logic (`resolveConnectorId`)
- Examples: Defined in `src/facade.ts`; configured by host at boot
- Pattern: Stored on `globalThis` under a versioned `Symbol.for` key to survive multi-compilation

**SocialPublishActorResolver:**
- Purpose: Callback type for resolving the trusted human actor in the host-static MCP module path
- Examples: Defined in `src/mcp/module.ts`
- Pattern: Injected by host into `createSocialMediaModule({ resolveActor })`

## Entry Points

**Public package entry (`.`):**
- Location: `src/index.ts`
- Triggers: Imported by host application and provider packages
- Responsibilities: Exports all contract types and facade runtime symbols

**SDK IoC server entry (`./register`):**
- Location: `src/register.ts`
- Triggers: Invoked by the Cinatra SDK host at boot with `ExtensionHostContext`
- Responsibilities: Registers `social_media_publish` MCP tool via `ctx.mcp.registerTool`

**Host-static MCP module (`./mcp-module`):**
- Location: `src/mcp/module.ts`
- Triggers: Called from host `src/lib/mcp-server.ts` via `createSocialMediaModule()`
- Responsibilities: Registers same tool on a structural `SocialToolServer` without SDK dependency

## Architectural Constraints

- **Server-only:** All runtime files begin with `import "server-only"` — this package must never be bundled into client-side code
- **Global state:** Two `globalThis` singletons anchored via `Symbol.for`: the registry (`@cinatra-ai/social-media-connector:registry/v1`) and the deps slot (`@cinatra-ai/social-media-connector:deps/v1`) — needed to survive Next.js multi-compilation
- **Import boundary:** Concrete provider packages (`@cinatra-ai/linkedin-connector`, etc.) and host `@/lib/*` imports are forbidden in runtime code; enforced by `src/__tests__/import-boundary.test.ts`
- **Type-only provider imports:** Provider packages must import contract types as `import type` only — no runtime dependency on this facade package

## Anti-Patterns

### Importing host application code

**What happens:** A runtime `import` from `@/lib/*`, `src/`, or another concrete connector package inside this package
**Why it's wrong:** Couples the shared contract/facade package to the host, breaking dependency inversion and making provider packages transitively dependent on host internals
**Do this instead:** Use `import type` for contract types; inject host behaviour via `SocialMediaSystemDeps` or `SocialPublishActorResolver`

### Reading actor from MCP SDK `extra`

**What happens:** Using the MCP SDK `extra` argument to identify the human user inside tool handlers
**Why it's wrong:** The MCP SDK `extra` carries no actor; the trusted subject must come from `ctx.authSession` (IoC path) or the host-injected `resolveActor` callback (static path)
**Do this instead:** In `src/register.ts`, use `ctx.authSession.getActor()`; in `src/mcp/module.ts`, use the injected `SocialPublishActorResolver`

## Error Handling

**Strategy:** Throw with descriptive messages pointing to the fix location

**Patterns:**
- `getDeps()` in `src/facade.ts` throws if `configureSocialMediaSystem` was never called, with a message pointing to `src/lib/register-social-providers.ts`
- `getProvider(id)` in `src/facade.ts` throws listing all registered connector IDs if the requested ID is missing
- `SocialMediaConnectorRegistryImpl.register()` emits a `console.warn` on re-registration (idempotent replace)

## Cross-Cutting Concerns

**Logging:** `console.warn` only on duplicate provider registration in `src/registry.ts`; no structured logging framework
**Validation:** Zod schemas in `src/mcp/module.ts` and `src/register.ts` validate MCP tool inputs before passing to the facade
**Authentication:** Actor resolution is delegated entirely to the host — either `ctx.authSession.getActor()` (IoC) or injected `resolveActor()` callback (static); the facade receives `userId`/`orgId` as plain strings

---

*Architecture analysis: 2026-06-09*
