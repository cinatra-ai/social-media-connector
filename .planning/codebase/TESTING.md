# Testing Patterns

**Analysis Date:** 2026-06-09

## Test Framework

**Runner:**
- Vitest ^4.1.6
- Config: `vitest.config.ts`

**Assertion Library:**
- Vitest built-in (`expect`)

**Run Commands:**
```bash
npm test          # Run all tests (vitest run)
```

Watch mode and coverage commands are not defined in `package.json` scripts. Run directly with:
```bash
npx vitest        # Watch mode
npx vitest --coverage  # Coverage (requires @vitest/coverage-* package)
```

## Test File Organization

**Location:**
- Dedicated `src/__tests__/` directory (co-located inside `src/`, not at root)
- Test files use `.test.ts` extension

**Naming:**
- Descriptive of the concern being validated: `import-boundary.test.ts`

**Structure:**
```
src/
  __tests__/
    import-boundary.test.ts
```

**Vitest config** (`vitest.config.ts`) includes all `src/**/*.test.ts` — meaning tests placed anywhere under `src/` (not just `__tests__/`) would be picked up.

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from "vitest";

describe("social-media-connector import boundary", () => {
  it("has no runtime imports from @/lib, src/, or other concrete connector packages", () => {
    // ...
    expect(offenders).toEqual([]);
  });
});
```

**Patterns:**
- Single `describe` block per test file, named after the package/concern
- Single `it` block per logical assertion
- No `beforeEach`/`afterEach` setup detected — tests are stateless
- Assertions use `expect(x).toEqual(y)` for deep equality

## Mocking

**Framework:** Not used in the existing test suite.

**Patterns:** No mocks, stubs, or spies in `src/__tests__/import-boundary.test.ts`. The sole test performs real filesystem reads via `node:fs` (`readFileSync`, `readdirSync`) to scan source files.

**What to Mock:**
- Not established by existing tests. For future unit tests of `src/facade.ts` or `src/registry.ts`, mock the `socialMediaConnectorRegistry` singleton using the `_clearForTests()` escape hatch exposed on the registry: `socialMediaConnectorRegistry._clearForTests()`.

**What NOT to Mock:**
- The filesystem scan in `import-boundary.test.ts` — it must read real source files to be a valid regression guard.

## Fixtures and Factories

**Test Data:** None in the existing suite (the import-boundary test generates its input by walking the filesystem).

**Location:** Not applicable for current tests.

## Coverage

**Requirements:** Not enforced. No coverage threshold configured in `vitest.config.ts`.

**View Coverage:**
```bash
npx vitest --coverage
```

## Test Types

**Unit Tests:**
- Not present yet (no tests for `registry.ts`, `facade.ts`, `register.ts`, or `mcp/module.ts`).

**Integration Tests:**
- Not present.

**Regression / Contract Tests:**
- `src/__tests__/import-boundary.test.ts` — a static analysis regression test. It walks the `src/` tree (excluding `__tests__/` and `node_modules/`), parses every `.ts`/`.tsx` file for runtime `import`/`export ... from` statements, and asserts that none match forbidden patterns:
  - `@/` alias imports (app-local host code)
  - `src/` relative climbs
  - Imports of other concrete connector packages (e.g. `@cinatra-ai/linkedin-connector`)
- This test enforces the architectural rule that provider packages must never create a runtime dependency on this facade package or on each other.

**E2E Tests:** Not present.

## Common Patterns

**Filesystem-based static analysis test:**
```typescript
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function walk(dir: string): string[] { /* recursive readdirSync */ }
function findForbiddenImports(filePath: string): string[] { /* readFileSync + regex */ }

describe("...", () => {
  it("...", () => {
    const files = walk(PKG_SRC);
    const offenders: string[] = [];
    for (const file of files) offenders.push(...findForbiddenImports(file));
    expect(offenders).toEqual([]);
  });
});
```

**Type-only import exemption:**
```typescript
const TYPE_ONLY_IMPORT = /^\s*import\s+type\s+/;
// Lines matching this regex are skipped — only runtime imports are checked.
```

**Async Testing:** No async tests in the existing suite. For future tests of `publishSocialMediaPostThroughSystem`, use standard `async/await`:
```typescript
it("publishes a post", async () => {
  const receipt = await publishSocialMediaPostThroughSystem(post, opts);
  expect(receipt).toMatchObject({ ... });
});
```

**Error Testing:**
```typescript
it("throws when not configured", () => {
  expect(() => getDeps()).toThrow("social-media system not configured");
});
```

---

*Testing analysis: 2026-06-09*
