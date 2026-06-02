// The social-media-connector's `register(ctx)` server entry.
//
// Registers the `social_media_publish` MCP primitive through the host `ctx`
// ports instead of importing host MCP internals: `ctx.mcp.registerTool` registers
// the tool, `ctx.authSession` resolves the trusted actor, and delivery flows
// through the connector's own provider-neutral facade.
//
// ADDITIVE: the legacy host-static registration (`createSocialMediaModule`) still
// runs and remains the production-serving path until the host→connector cutover
// retires it (the host dedupes by tool name). This entry makes the connector
// SDK-only and ready to SERVE via `ctx` once the static path is retired.

import "server-only";
import { z } from "zod";
import type { ExtensionHostContext } from "@cinatra-ai/sdk-extensions";
import { publishSocialMediaPostThroughSystem } from "./facade";

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
