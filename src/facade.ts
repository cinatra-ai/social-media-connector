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

  /**
   * OPTIONAL (transport-registration cutover): lazy source of connectors that self-registered behind the
   * `social-post` capability (a provider extension's serverEntry doing
   * `ctx.capabilities.registerProvider("social-post", …)`). Forwarded to the
   * registry's external resolver so BOTH read paths (get-by-id and listAll)
   * merge capability providers — neither the facade nor the host imports a
   * provider package, and a capability teardown is reflected immediately.
   */
  resolveConnectorProviders?: () => readonly SocialMediaConnector[];
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
  // Forward the optional capability-provider resolver to the registry so both
  // read paths merge capability-registered connectors lazily (blog model).
  socialMediaConnectorRegistry.setExternalResolver(deps.resolveConnectorProviders ?? null);
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

/**
 * The per-call actor/scope context the facade forwards VERBATIM to the
 * resolved provider (`provider.publish` / `provider.getStatus`).
 *
 * Fail-closed threading (cinatra-ai/cinatra#954): forwarding only `userId`
 * pinned every delegated provider lookup to personal scope — the org context
 * the caller had already resolved was dropped between the routing chain and
 * the provider call. The facade now forwards the FULL context the caller
 * genuinely resolved, and ONLY that: a key the caller did not resolve is
 * ABSENT, never defaulted or invented here. Callers resolve `userId` +
 * `orgId` today (the MCP handler resolves both from the trusted actor);
 * further scope fields (team/project) extend this shape when a caller
 * genuinely resolves them.
 *
 * NOTE: the SDK provider contract types `opts` as `{ userId?: string }`
 * today; forwarding this wider context is plain width-subtyping (extra
 * properties reach providers at runtime so an org-scope-aware provider can
 * consume them). Widening the contract type itself rides the provider-side
 * org-scope work in the SDK.
 */
export type SocialMediaProviderCallContext = {
  userId?: string;
  orgId?: string;
};

/** Build the provider call context from caller opts — resolved keys only. */
function toProviderCallContext(opts?: {
  userId?: string;
  orgId?: string;
}): SocialMediaProviderCallContext {
  const context: SocialMediaProviderCallContext = {};
  if (opts?.userId !== undefined) context.userId = opts.userId;
  if (opts?.orgId !== undefined) context.orgId = opts.orgId;
  return context;
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
  return connector.publish(post, toProviderCallContext(opts));
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
  return connector.getStatus(toProviderCallContext(opts));
}
