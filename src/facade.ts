import "server-only";

// ---------------------------------------------------------------------------
// @cinatra-ai/social-media-connector — provider-agnostic transport facade.
//
// The facade is the single chokepoint every outbound social-media post goes
// through:
//
//   caller → publishSocialMediaPostThroughSystem(post, opts)
//     → resolve provider via routing chain
//     → delegate to provider.publish(post, opts)
//     → return receipt
//
// Mirrors the @cinatra-ai/email-connector facade. The routing chain today is
// simple — explicit `connectorId` OR the first registered connector. Full
// sender-identity routing (per-org default provider, per-user override) can
// be added later via the same `SocialMediaSystemDeps` injection point.
// ---------------------------------------------------------------------------

import type {
  SocialMediaConnector,
  SocialMediaPost,
  SocialMediaPublishReceipt,
  SocialMediaConnectorStatusResult,
} from "./contract";
import { socialMediaConnectorRegistry } from "./registry";

/**
 * Host-side routing dependency. The facade is provider-neutral; host wires
 * the concrete impl at boot via `configureSocialMediaSystem`.
 */
export interface SocialMediaSystemDeps {
  /** Resolve which registered connector to use for this publish. */
  resolveConnectorId: (opts: {
    explicitConnectorId?: string;
    userId?: string;
    orgId?: string;
  }) => Promise<string>;
}

// CROSS-COMPILATION SINGLETON: same hazard as socialMediaConnectorRegistry —
// the deps slot configured at boot (instrumentation compilation) must be visible
// to the route/RSC compilation that calls the facade. Anchor on a
// namespaced+versioned `Symbol.for(...)` key (matches email's EMAIL_SYSTEM_DEPS_KEY).
const SOCIAL_MEDIA_SYSTEM_DEPS_KEY = Symbol.for(
  "@cinatra-ai/social-media-connector:deps/v1",
);
type DepsHolder = { [k: symbol]: SocialMediaSystemDeps | null | undefined };
const _depsHolder = globalThis as unknown as DepsHolder;

export function configureSocialMediaSystem(deps: SocialMediaSystemDeps): void {
  _depsHolder[SOCIAL_MEDIA_SYSTEM_DEPS_KEY] = deps;
}

function getDeps(): SocialMediaSystemDeps {
  const _deps = _depsHolder[SOCIAL_MEDIA_SYSTEM_DEPS_KEY] ?? null;
  if (!_deps) {
    throw new Error(
      "@cinatra-ai/social-media-connector: social-media system not configured. " +
        "Call configureSocialMediaSystem(deps) at boot (typically from " +
        "src/lib/register-social-providers.ts).",
    );
  }
  return _deps;
}

function getProvider(id: string): SocialMediaConnector {
  const connector = socialMediaConnectorRegistry.get(id);
  if (!connector) {
    const known = socialMediaConnectorRegistry
      .listAll()
      .map((c) => c.definition.connectorId)
      .join(", ");
    throw new Error(
      `@cinatra-ai/social-media-connector: no social-media connector registered for id "${id}". ` +
        `Registered: [${known || "<none>"}]. ` +
        `Add a registerSocialMediaConnector(...) call in src/lib/register-social-providers.ts.`,
    );
  }
  return connector;
}

/**
 * Publish a post through the registered transport for the resolved connector.
 * Provider-agnostic — caller passes a generic `SocialMediaPost`; the facade
 * picks the connector via the routing chain + delegates.
 */
export async function publishSocialMediaPostThroughSystem(
  post: SocialMediaPost,
  opts?: {
    connectorId?: string;
    userId?: string;
    orgId?: string;
  },
): Promise<SocialMediaPublishReceipt> {
  const deps = getDeps();
  const connectorId = await deps.resolveConnectorId({
    explicitConnectorId: opts?.connectorId,
    userId: opts?.userId,
    orgId: opts?.orgId,
  });
  const connector = getProvider(connectorId);
  return connector.publish(post, { userId: opts?.userId });
}

/**
 * Read connection status for a provider; honors the routing chain.
 */
export async function getSocialMediaConnectorStatusThroughSystem(opts?: {
  connectorId?: string;
  userId?: string;
  orgId?: string;
}): Promise<SocialMediaConnectorStatusResult> {
  const deps = getDeps();
  const connectorId = await deps.resolveConnectorId({
    explicitConnectorId: opts?.connectorId,
    userId: opts?.userId,
    orgId: opts?.orgId,
  });
  const connector = getProvider(connectorId);
  return connector.getStatus({ userId: opts?.userId });
}
