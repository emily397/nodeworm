// Heuristic discovery for apps not in the knowledge base.
// Infers a plausible integration surface from the name / URL so the engine
// always produces an app-specific result, even with no LLM key.

import type { AuthType, Discovery, TelemetryLine } from "./types";

interface CategoryHint {
  keywords: string[];
  category: string;
  entities: string[];
  authBias: AuthType;
  webhooks: boolean;
}

const HINTS: CategoryHint[] = [
  { keywords: ["crm", "sales", "leads", "pipeline"], category: "CRM", entities: ["Contact", "Deal", "Company"], authBias: "oauth2", webhooks: true },
  { keywords: ["pay", "billing", "invoice", "checkout", "wallet"], category: "Payments", entities: ["Customer", "Charge", "Invoice"], authBias: "apikey", webhooks: true },
  { keywords: ["task", "todo", "project", "kanban", "board"], category: "Tasks / Productivity", entities: ["Task", "Project"], authBias: "oauth2", webhooks: false },
  { keywords: ["mail", "email", "inbox", "newsletter"], category: "Email", entities: ["Message", "Contact", "Campaign"], authBias: "oauth2", webhooks: true },
  { keywords: ["chat", "message", "messaging", "sms", "support desk"], category: "Messaging", entities: ["Message", "Channel", "User"], authBias: "oauth2", webhooks: true },
  { keywords: ["calendar", "schedule", "booking", "appointment"], category: "Scheduling", entities: ["Event", "Booking"], authBias: "oauth2", webhooks: true },
  { keywords: ["doc", "notes", "wiki", "knowledge"], category: "Docs / Knowledge", entities: ["Page", "Document"], authBias: "oauth2", webhooks: false },
  { keywords: ["accounting", "ledger", "bookkeep", "expense"], category: "Accounting", entities: ["Invoice", "Account", "Transaction"], authBias: "oauth2", webhooks: true },
  { keywords: ["store", "shop", "commerce", "cart", "order"], category: "E-commerce", entities: ["Order", "Product", "Customer"], authBias: "oauth2", webhooks: true },
  { keywords: ["recorder", "voice", "transcribe", "audio", "meeting"], category: "Voice / Recording", entities: ["Recording", "Transcript"], authBias: "browser", webhooks: false },
  { keywords: ["analytics", "metrics", "dashboard", "tracking"], category: "Analytics", entities: ["Report", "Event", "Metric"], authBias: "apikey", webhooks: false },
  { keywords: ["form", "survey", "feedback"], category: "Forms", entities: ["Form", "Response"], authBias: "apikey", webhooks: true },
  { keywords: ["hr", "payroll", "recruit", "applicant", "ats"], category: "HR / People", entities: ["Employee", "Candidate"], authBias: "oauth2", webhooks: true },
];

function cleanName(input: string): { name: string; url?: string } {
  const trimmed = input.trim();
  const looksUrl = /^https?:\/\//i.test(trimmed) || /\.[a-z]{2,}($|\/)/i.test(trimmed);
  if (looksUrl) {
    let host = trimmed.replace(/^https?:\/\//i, "").split("/")[0];
    host = host.replace(/^www\./, "");
    const base = host.split(".")[0];
    const name = base.charAt(0).toUpperCase() + base.slice(1);
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${host}`;
    return { name, url };
  }
  return { name: trimmed };
}

export function heuristicDiscovery(input: string): Discovery {
  const { name, url } = cleanName(input);
  const lower = (name + " " + (url ?? "")).toLowerCase();

  let hint: CategoryHint | undefined;
  for (const h of HINTS) {
    if (h.keywords.some((k) => lower.includes(k))) {
      hint = h;
      break;
    }
  }

  const category = hint?.category ?? "Unknown / SaaS";
  const authType: AuthType = hint?.authBias ?? "oauth2";
  const isVoiceLike = authType === "browser";
  const hasPublicApi = !isVoiceLike;
  const entities = hint?.entities ?? ["Record", "Item"];

  const telemetry: TelemetryLine[] = [
    { level: "scan", text: `web.search("${name} API documentation")` },
    { level: "scan", text: `web.search("${name} developer portal")` },
    { level: "scan", text: `mcp.registry.lookup("${name}")` },
    hasPublicApi
      ? { level: "info", text: `No knowledge-base entry. Inferring surface from category signals.` }
      : { level: "warn", text: `No public API signal detected for a ${category.toLowerCase()} product.` },
    hasPublicApi
      ? { level: "ok", text: `Likely ${authType === "apikey" ? "API key" : "OAuth 2.0"} auth over a REST API.` }
      : { level: "action", text: `Flagging browser-automation fallback as the probable path.` },
    { level: "warn", text: `Confidence is heuristic only. Set GROQ_API_KEY or OPENROUTER_API_KEY for live discovery.` },
  ];

  return {
    appName: name,
    appUrl: url,
    category,
    blurb: hint
      ? `Inferred ${category.toLowerCase()} integration from signals in the name.`
      : `Unrecognised app. Treated as a generic SaaS product with a REST API.`,
    hasPublicApi,
    apiType: hasPublicApi ? "rest" : "none",
    authType,
    authMethods: hasPublicApi ? (authType === "apikey" ? ["apikey"] : ["oauth2", "apikey"]) : ["browser"],
    hasHostedMcp: false,
    hasWebhooks: hint?.webhooks ?? false,
    rateLimited: true,
    ipRestricted: false,
    twoFactor: false,
    confidence: hint ? 0.55 : 0.35,
    source: "heuristic",
    entities,
    docsUrl: url ? `${url.replace(/\/$/, "")}/developers` : undefined,
    notes: [
      "Heuristic discovery. Treat the path as a strong default, not a verified fact.",
      "Connecting an AI key (Groq / OpenRouter) upgrades this to live research.",
    ],
    telemetry,
  };
}
