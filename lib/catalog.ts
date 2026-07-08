// The NodeWorm catalog: nodes (apps) and worms (ready-made automations that hook
// two nodes together). Nodes render as category-colored monogram tiles (no external
// logos, so this stays offline + CSP-clean and reads as intentional). Worms carry a
// plain-language prompt the real NL engine (/api/request) turns into a live bridge.
// An app not listed here is not a dead end: you "go fish" for it (cast a worm to
// catch the node) and NodeWorm finds the connection method for any app you name.

export interface Node {
  name: string;
  category: NodeCategory;
}

export type NodeCategory =
  | "messaging"
  | "productivity"
  | "dev"
  | "finance"
  | "crm"
  | "commerce"
  | "scheduling"
  | "storage"
  | "marketing";

// Category -> accent, drawn from the NodeWorm palette (warm earth + teal/green,
// never purple or generic SaaS blue). Used for the node tile + its glow.
// Vivid, distinct categorical palette (saturated so the gallery pops). Each hue is
// pulled far enough apart to read at monogram size, warm-forward to match the brand.
export const CATEGORY_COLOR: Record<NodeCategory, string> = {
  messaging: "#ff5a1f", // bright signal orange
  productivity: "#10b6a0", // aqua
  dev: "#06b6d4", // cyan
  finance: "#16c65a", // vivid green
  crm: "#ffb020", // amber
  commerce: "#ff2d78", // berry
  scheduling: "#2fd0c0", // bright teal-aqua
  storage: "#a3d92a", // lime
  marketing: "#ff8c42", // ember
};

export const CATEGORY_LABEL: Record<NodeCategory, string> = {
  messaging: "messaging",
  productivity: "productivity",
  dev: "developer",
  finance: "finance",
  crm: "crm & sales",
  commerce: "commerce",
  scheduling: "scheduling",
  storage: "files & design",
  marketing: "marketing",
};

// A 1-2 char monogram for the tile. Multi-word apps take the initials.
export function monogram(name: string): string {
  const words = name.replace(/[^a-zA-Z0-9 ]/g, "").trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export const NODES: Node[] = [
  // messaging
  { name: "Slack", category: "messaging" },
  { name: "Discord", category: "messaging" },
  { name: "Telegram", category: "messaging" },
  { name: "Signal", category: "messaging" },
  { name: "WhatsApp", category: "messaging" },
  { name: "Twilio", category: "messaging" },
  // productivity
  { name: "Notion", category: "productivity" },
  { name: "Airtable", category: "productivity" },
  { name: "Google Sheets", category: "productivity" },
  { name: "Gmail", category: "productivity" },
  { name: "Google Calendar", category: "scheduling" },
  { name: "TickTick", category: "productivity" },
  { name: "Asana", category: "productivity" },
  { name: "Monday", category: "productivity" },
  { name: "ClickUp", category: "productivity" },
  { name: "Trello", category: "productivity" },
  { name: "Todoist", category: "productivity" },
  // dev
  { name: "GitHub", category: "dev" },
  { name: "GitLab", category: "dev" },
  { name: "Linear", category: "dev" },
  { name: "Jira", category: "dev" },
  { name: "Sentry", category: "dev" },
  // finance
  { name: "Stripe", category: "finance" },
  { name: "QuickBooks Online", category: "finance" },
  { name: "Xero", category: "finance" },
  { name: "PayPal", category: "finance" },
  // crm & sales
  { name: "HubSpot", category: "crm" },
  { name: "Salesforce", category: "crm" },
  { name: "Pipedrive", category: "crm" },
  { name: "Intercom", category: "crm" },
  // commerce
  { name: "Shopify", category: "commerce" },
  { name: "WooCommerce", category: "commerce" },
  { name: "Square", category: "commerce" },
  // scheduling
  { name: "Calendly", category: "scheduling" },
  { name: "Cal.com", category: "scheduling" },
  { name: "Zoom", category: "scheduling" },
  // files & design
  { name: "Dropbox", category: "storage" },
  { name: "Google Drive", category: "storage" },
  { name: "Box", category: "storage" },
  { name: "Figma", category: "storage" },
  // marketing
  { name: "Mailchimp", category: "marketing" },
  { name: "Klaviyo", category: "marketing" },
];

export interface Worm {
  from: string; // source node
  to: string; // target node
  trigger: string; // short "when" label
  action: string; // short "then" label
  prompt: string; // the plain-language request the engine turns into a live bridge
}

// Ready-made worms. Each prompt is phrased the way parseWorkflow expects
// ("when X happens, do Y"), so clicking one stands up a real bridge, not a mock.
export const WORMS: Worm[] = [
  { from: "Stripe", to: "Slack", trigger: "new payment", action: "post to channel", prompt: "When I get a new Stripe payment, post a message to Slack." },
  { from: "Calendly", to: "Google Calendar", trigger: "meeting booked", action: "add event", prompt: "When a Calendly meeting is booked, add it to my Google Calendar." },
  { from: "GitHub", to: "Linear", trigger: "issue opened", action: "create issue", prompt: "When a GitHub issue is opened, create a Linear issue." },
  { from: "Shopify", to: "Google Sheets", trigger: "new order", action: "add a row", prompt: "When a new Shopify order comes in, add a row to Google Sheets." },
  { from: "Gmail", to: "Notion", trigger: "starred email", action: "create page", prompt: "When I star an email in Gmail, create a Notion page." },
  { from: "HubSpot", to: "Slack", trigger: "deal won", action: "notify team", prompt: "When a HubSpot deal is won, send a message to Slack." },
  { from: "Airtable", to: "Telegram", trigger: "new record", action: "send message", prompt: "When a new Airtable record is added, send me a Telegram message." },
  { from: "Jira", to: "Discord", trigger: "ticket created", action: "post update", prompt: "When a Jira ticket is created, post it to Discord." },
  { from: "Stripe", to: "QuickBooks Online", trigger: "payment", action: "log invoice", prompt: "When I get a Stripe payment, create an invoice in QuickBooks." },
  { from: "Salesforce", to: "Airtable", trigger: "new lead", action: "add record", prompt: "When a Salesforce lead is created, add it to Airtable." },
  { from: "Zoom", to: "Notion", trigger: "meeting ends", action: "create notes", prompt: "When a Zoom meeting ends, create a Notion page for the notes." },
  { from: "Google Calendar", to: "WhatsApp", trigger: "event soon", action: "remind me", prompt: "When a Google Calendar event is about to start, send me a WhatsApp message." },
  { from: "Xero", to: "Signal", trigger: "invoice paid", action: "ping me", prompt: "When a Xero invoice is paid, message me on Signal." },
  { from: "Shopify", to: "Klaviyo", trigger: "new customer", action: "add to list", prompt: "When a new Shopify customer signs up, add them to Klaviyo." },
];
