import { describe, it, expect, vi } from "vitest";

// `mcp/module.ts`, `register.ts` and the facade import `server-only`, which
// throws outside a Next bundle.
vi.mock("server-only", () => ({}));
// The facade is not under test: registration only wires it.
vi.mock("../facade", () => ({
  configureSocialMediaSystem: vi.fn(),
  publishSocialMediaPostThroughSystem: vi.fn(),
}));

import { registerSocialMediaPrimitives } from "../mcp/module";
import { register } from "../register";

// cinatra#3745: a tool that publishes on a person's behalf declares `outward`
// on its registration, so the host holds each call of it in an agent run for
// the person's recorded decision. `social_media_publish` takes free text and
// no stored item, so its declaration names no subject: it is exactly `{}`.
// Both registration paths must carry it.
describe("social_media_publish declares that it acts outward (cinatra#3745)", () => {
  it("the host-static module registers social_media_publish with outward: {}", () => {
    const configs = new Map<string, Record<string, unknown>>();
    registerSocialMediaPrimitives({
      registerTool(name: string, config: Record<string, unknown>) {
        configs.set(name, config);
      },
    });

    expect([...configs.keys()]).toEqual(["social_media_publish"]);
    const config = configs.get("social_media_publish")!;
    expect("outward" in config).toBe(true);
    expect(config.outward).toEqual({});
  });

  it("register(ctx) registers social_media_publish with outward: {}", () => {
    const tools: Array<Record<string, unknown>> = [];
    const ctx = {
      capabilities: {
        resolveProviders: () => [],
        registerProvider: vi.fn(),
      },
      mcp: {
        registerTool: (registration: Record<string, unknown>) => {
          tools.push(registration);
        },
      },
      authSession: { getActor: async () => null },
    };

    register(ctx as never);

    expect(tools.map((t) => t.name)).toEqual(["social_media_publish"]);
    expect("outward" in tools[0]).toBe(true);
    expect(tools[0].outward).toEqual({});
  });
});
