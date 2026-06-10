// The social-media-connector's `register(ctx)` server entry.
//
// Transport-registration cutover: this facade CONFIGURES ITSELF at activation — the host no longer
// imports this package to call `configureSocialMediaSystem`. The routing chain
// (explicit `connectorId` → first registered) lives entirely in-package, and
// the provider source merges the registry with the live `social-post`
// capability providers via the captured ctx (lazy on every read) — concrete
// providers (linkedin today) register behind that capability from their own
// serverEntry.
//
// It also registers the `social_media_publish` MCP primitive through the host
// `ctx` ports: `ctx.mcp.registerTool` registers the tool, `ctx.authSession`
// resolves the trusted actor, and delivery flows through the facade.

import "server-only";
import { z } from "zod";
import type { ExtensionHostContext } from "@cinatra-ai/sdk-extensions";
import { configureSocialMediaSystem, publishSocialMediaPostThroughSystem } from "./facade";
import type { SocialMediaConnector } from "./contract";
import { socialMediaConnectorRegistry } from "./registry";

// Structural guard: a capability impl is `unknown` by contract — validate the
// SocialMediaConnector shape before the registry trusts it.
function isSocialMediaConnector(impl: unknown): impl is SocialMediaConnector {
  if (typeof impl !== "object" || impl === null) return false;
  const candidate = impl as {
    definition?: { connectorId?: unknown; name?: unknown };
    publish?: unknown;
  };
  return (
    typeof candidate.definition?.connectorId === "string" &&
    typeof candidate.definition?.name === "string" &&
    typeof candidate.publish === "function"
  );
}

/**
 * Routing chain — explicit `connectorId` → first registered. Intentionally
 * simple; richer routing (per-org default, per-user override) can be added via
 * the same `SocialMediaSystemDeps` injection point.
 */
async function resolveConnectorId(opts: {
  explicitConnectorId?: string;
  userId?: string;
  orgId?: string;
}): Promise<string> {
  if (opts.explicitConnectorId) {
    return opts.explicitConnectorId;
  }
  const first = socialMediaConnectorRegistry.listAll()[0];
  if (!first) {
    throw new Error(
      "No social-media connector is registered. A provider extension registers one " +
        "behind the `social-post` capability from its serverEntry.",
    );
  }
  return first.definition.connectorId;
}

const socialMediaPublishInputSchema = z.object({
  accountId: z.string().min(1),
  destinationType: z.enum(["member", "organization"]),
  destinationId: z.string().min(1),
  content: z.string().min(1),
  connectorId: z.string().optional(),
});

const nonEmpty = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim().length > 0 ? v : undefined;

export function register(ctx: ExtensionHostContext): void {
  configureSocialMediaSystem({
    resolveConnectorId,
    // Lazy capability-provider source: providers that registered behind the
    // `social-post` capability surface to both registry read paths.
    resolveConnectorProviders: () =>
      ctx.capabilities
        .resolveProviders("social-post")
        .map((p) => p.impl)
        .filter(isSocialMediaConnector),
  });

  ctx.mcp.registerTool({
    name: "social_media_publish",
    description:
      "Publish a single social-media post via the user's primary social-media " +
      "connector (or an explicit connectorId override). Provider-agnostic wrapper " +
      "over the social-post capability — works with LinkedIn today and any future " +
      "provider (Twitter/X, Threads, etc.) the operator registers.",
    inputSchema: socialMediaPublishInputSchema,
    handler: async (rawInput) => {
      const input = socialMediaPublishInputSchema.parse(rawInput);
      const actor = await ctx.authSession.getActor();
      const userId = nonEmpty(actor?.userId);
      const orgId = nonEmpty(actor?.organizationId);
      return publishSocialMediaPostThroughSystem(
        {
          accountId: input.accountId,
          destinationType: input.destinationType,
          destinationId: input.destinationId,
          content: input.content,
        },
        { connectorId: input.connectorId, userId, orgId },
      );
    },
  });
}
