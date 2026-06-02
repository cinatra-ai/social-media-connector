// ---------------------------------------------------------------------------
// @cinatra-ai/social-media-connector — transport CONTRACT (types only).
//
// The provider-neutral social-media contract now lives in the SDK
// (`@cinatra-ai/sdk-extensions/social-contract`) so a concrete provider
// (`linkedin-connector`, a future twitter/threads connector) depends only on
// the SDK and never imports this facade package. Re-exported here so host code
// importing the contract from `@cinatra-ai/social-media-connector` keeps working.
// ---------------------------------------------------------------------------

export type {
  SocialMediaConnectorDefinition,
  SocialMediaConnectorId,
  SocialMediaPost,
  SocialMediaPublishReceipt,
  SocialMediaConnectorStatusResult,
  SocialMediaConnector,
} from "@cinatra-ai/sdk-extensions/social-contract";
