# Codebase Structure

**Analysis Date:** 2026-06-09

## Directory Layout

```
social-media-connector/
├── src/
│   ├── __tests__/
│   │   └── import-boundary.test.ts   # Boundary enforcement regression test
│   ├── mcp/
│   │   └── module.ts                 # Host-static MCP module (legacy production path)
│   ├── contract.ts                   # Type re-exports from @cinatra-ai/sdk-extensions
│   ├── facade.ts                     # Provider-neutral publish/status facade
│   ├── index.ts                      # Public package surface
│   ├── register.ts                   # SDK IoC server entry (./register export)
│   └── registry.ts                   # globalThis-anchored connector registry
├── .github/
│   └── workflows/
│       ├── ci.yml                    # CI pipeline
│       └── release.yml               # Release pipeline
├── .planning/
│   └── codebase/                     # GSD codebase analysis documents
├── .npmrc                            # npm registry config
├── LICENSE                           # Apache-2.0
├── package.json                      # Package manifest + cinatra connector metadata
├── tsconfig.json                     # TypeScript configuration
└── vitest.config.ts                  # Vitest test runner configuration
```

## Directory Purposes

**`src/`:**
- Purpose: All TypeScript source files
- Contains: Contract types, registry, facade, MCP exposure modules, public index
- Key files: `src/index.ts` (public surface), `src/facade.ts` (core logic)

**`src/__tests__/`:**
- Purpose: Package-level tests; currently one import-boundary regression test
- Contains: Vitest test files (`*.test.ts`)
- Key files: `src/__tests__/import-boundary.test.ts`

**`src/mcp/`:**
- Purpose: MCP tool exposure; isolates the host-static registration path from the SDK IoC path
- Contains: `module.ts` — `createSocialMediaModule()` and `registerSocialMediaPrimitives()`
- Key files: `src/mcp/module.ts`

## Key File Locations

**Entry Points:**
- `src/index.ts`: Main package entry (`.` export); re-exports all public symbols
- `src/register.ts`: SDK IoC server entry (`./register` export); called by Cinatra SDK host at boot
- `src/mcp/module.ts`: Host-static MCP module (`./mcp-module` export); used by host `src/lib/mcp-server.ts`

**Configuration:**
- `package.json`: Package metadata, exports map, `cinatra` connector manifest (`apiVersion`, `kind`, `serverEntry`, `requestedHostPorts`, `sdkAbiRange`)
- `tsconfig.json`: TypeScript compiler options
- `vitest.config.ts`: Test runner config
- `.npmrc`: npm registry settings (existence noted; contents not read)

**Core Logic:**
- `src/facade.ts`: `publishSocialMediaPostThroughSystem`, `getSocialMediaConnectorStatusThroughSystem`, `configureSocialMediaSystem`
- `src/registry.ts`: `socialMediaConnectorRegistry`, `registerSocialMediaConnector`, `listInstalledSocialMediaConnectors`
- `src/contract.ts`: Type-only re-exports from `@cinatra-ai/sdk-extensions/social-contract`

**Testing:**
- `src/__tests__/import-boundary.test.ts`: Walks all `src/` `.ts` files and asserts no forbidden runtime imports exist

## Naming Conventions

**Files:**
- `kebab-case.ts` for all source files (e.g., `import-boundary.test.ts`)
- No index barrel files within subdirectories — `src/mcp/module.ts` is the direct export target

**Directories:**
- `__tests__/` for test files (co-located under `src/`)
- `mcp/` groups MCP-protocol-specific exposure code

**Exports:**
- Functions use `camelCase` (e.g., `registerSocialMediaConnector`, `publishSocialMediaPostThroughSystem`)
- Types use `PascalCase` (e.g., `SocialMediaConnector`, `SocialMediaPost`)
- Constants/singletons use `camelCase` (e.g., `socialMediaConnectorRegistry`)

## Where to Add New Code

**New MCP tool (SDK IoC path):**
- Add tool registration to `src/register.ts` inside the `register(ctx)` function using `ctx.mcp.registerTool`

**New MCP tool (host-static path):**
- Add to `src/mcp/module.ts` inside `registerSocialMediaPrimitives`

**New facade operation (e.g., `deletePost`):**
- Add function to `src/facade.ts` following the existing `publishSocialMediaPostThroughSystem` pattern (resolve deps → resolve connector → delegate)
- Export from `src/index.ts`

**New contract type:**
- Types belong in `@cinatra-ai/sdk-extensions/social-contract`, not here; re-export via `src/contract.ts` and `src/index.ts`

**New test:**
- Place under `src/__tests__/` as `*.test.ts`

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: Yes (by GSD tooling)
- Committed: Yes

**`.github/workflows/`:**
- Purpose: CI and release automation
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-06-09*
