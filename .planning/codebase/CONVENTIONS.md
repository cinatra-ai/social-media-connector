# Coding Conventions

**Analysis Date:** 2026-06-09

## Naming Patterns

**Files:**
- kebab-case for multi-word files: `src/mcp/module.ts`
- Single-word modules use plain names: `src/contract.ts`, `src/registry.ts`, `src/facade.ts`, `src/register.ts`
- Test files go in `src/__tests__/` with `.test.ts` suffix: `src/__tests__/import-boundary.test.ts`

**Functions:**
- camelCase for exported functions: `registerSocialMediaConnector`, `publishSocialMediaPostThroughSystem`, `configureSocialMediaSystem`
- Long, descriptive names that include the full noun phrase — prefer `getSocialMediaConnectorStatusThroughSystem` over `getStatus`
- Internal helpers use short camelCase: `getDeps`, `getProvider`, `nonEmpty`, `walk`

**Classes:**
- PascalCase with `Impl` suffix for concrete implementations: `SocialMediaConnectorRegistryImpl`

**Types/Interfaces:**
- PascalCase: `SocialMediaConnector`, `SocialMediaPost`, `SocialMediaSystemDeps`, `SocialPublishActorResolver`
- Structural types used locally rather than imported from concrete packages: `SocialToolServer` in `src/mcp/module.ts`

**Constants:**
- SCREAMING_SNAKE_CASE for module-level keys: `SOCIAL_MEDIA_CONNECTOR_REGISTRY_KEY`, `SOCIAL_MEDIA_SYSTEM_DEPS_KEY`, `FORBIDDEN_PATTERNS`
- Prefixed with package scope when used as `Symbol.for(...)` keys: `"@cinatra-ai/social-media-connector:registry/v1"`

**Exports:**
- Registry singleton exported as `socialMediaConnectorRegistry` (camelCase noun phrase)

## Code Style

**Formatting:**
- Not detected (no `.prettierrc` or `biome.json`). TypeScript strict mode enforced via `tsconfig.json`.

**Linting:**
- Not detected (no `.eslintrc`). One `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment in `src/mcp/module.ts` suggests ESLint is used in the host monorepo but not configured in this standalone repo.

**TypeScript:**
- `strict: true` with `noImplicitAny: false` — explicit `any` is allowed but discouraged (see eslint comment)
- `verbatimModuleSyntax: true` — `import type` must be used for type-only imports; runtime imports are never elided
- `isolatedModules: true` — each file compiles independently

## Import Organization

**Order (observed):**
1. Side-effect imports: `import "server-only";` (always first when present)
2. External packages: `import { z } from "zod";`
3. SDK peer: `import type { ExtensionHostContext } from "@cinatra-ai/sdk-extensions";`
4. Local types: `import type { SocialMediaConnector } from "./contract";`
5. Local runtime: `import { socialMediaConnectorRegistry } from "./registry";`

**`import type` rule:**
- All cross-package type imports MUST use `import type`. This is enforced by `verbatimModuleSyntax` and validated by the import-boundary regression test in `src/__tests__/import-boundary.test.ts`.
- Provider packages (e.g. `@cinatra-ai/linkedin-connector`) must import contract types as `import type` only — never as runtime imports.

**Path Aliases:**
- No `@/` alias in this package. `@/` imports are explicitly forbidden (tested in `src/__tests__/import-boundary.test.ts`). All imports are package-relative (`./`) or from named packages.

## Error Handling

**Pattern — throw with descriptive messages:**
```typescript
throw new Error(
  "@cinatra-ai/social-media-connector: social-media system not configured. " +
    "Call configureSocialMediaSystem(deps) at boot (typically from " +
    "src/lib/register-social-providers.ts).",
);
```
- Errors include the package name prefix, the problem, and a remediation hint.
- Errors listing registered providers are constructed dynamically: `Registered: [${known || "<none>"}]`.

**Pattern — no try/catch in facade:**
- `src/facade.ts` does not catch errors; all rejections propagate to the caller.

**Pattern — idempotent registration with warn:**
```typescript
if (this.entries.has(id) && this.entries.get(id) !== connector) {
  console.warn(`[socialMediaConnectorRegistry] Replacing existing ...`);
}
```

## Logging

**Framework:** `console.warn` only (no logging library).

**Patterns:**
- Prefix with `[registryName]` bracket tag: `[socialMediaConnectorRegistry]`
- Used only for idempotency-violation warnings in the registry — not for request tracing.

## Comments

**When to Comment:**
- File-level banner comments explain module purpose, constraints, and cross-cutting concerns (e.g. CROSS-COMPILATION SINGLETON hazard). These are comprehensive and multi-paragraph.
- Inline `//` comments on non-obvious design decisions.
- `/** JSDoc */` on exported functions and interfaces.
- `@internal` JSDoc tag on test-only methods: `/** @internal Only for tests. */`

**JSDoc/TSDoc:**
- JSDoc used on exported symbols in `src/facade.ts` and `src/mcp/module.ts`.
- Parameters documented inline in JSDoc blocks when non-obvious.

## Function Design

**Size:** Functions are small and single-purpose. `getDeps()` and `getProvider()` are 10–15 lines each; the largest function is `publishSocialMediaPostThroughSystem` at ~15 lines.

**Parameters:** Prefer options-object pattern for multi-param calls:
```typescript
resolveConnectorId({ explicitConnectorId, userId, orgId })
```

**Return Values:**
- Async functions return `Promise<T>` with explicit types.
- Registry methods return `readonly` arrays: `listAll(): readonly SocialMediaConnector[]`.

## Module Design

**Exports:**
- `src/index.ts` is the single barrel; it explicitly re-exports named symbols from `./contract`, `./registry`, and `./facade`.
- Named exports only — no default exports anywhere.
- Three distinct entry points declared in `package.json` exports: `.` (main), `./register`, `./mcp-module`.

**Server-only guard:**
- `import "server-only";` appears at the top of `src/registry.ts`, `src/register.ts`, `src/facade.ts`, and `src/mcp/module.ts` to prevent browser bundle inclusion.

**Singleton pattern:**
- `globalThis`-anchored singletons with versioned `Symbol.for(...)` keys used for both the registry and the deps slot, to survive Next.js multi-compilation splits.

---

*Convention analysis: 2026-06-09*
