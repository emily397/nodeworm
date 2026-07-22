import { BrandLogo } from "./BrandLogo";

// A high-conversion "works with your apps" strip: real logos scrolling in two
// opposing lanes. Pure CSS animation, pauses on hover, respects reduced motion.
const LANE_A = ["Stripe", "Notion", "Slack", "GitHub", "Shopify", "Gmail", "HubSpot", "Airtable", "Google Calendar", "Discord", "Linear", "Figma"];
const LANE_B = ["Salesforce", "Telegram", "WhatsApp", "Zoom", "Typeform", "Dropbox", "Mailchimp", "Jira", "Google Sheets", "Trello", "Twilio", "Calendly"];

function Lane({ apps, reverse }: { apps: string[]; reverse?: boolean }) {
  const doubled = [...apps, ...apps];
  return (
    <div className="logo-marquee">
      <div className={`logo-track ${reverse ? "reverse" : ""}`}>
        {doubled.map((name, i) => (
          <div
            key={`${name}-${i}`}
            className="card flex items-center gap-2.5 px-4 py-2.5 shrink-0"
            style={{ background: "var(--color-card)" }}
          >
            <BrandLogo name={name} size={26} />
            <span className="text-sm font-semibold whitespace-nowrap" style={{ color: "var(--color-ink-soft)" }}>
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LogoCloud() {
  return (
    <div className="space-y-3">
      <Lane apps={LANE_A} />
      <Lane apps={LANE_B} reverse />
    </div>
  );
}
