import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_SRC = path.resolve(__dirname, "..");

// Import-boundary regression test for @cinatra-ai/social-media-connector.
//
// The connector package is the SHARED CONTRACT every transport social-media
// provider (linkedin today; future twitter/threads/mastodon/bluesky) imports
// from. If this package ever picks up a non-type runtime dependency on
// app-local code (`@/lib/*`, `@/components/*`, `@/app/*`) or on another
// concrete provider package, the dep arrow goes the wrong way and providers
// become transitively coupled to the host.

const FORBIDDEN_PATTERNS = [
  /^@\/(?!.*\.types$)/, // any @/-aliased runtime import
  /^src\//, // direct ../src/ relative climb
  /^@cinatra-ai\/(?!sdk-extensions$).*-(connector|gmail|apify|apollo|google-calendar|github|linkedin|wordpress|drupal|youtube|media-feeds)/, // other concrete connectors
];

const TYPE_ONLY_IMPORT = /^\s*import\s+type\s+/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      out.push(...walk(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      out.push(full);
    }
  }
  return out;
}

function findForbiddenImports(filePath: string): string[] {
  const src = readFileSync(filePath, "utf8");
  const offenders: string[] = [];
  for (const line of src.split("\n")) {
    if (TYPE_ONLY_IMPORT.test(line)) continue;
    const importMatch = line.match(/^\s*import\s+(?!type\s+)[^"']*from\s+["']([^"']+)["']/);
    const fromMatch = line.match(/^\s*export\s+(?!type\s+)[^"']*from\s+["']([^"']+)["']/);
    const specifier = importMatch?.[1] ?? fromMatch?.[1];
    if (!specifier) continue;
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(specifier)) {
        offenders.push(`${path.relative(PKG_SRC, filePath)}: ${specifier}`);
      }
    }
  }
  return offenders;
}

describe("social-media-connector import boundary", () => {
  it("has no runtime imports from @/lib, src/, or other concrete connector packages", () => {
    const files = walk(PKG_SRC);
    const offenders: string[] = [];
    for (const file of files) {
      offenders.push(...findForbiddenImports(file));
    }
    expect(offenders).toEqual([]);
  });
});
