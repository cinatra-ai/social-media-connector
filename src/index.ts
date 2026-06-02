// ---------------------------------------------------------------------------
// @cinatra-ai/social-media-connector — public surface.
//
// Contract types: SocialMediaConnector capability interface +
// SocialMediaPost / SocialMediaPublishReceipt / SocialMediaConnectorStatusResult /
// SocialMediaConnectorId. Re-exports the metadata descriptor from
// sdk-extensions for convenience.
//
// Runtime facade: registerSocialMediaConnector, configureSocialMediaSystem,
// publishSocialMediaPostThroughSystem, getSocialMediaConnectorStatusThroughSystem,
// listInstalledSocialMediaConnectors, SocialMediaSystemDeps. Host wires
// concrete routing at boot via `src/lib/register-social-providers.ts`.
//
// Consumption rule: provider packages (e.g. @cinatra-ai/linkedin-connector)
// import SocialMediaConnector / SocialMediaPost / SocialMediaPublishReceipt
// as `import type` only.
// ---------------------------------------------------------------------------

// ── Contract types ────────────────────────────────────────────────────────

export type {
  SocialMediaConnector,
  SocialMediaConnectorId,
  SocialMediaConnectorStatusResult,
  SocialMediaPost,
  SocialMediaPublishReceipt,
} from "./contract";

export type { SocialMediaConnectorDefinition } from "@cinatra-ai/sdk-extensions";

// ── Runtime facade ────────────────────────────────────────────────────────

export {
  registerSocialMediaConnector,
  listInstalledSocialMediaConnectors,
  socialMediaConnectorRegistry,
} from "./registry";

export {
  configureSocialMediaSystem,
  publishSocialMediaPostThroughSystem,
  getSocialMediaConnectorStatusThroughSystem,
} from "./facade";

export type { SocialMediaSystemDeps } from "./facade";
