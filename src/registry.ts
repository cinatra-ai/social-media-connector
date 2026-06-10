import "server-only";

// ---------------------------------------------------------------------------
// @cinatra-ai/social-media-connector — provider registry.
//
// Every SocialMediaConnector implementation registers itself here at boot via
// `registerSocialMediaConnector(c)`. The facade (see `./facade.ts`) reads from
// this registry to route `publishSocialMediaPostThroughSystem` calls to the
// right provider.
//
// In-memory singleton. The set is populated at process boot via
// `src/lib/register-social-providers.ts`. Re-registration is idempotent
// (replace-by-id; mirrors emailConnectorRegistry).
//
// CROSS-COMPILATION SINGLETON: Next.js 16 produces SEPARATE bundler
// compilations (instrumentation, route handlers, RSC, edge, …), each with its
// own module cache, so a plain `export const x = new Impl()` produces a
// DIFFERENT instance per compilation. That split the email-connector registry
// (boot registered into one instance, the route handler read an empty other)
// until it was anchored on `globalThis`. The social registry has the SAME
// hazard — anchor it on a namespaced+versioned `Symbol.for(...)` key so it is a
// true per-process singleton across every compilation (matches emailConnectorRegistry).
// ---------------------------------------------------------------------------

import type { SocialMediaConnector } from "./contract";

class SocialMediaConnectorRegistryImpl {
  private entries: Map<string, SocialMediaConnector> = new Map();
  // Lazy EXTERNAL provider source (transport-registration cutover): connectors that self-registered
  // behind the `social-post` capability surface here without this facade (or
  // the host) importing any provider package. Pulled on EVERY read so a
  // capability teardown is reflected immediately and activation order never
  // matters. Direct registrations win over external ones with the same id.
  private externalResolver: (() => readonly SocialMediaConnector[]) | null = null;

  register(connector: SocialMediaConnector): void {
    const id = connector.definition.connectorId;
    if (this.entries.has(id) && this.entries.get(id) !== connector) {
      console.warn(
        `[socialMediaConnectorRegistry] Replacing existing social-media connector "${id}"`,
      );
    }
    this.entries.set(id, connector);
  }

  setExternalResolver(resolver: (() => readonly SocialMediaConnector[]) | null): void {
    this.externalResolver = resolver;
  }

  private externalProviders(): readonly SocialMediaConnector[] {
    if (!this.externalResolver) return [];
    try {
      return this.externalResolver();
    } catch {
      // A broken external resolver must never take down direct registrations.
      return [];
    }
  }

  get(id: string): SocialMediaConnector | null {
    const direct = this.entries.get(id);
    if (direct) return direct;
    return (
      this.externalProviders().find((c) => c.definition.connectorId === id) ?? null
    );
  }

  listAll(): readonly SocialMediaConnector[] {
    const out = new Map<string, SocialMediaConnector>();
    for (const c of this.externalProviders()) out.set(c.definition.connectorId, c);
    // Direct registrations override external ones with the same id.
    for (const [id, c] of this.entries) out.set(id, c);
    return Array.from(out.values());
  }

  size(): number {
    return this.listAll().length;
  }

  /** @internal Only for tests. */
  _clearForTests(): void {
    this.entries.clear();
    this.externalResolver = null;
  }
}

// Anchor on globalThis so every Next.js compilation in the same Node process
// shares one registry instance (see the CROSS-COMPILATION note above).
const SOCIAL_MEDIA_CONNECTOR_REGISTRY_KEY = Symbol.for(
  "@cinatra-ai/social-media-connector:registry/v2",
);
type RegistryHolder = { [k: symbol]: SocialMediaConnectorRegistryImpl | undefined };
const _globalHolder = globalThis as unknown as RegistryHolder;
export const socialMediaConnectorRegistry: SocialMediaConnectorRegistryImpl =
  _globalHolder[SOCIAL_MEDIA_CONNECTOR_REGISTRY_KEY] ??
  (_globalHolder[SOCIAL_MEDIA_CONNECTOR_REGISTRY_KEY] = new SocialMediaConnectorRegistryImpl());

export function registerSocialMediaConnector(connector: SocialMediaConnector): void {
  socialMediaConnectorRegistry.register(connector);
}

export function listInstalledSocialMediaConnectors(): readonly SocialMediaConnector[] {
  return socialMediaConnectorRegistry.listAll();
}
