# Social Media

A single publishing target for every social network you connect. Agents and workflows hand off a generic social post, and this connector routes it to whichever provider you have installed and signed in to — so the same workflow can post to a new network the day you add it.

Install this connector from the Cinatra marketplace. Once installed it activates automatically alongside any social-network provider connector (such as the LinkedIn connector). No additional configuration is required: the connector reads the authenticated user's identity from the platform session and picks the right provider at post time.

To publish a post, call the `social_media_publish` MCP tool with four fields: `accountId` (the provider account identifier), `destinationType` (either `member` for a personal profile or `organization` for a company page), `destinationId` (the provider-specific profile or page ID), and `content` (the post text). Pass an optional `connectorId` to target a specific provider when more than one is connected. On success the tool returns a publish receipt from the provider. If no provider connector is installed or the user is not authenticated, the tool returns a descriptive error identifying which step failed.

The connector exposes `registerSocialMediaConnector`, `publishSocialMediaPostThroughSystem`, `getSocialMediaConnectorStatusThroughSystem`, and `listInstalledSocialMediaConnectors` from its public package surface for host-side integration. Provider connector packages (for example a LinkedIn or Threads connector) import only the contract types (`SocialMediaConnector`, `SocialMediaPost`, `SocialMediaPublishReceipt`) as `import type` and register themselves behind the `social-post` capability from their own server entry. Run `vitest run` in the package directory to execute the test suite; no environment variables or network access are needed for the unit tests.

## Works with

- LinkedIn

## Capabilities

- Publish a post to any connected social network from one place
- Pick a specific network when more than one provider is connected
- See which social-network providers are installed and currently connected
