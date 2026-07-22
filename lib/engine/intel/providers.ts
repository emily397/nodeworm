// Connector intelligence: NodeWorm's own OAuth provider registry. Gives the engine
// DETERMINISTIC genuine-OAuth endpoints for well-known apps with zero LLM guessing,
// widening the oauth-api path beyond the curated knowledge base and the apps that
// publish RFC 8414 metadata (most consumer apps do not).
//
// PROVENANCE (licence-critical): every entry below is authored from the vendor's OWN
// public OAuth documentation. Authorize/token URLs and scope separators are factual
// API endpoints, not third-party expression. This registry deliberately does NOT
// derive from NangoHQ/nango, which is Elastic License 2.0 (verified 2026-07-22:
// default branch master, SPDX NOASSERTION, ELv2 applied uniformly with no carve-out,
// and providers.yaml carries no differing per-file marker). ELv2 forbids offering the
// software as a hosted service and fails NodeWorm's MIT/Apache/BSD-only bar, so the
// previous runtime ingest of that file was removed. Do not reintroduce it.
//
// Only CONCRETE OAuth2 entries belong here; templated URLs that need a per-tenant
// subdomain are omitted so the engine never receives a placeholder.

export interface OAuthProviderEntry {
  provider: string; // stable slug
  displayName: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopeSeparator?: string;
  scopes?: string[];
}

const PROVIDERS: OAuthProviderEntry[] = [
  { provider: "google", displayName: "Google", authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", scopeSeparator: " " },
  { provider: "gmail", displayName: "Gmail", authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", scopeSeparator: " ", scopes: ["https://www.googleapis.com/auth/gmail.modify"] },
  { provider: "google-calendar", displayName: "Google Calendar", authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", scopeSeparator: " ", scopes: ["https://www.googleapis.com/auth/calendar"] },
  { provider: "google-sheets", displayName: "Google Sheets", authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", scopeSeparator: " ", scopes: ["https://www.googleapis.com/auth/spreadsheets"] },
  { provider: "google-drive", displayName: "Google Drive", authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", scopeSeparator: " ", scopes: ["https://www.googleapis.com/auth/drive.file"] },
  { provider: "github", displayName: "GitHub", authorizeUrl: "https://github.com/login/oauth/authorize", tokenUrl: "https://github.com/login/oauth/access_token", scopeSeparator: " " },
  { provider: "gitlab", displayName: "GitLab", authorizeUrl: "https://gitlab.com/oauth/authorize", tokenUrl: "https://gitlab.com/oauth/token", scopeSeparator: " " },
  { provider: "slack", displayName: "Slack", authorizeUrl: "https://slack.com/oauth/v2/authorize", tokenUrl: "https://slack.com/api/oauth.v2.access", scopeSeparator: "," },
  { provider: "discord", displayName: "Discord", authorizeUrl: "https://discord.com/oauth2/authorize", tokenUrl: "https://discord.com/api/oauth2/token", scopeSeparator: " " },
  { provider: "notion", displayName: "Notion", authorizeUrl: "https://api.notion.com/v1/oauth/authorize", tokenUrl: "https://api.notion.com/v1/oauth/token" },
  { provider: "hubspot", displayName: "HubSpot", authorizeUrl: "https://app.hubspot.com/oauth/authorize", tokenUrl: "https://api.hubapi.com/oauth/v1/token", scopeSeparator: " " },
  { provider: "salesforce", displayName: "Salesforce", authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize", tokenUrl: "https://login.salesforce.com/services/oauth2/token", scopeSeparator: " " },
  { provider: "stripe", displayName: "Stripe", authorizeUrl: "https://connect.stripe.com/oauth/authorize", tokenUrl: "https://connect.stripe.com/oauth/token", scopeSeparator: " " },
  { provider: "zoom", displayName: "Zoom", authorizeUrl: "https://zoom.us/oauth/authorize", tokenUrl: "https://zoom.us/oauth/token", scopeSeparator: " " },
  { provider: "dropbox", displayName: "Dropbox", authorizeUrl: "https://www.dropbox.com/oauth2/authorize", tokenUrl: "https://api.dropboxapi.com/oauth2/token", scopeSeparator: " " },
  { provider: "box", displayName: "Box", authorizeUrl: "https://account.box.com/api/oauth2/authorize", tokenUrl: "https://api.box.com/oauth2/token", scopeSeparator: " " },
  { provider: "asana", displayName: "Asana", authorizeUrl: "https://app.asana.com/-/oauth_authorize", tokenUrl: "https://app.asana.com/-/oauth_token", scopeSeparator: " " },
  { provider: "atlassian", displayName: "Atlassian", authorizeUrl: "https://auth.atlassian.com/authorize", tokenUrl: "https://auth.atlassian.com/oauth/token", scopeSeparator: " " },
  { provider: "linear", displayName: "Linear", authorizeUrl: "https://linear.app/oauth/authorize", tokenUrl: "https://api.linear.app/oauth/token", scopeSeparator: "," },
  { provider: "figma", displayName: "Figma", authorizeUrl: "https://www.figma.com/oauth", tokenUrl: "https://api.figma.com/v1/oauth/token", scopeSeparator: "," },
  { provider: "calendly", displayName: "Calendly", authorizeUrl: "https://auth.calendly.com/oauth/authorize", tokenUrl: "https://auth.calendly.com/oauth/token", scopeSeparator: " " },
  { provider: "mailchimp", displayName: "Mailchimp", authorizeUrl: "https://login.mailchimp.com/oauth2/authorize", tokenUrl: "https://login.mailchimp.com/oauth2/token" },
  { provider: "intercom", displayName: "Intercom", authorizeUrl: "https://app.intercom.com/oauth", tokenUrl: "https://api.intercom.io/auth/eagle/token" },
  { provider: "xero", displayName: "Xero", authorizeUrl: "https://login.xero.com/identity/connect/authorize", tokenUrl: "https://identity.xero.com/connect/token", scopeSeparator: " " },
  { provider: "quickbooks", displayName: "QuickBooks Online", authorizeUrl: "https://appcenter.intuit.com/connect/oauth2", tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", scopeSeparator: " " },
  { provider: "linkedin", displayName: "LinkedIn", authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization", tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken", scopeSeparator: " " },
  { provider: "spotify", displayName: "Spotify", authorizeUrl: "https://accounts.spotify.com/authorize", tokenUrl: "https://accounts.spotify.com/api/token", scopeSeparator: " " },
  { provider: "airtable", displayName: "Airtable", authorizeUrl: "https://airtable.com/oauth2/v1/authorize", tokenUrl: "https://airtable.com/oauth2/v1/token", scopeSeparator: " " },
  { provider: "todoist", displayName: "Todoist", authorizeUrl: "https://todoist.com/oauth/authorize", tokenUrl: "https://todoist.com/oauth/access_token", scopeSeparator: "," },
  { provider: "monday", displayName: "Monday", authorizeUrl: "https://auth.monday.com/oauth2/authorize", tokenUrl: "https://auth.monday.com/oauth2/token", scopeSeparator: " " },
  { provider: "clickup", displayName: "ClickUp", authorizeUrl: "https://app.clickup.com/api", tokenUrl: "https://api.clickup.com/api/v2/oauth/token" },
  { provider: "typeform", displayName: "Typeform", authorizeUrl: "https://api.typeform.com/oauth/authorize", tokenUrl: "https://api.typeform.com/oauth/token", scopeSeparator: " " },
  { provider: "webflow", displayName: "Webflow", authorizeUrl: "https://webflow.com/oauth/authorize", tokenUrl: "https://api.webflow.com/oauth/access_token", scopeSeparator: " " },
  { provider: "reddit", displayName: "Reddit", authorizeUrl: "https://www.reddit.com/api/v1/authorize", tokenUrl: "https://www.reddit.com/api/v1/access_token", scopeSeparator: " " },
  { provider: "twitch", displayName: "Twitch", authorizeUrl: "https://id.twitch.tv/oauth2/authorize", tokenUrl: "https://id.twitch.tv/oauth2/token", scopeSeparator: " " },
  { provider: "microsoft", displayName: "Microsoft", authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token", scopeSeparator: " " },
  { provider: "paypal", displayName: "PayPal", authorizeUrl: "https://www.paypal.com/signin/authorize", tokenUrl: "https://api-m.paypal.com/v1/oauth2/token", scopeSeparator: " " },
  { provider: "pipedrive", displayName: "Pipedrive", authorizeUrl: "https://oauth.pipedrive.com/oauth/authorize", tokenUrl: "https://oauth.pipedrive.com/oauth/token", scopeSeparator: " " },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

const BY_KEY = (() => {
  const m = new Map<string, OAuthProviderEntry>();
  for (const p of PROVIDERS) {
    m.set(norm(p.provider), p);
    m.set(norm(p.displayName), p);
  }
  return m;
})();

// Resolve an app name to real OAuth endpoints, or undefined. Synchronous data, kept
// async so the call sites (and any future remote source) stay unchanged.
export async function providerLookup(appName: string): Promise<OAuthProviderEntry | undefined> {
  return BY_KEY.get(norm(appName));
}

export const PROVIDER_COUNT = PROVIDERS.length;
