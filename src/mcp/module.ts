import "server-only";

// ---------------------------------------------------------------------------
// @cinatra-ai/social-media-connector MCP module — exposes the
// `social_media_publish` primitive. Wired into the Cinatra MCP server
// registry from `src/lib/mcp-server.ts` alongside the other createXModule()
// helpers.
//
// One-shot transactional primitive for chat + future ad-hoc agents that
// want to publish a social-media post via the resolved provider.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { publishSocialMediaPostThroughSystem } from "../facade";

// Structural tool-server type — the narrow `registerTool` surface this module
// uses. Kept STRUCTURAL (not imported from `@cinatra-ai/mcp-server`) so the
// connector depends only on the SDK; the host's real `McpRuntimeToolServer`
// satisfies it. The canonical IoC registration path is `register(ctx)` (see
// ../register.ts); this host-static module remains the production-serving path
// until the host→connector cutover retires it.
type SocialToolServer = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool(...args: any[]): unknown;
};

/**
 * Resolves the TRUSTED human subject `{ userId, orgId }` for the current
 * invocation. The host injects this (it reads the request/run context); the
 * connector must NOT read the MCP SDK `extra` arg, which carries no actor.
 */
export type SocialPublishActorResolver = () => Promise<{ userId?: string; orgId?: string }>;

const socialMediaPublishInputSchema = z.object({
  accountId: z.string().min(1),
  destinationType: z.enum(["member", "organization"]),
  destinationId: z.string().min(1),
  content: z.string().min(1),
  /** Optional explicit provider override (e.g. "linkedin"). */
  connectorId: z.string().optional(),
});

export function registerSocialMediaPrimitives(
  server: SocialToolServer,
  resolveActor?: SocialPublishActorResolver,
): void {
  server.registerTool(
    "social_media_publish",
    {
      title: "social_media_publish",
      description:
        "Publish a single social-media post via the user's primary social-media " +
        "connector (or an explicit connectorId override). Provider-agnostic " +
        "wrapper around the @cinatra-ai/social-media-connector facade — works " +
        "with LinkedIn today and any future provider (Twitter/X, Threads, etc.) " +
        "the operator registers.",
      inputSchema: socialMediaPublishInputSchema,
    },
    async (rawInput: unknown) => {
      const input = socialMediaPublishInputSchema.parse(rawInput);
      // Resolve the trusted actor via the host-injected resolver (NOT the MCP
      // SDK `extra`, which carries no actor).
      const actor = resolveActor ? await resolveActor() : {};
      const nonEmpty = (v: unknown): string | undefined =>
        typeof v === "string" && v.trim().length > 0 ? v : undefined;
      const userId = nonEmpty(actor?.userId);
      const orgId = nonEmpty(actor?.orgId);

      const receipt = await publishSocialMediaPostThroughSystem(
        {
          accountId: input.accountId,
          destinationType: input.destinationType,
          destinationId: input.destinationId,
          content: input.content,
        },
        {
          connectorId: input.connectorId,
          userId,
          orgId,
        },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(receipt),
          },
        ],
        structuredContent: receipt as unknown as Record<string, unknown>,
      };
    },
  );
}

export function createSocialMediaModule(deps?: { resolveActor?: SocialPublishActorResolver }) {
  return {
    registerCapabilities: (server: SocialToolServer) =>
      registerSocialMediaPrimitives(server, deps?.resolveActor),
  };
}
