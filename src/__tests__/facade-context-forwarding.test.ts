import { describe, it, expect, beforeEach, vi } from "vitest";

// `facade.ts` / `registry.ts` / `register.ts` import `server-only`, which
// throws outside a Next bundle (same shim as the email-connector suites).
vi.mock("server-only", () => ({}));

import {
  configureSocialMediaSystem,
  publishSocialMediaPostThroughSystem,
  getSocialMediaConnectorStatusThroughSystem,
} from "../facade";
import { socialMediaConnectorRegistry } from "../registry";
import { register } from "../register";
import type { SocialMediaConnector, SocialMediaPost } from "../contract";

// Regression suite for the org-routing forwarding bug (cinatra-ai/cinatra#954):
// the facade forwarded ONLY `userId` to `provider.publish` / `provider.getStatus`,
// dropping the org context the caller had already resolved — every delegated
// provider lookup was pinned to personal scope. The facade must forward the
// FULL caller-resolved context, and ONLY that (fail-closed: nothing invented).

type CapturedCall = { kind: "publish" | "getStatus"; opts: Record<string, unknown> };

function stubConnector(id: string, calls: CapturedCall[]): SocialMediaConnector {
  return {
    definition: {
      connectorId: id,
      name: id,
      slug: id,
      description: "test stub",
      settingsHref: `/configuration/connections/${id}`,
    },
    async publish(_post: SocialMediaPost, opts?: { userId?: string }) {
      calls.push({ kind: "publish", opts: { ...(opts as Record<string, unknown>) } });
      return {
        providerId: id,
        providerPostId: "post-1",
        publishedAt: "2026-01-01T00:00:00.000Z",
      };
    },
    async getStatus(opts?: { userId?: string }) {
      calls.push({ kind: "getStatus", opts: { ...(opts as Record<string, unknown>) } });
      return { status: "connected" as const };
    },
  };
}

const post: SocialMediaPost = {
  accountId: "acct-1",
  destinationType: "organization",
  destinationId: "urn:li:organization:1",
  content: "hello",
};

describe("facade → provider context forwarding", () => {
  let calls: CapturedCall[];

  beforeEach(() => {
    calls = [];
    socialMediaConnectorRegistry._clearForTests();
    socialMediaConnectorRegistry.register(stubConnector("stub", calls));
    configureSocialMediaSystem({
      resolveConnectorId: async (opts) => opts.explicitConnectorId ?? "stub",
    });
  });

  it("publish forwards the full caller-resolved context (userId AND orgId) to provider.publish", async () => {
    await publishSocialMediaPostThroughSystem(post, {
      userId: "u-123",
      orgId: "o-456",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe("publish");
    expect(calls[0].opts).toEqual({ userId: "u-123", orgId: "o-456" });
  });

  it("getStatus forwards the full caller-resolved context (userId AND orgId) to provider.getStatus", async () => {
    await getSocialMediaConnectorStatusThroughSystem({
      userId: "u-123",
      orgId: "o-456",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe("getStatus");
    expect(calls[0].opts).toEqual({ userId: "u-123", orgId: "o-456" });
  });

  it("fail-closed: forwards ONLY what the caller resolved — no invented context keys", async () => {
    await publishSocialMediaPostThroughSystem(post, { connectorId: "stub" });
    await getSocialMediaConnectorStatusThroughSystem();
    expect(calls).toHaveLength(2);
    // Strict key check: unresolved context is ABSENT, not present-as-undefined.
    expect(Object.keys(calls[0].opts)).toEqual([]);
    expect(Object.keys(calls[1].opts)).toEqual([]);
  });

  it("partial context: a caller resolving only userId forwards userId alone (org key absent)", async () => {
    await publishSocialMediaPostThroughSystem(post, { userId: "u-only" });
    expect(calls[0].opts).toEqual({ userId: "u-only" });
    expect(Object.keys(calls[0].opts)).toEqual(["userId"]);
  });

  it("explicit connectorId routing threads the context to THAT provider", async () => {
    const otherCalls: CapturedCall[] = [];
    socialMediaConnectorRegistry.register(stubConnector("other", otherCalls));
    await publishSocialMediaPostThroughSystem(post, {
      connectorId: "other",
      userId: "u-1",
      orgId: "o-1",
    });
    expect(calls).toHaveLength(0);
    expect(otherCalls).toHaveLength(1);
    expect(otherCalls[0].opts).toEqual({ userId: "u-1", orgId: "o-1" });
  });
});

describe("social_media_publish MCP handler → provider (end-to-end in-package)", () => {
  type RegisteredTool = {
    name: string;
    handler: (rawInput: unknown) => Promise<unknown>;
  };

  function stubCtx(input: {
    actor: { userId?: string; organizationId?: string } | null;
    providers: SocialMediaConnector[];
    tools: RegisteredTool[];
  }) {
    return {
      capabilities: {
        resolveProviders: (capability: string) =>
          capability === "social-post" ? input.providers.map((impl) => ({ impl })) : [],
        registerProvider: (_capability: string, _provider: unknown) => {},
      },
      mcp: {
        registerTool: (tool: RegisteredTool) => {
          input.tools.push(tool);
        },
      },
      authSession: {
        getActor: async () => input.actor,
      },
    };
  }

  beforeEach(() => {
    socialMediaConnectorRegistry._clearForTests();
  });

  it("threads the trusted actor's userId AND organizationId through the facade to the provider", async () => {
    const calls: CapturedCall[] = [];
    const tools: RegisteredTool[] = [];
    register(
      stubCtx({
        actor: { userId: "u-mcp", organizationId: "org-mcp" },
        providers: [stubConnector("stub", calls)],
        tools,
      }) as never,
    );

    const tool = tools.find((t) => t.name === "social_media_publish");
    expect(tool).toBeTruthy();
    await tool!.handler({
      accountId: "acct-1",
      destinationType: "organization",
      destinationId: "urn:li:organization:1",
      content: "hello",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe("publish");
    // The original bug: orgId was resolved here but dropped by the facade.
    expect(calls[0].opts).toEqual({ userId: "u-mcp", orgId: "org-mcp" });
  });

  it("userless/orgless actor stays fail-closed: no context keys reach the provider", async () => {
    const calls: CapturedCall[] = [];
    const tools: RegisteredTool[] = [];
    register(
      stubCtx({ actor: null, providers: [stubConnector("stub", calls)], tools }) as never,
    );

    await tools[0].handler({
      accountId: "acct-1",
      destinationType: "member",
      destinationId: "urn:li:person:1",
      content: "hi",
    });

    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0].opts)).toEqual([]);
  });
});
