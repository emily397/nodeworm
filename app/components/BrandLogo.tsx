// Real app logos, inline and self-contained (no external requests, CSP-clean).
// Flagship brands get their authentic iconic mark; every other known app gets a
// rounded tile in its real brand color with a crisp monogram (the app-tile look
// integration products use); anything unknown falls back to a category-colored
// monogram so nothing ever renders blank.

import { CATEGORY_COLOR, monogram, NODES } from "@/lib/catalog";

// Authentic brand background + whether the monogram on it should be light or dark.
// Only used for apps without a dedicated glyph below.
const BRAND: Record<string, { bg: string; dark?: boolean }> = {
  slack: { bg: "#4A154B" },
  discord: { bg: "#5865F2" },
  telegram: { bg: "#26A5E4" },
  whatsapp: { bg: "#25D366" },
  signal: { bg: "#3A76F0" },
  twilio: { bg: "#F22F46" },
  notion: { bg: "#0F0F0F" },
  airtable: { bg: "#18BFFF" },
  "google sheets": { bg: "#0F9D58" },
  gmail: { bg: "#EA4335" },
  "google calendar": { bg: "#1A73E8" },
  "google drive": { bg: "#1FA463" },
  ticktick: { bg: "#4772FA" },
  todoist: { bg: "#E44332" },
  asana: { bg: "#F06A6A" },
  monday: { bg: "#FF3D57" },
  clickup: { bg: "#7B68EE" },
  trello: { bg: "#0052CC" },
  github: { bg: "#181717" },
  gitlab: { bg: "#FC6D26" },
  linear: { bg: "#5E6AD2" },
  jira: { bg: "#2684FF" },
  sentry: { bg: "#362D59" },
  stripe: { bg: "#635BFF" },
  "quickbooks online": { bg: "#2CA01C" },
  quickbooks: { bg: "#2CA01C" },
  xero: { bg: "#13B5EA" },
  paypal: { bg: "#003087" },
  hubspot: { bg: "#FF7A59" },
  salesforce: { bg: "#00A1E0" },
  pipedrive: { bg: "#017737" },
  intercom: { bg: "#1F8DED" },
  shopify: { bg: "#5E8E3E" },
  woocommerce: { bg: "#7F54B3" },
  square: { bg: "#0F0F0F" },
  calendly: { bg: "#006BFF" },
  "cal.com": { bg: "#0F0F0F" },
  zoom: { bg: "#0B5CFF" },
  dropbox: { bg: "#0061FF" },
  box: { bg: "#0061D5" },
  figma: { bg: "#0F0F0F" },
  mailchimp: { bg: "#FFE01B", dark: true },
  klaviyo: { bg: "#232426" },
  typeform: { bg: "#262627" },
};

// Iconic multicolor / distinctive marks for flagship brands, drawn on a white or
// brand tile. Each renders inside a 24x24 viewBox.
const GLYPH: Record<string, { tile: string; svg: React.ReactNode }> = {
  stripe: {
    tile: "#635BFF",
    svg: <path d="M13.5 10.1c0-.6.5-.8 1.3-.8 1.1 0 2.6.35 3.7.95V6.9c-1.2-.48-2.4-.67-3.7-.67-3 0-5 1.57-5 4.2 0 4.08 5.6 3.43 5.6 5.2 0 .7-.6.93-1.5.93-1.24 0-2.85-.5-4.1-1.2v3.4c1.4.6 2.8.85 4.1.85 3.08 0 5.2-1.52 5.2-4.2 0-4.4-5.6-3.63-5.6-5.3Z" fill="#fff" />,
  },
  notion: {
    tile: "#fff",
    svg: (
      <g>
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#fff" stroke="#E9E5DC" />
        <path d="M8 8.2v7.6M8 8.2l7 7.4M16 8v7.6" stroke="#0F0F0F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
  },
  slack: {
    tile: "#fff",
    svg: (
      <g>
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#fff" stroke="#EDE7DA" />
        <path d="M10 6.3a1.5 1.5 0 1 0-3 0V10a1.5 1.5 0 1 0 3 0V6.3Z" fill="#36C5F0" />
        <path d="M6.3 10a1.5 1.5 0 1 0 0-3H10a1.5 1.5 0 1 0 0 3H6.3Z" fill="#2EB67D" transform="translate(-0.2 4)" />
        <circle cx="9" cy="15" r="1.5" fill="#2EB67D" />
        <circle cx="15" cy="9" r="1.5" fill="#ECB22E" />
        <path d="M14 17.7a1.5 1.5 0 1 0 3 0V14a1.5 1.5 0 1 0-3 0v3.7Z" fill="#E01E5A" />
        <path d="M17.7 14a1.5 1.5 0 1 0 0 3H14a1.5 1.5 0 1 0 0-3h3.7Z" fill="#ECB22E" />
      </g>
    ),
  },
  github: {
    tile: "#181717",
    svg: <path d="M12 4.5A7.5 7.5 0 0 0 9.6 19.1c.38.07.5-.16.5-.36v-1.3c-2 .4-2.5-.5-2.7-1-.1-.28-.55-1-.95-1.2-.33-.18-.8-.6 0-.62.75-.01 1.28.7 1.46.98.86 1.44 2.23 1.03 2.78.79.08-.62.33-1.03.6-1.27-2.1-.24-4.3-1.05-4.3-4.66 0-1.03.37-1.87.97-2.53-.1-.24-.42-1.22.1-2.53 0 0 .8-.25 2.6.97a8.9 8.9 0 0 1 4.7 0c1.8-1.22 2.6-.97 2.6-.97.52 1.31.2 2.29.1 2.53.6.66.96 1.5.96 2.53 0 3.62-2.2 4.42-4.3 4.65.34.3.64.87.64 1.76v2.6c0 .2.13.44.5.36A7.5 7.5 0 0 0 12 4.5Z" fill="#fff" />,
  },
  google: {
    tile: "#fff",
    svg: (
      <g>
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#fff" stroke="#EDE7DA" />
        <path d="M17.6 12.2c0-.4 0-.7-.1-1H12v2h3.2c-.07.5-.4 1.3-1.1 1.8l1.7 1.3c1-.9 1.8-2.3 1.8-4.1Z" fill="#4285F4" />
        <path d="M12 18c1.5 0 2.8-.5 3.7-1.4l-1.7-1.3c-.5.3-1.1.5-2 .5-1.5 0-2.8-1-3.3-2.4l-1.8 1.4A6 6 0 0 0 12 18Z" fill="#34A853" />
        <path d="M8.7 13.4c-.1-.4-.2-.8-.2-1.2s.1-.8.2-1.2L6.9 9.6a6 6 0 0 0 0 5.2l1.8-1.4Z" fill="#FBBC05" />
        <path d="M12 8.4c.85 0 1.4.37 1.75.68l1.5-1.5A6 6 0 0 0 6.9 9.6l1.8 1.4c.5-1.4 1.8-2.6 3.3-2.6Z" fill="#EA4335" />
      </g>
    ),
  },
  gmail: {
    tile: "#fff",
    svg: (
      <g>
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#fff" stroke="#EDE7DA" />
        <path d="M6 17.5V9l6 4.2L18 9v8.5h-2V11.8l-4 2.8-4-2.8v5.7H6Z" fill="#EA4335" />
      </g>
    ),
  },
  figma: {
    tile: "#fff",
    svg: (
      <g>
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#fff" stroke="#EDE7DA" />
        <path d="M10.5 6h1.75v3.5H10.5A1.75 1.75 0 0 1 10.5 6Z" fill="#F24E1E" />
        <path d="M12.25 6H14a1.75 1.75 0 0 1 0 3.5h-1.75V6Z" fill="#FF7262" />
        <path d="M12.25 9.5H14a1.75 1.75 0 0 1 0 3.5h-1.75V9.5Z" fill="#A259FF" />
        <path d="M10.5 9.5h1.75V13H10.5a1.75 1.75 0 0 1 0-3.5Z" fill="#1ABCFE" />
        <path d="M10.5 13h1.75v1.75A1.75 1.75 0 1 1 10.5 13Z" fill="#0ACF83" />
      </g>
    ),
  },
  shopify: {
    tile: "#5E8E3E",
    svg: <path d="M14.7 7.2c-.1 0-.2 0-.3.05-.05-.6-.4-1.15-1-1.15-.05 0-.1 0-.15.02-.25-.35-.6-.5-.9-.5-1.4 0-2.1 1.75-2.3 2.65l-1.05.32c-.35.1-.36.12-.4.45L7.6 17.5l5.7 1.05V7.2h.05c-.2 0-.4.02-.65.05v-.2c0-.55-.08-1-.25-1.3.5.07.85.6 1 1.45Zm-2.3.15c-.4.12-.85.26-1.3.4.12-.5.37-1 .72-1.3.13-.1.3-.22.5-.28.13.28.13.7.08 1.18Zm-.85-1.75c.13 0 .25.05.35.13-.25.12-.5.32-.72.62-.3.4-.53.98-.62 1.53l-1.06.33c.3-1 .9-2.28 2.05-2.63Z" fill="#fff" />,
  },
  discord: {
    tile: "#5865F2",
    svg: <path d="M16.9 8.1a10 10 0 0 0-2.5-.78l-.16.32a9.3 9.3 0 0 1 2.2.7 8.6 8.6 0 0 0-7-.02c.66-.3 1.4-.53 2.2-.68l-.16-.32c-.9.15-1.76.42-2.5.78-1.5 2.2-1.9 4.34-1.7 6.46a10 10 0 0 0 3 1.5l.6-.94c-.5-.18-.98-.4-1.4-.7l.35-.24a6.5 6.5 0 0 0 5.6 0l.35.24c-.44.3-.9.53-1.4.7l.6.95a10 10 0 0 0 3-1.5c.24-2.46-.4-4.58-1.75-6.47ZM10.3 13.4c-.55 0-1-.5-1-1.12 0-.62.44-1.13 1-1.13s1 .5 1 1.13c0 .62-.45 1.12-1 1.12Zm3.4 0c-.55 0-1-.5-1-1.12 0-.62.44-1.13 1-1.13s1 .5 1 1.13c0 .62-.45 1.12-1 1.12Z" fill="#fff" />,
  },
  telegram: {
    tile: "#26A5E4",
    svg: <path d="M17.8 7.3 15.7 17c-.16.7-.58.87-1.17.54l-3.24-2.4-1.56 1.5c-.17.18-.32.32-.66.32l.24-3.35 6.1-5.5c.26-.24-.06-.37-.4-.13l-7.55 4.75-3.25-1.02c-.7-.22-.72-.7.15-1.04l12.7-4.9c.6-.2 1.1.14.9 1.05Z" fill="#fff" />,
  },
  whatsapp: {
    tile: "#25D366",
    svg: <path d="M12 5.5a6.4 6.4 0 0 0-5.5 9.7l-.9 3.3 3.4-.9A6.4 6.4 0 1 0 12 5.5Zm3.75 9.05c-.16.44-.9.85-1.26.9-.32.05-.73.07-1.18-.07-.27-.09-.62-.2-1.07-.4-1.88-.8-3.1-2.7-3.2-2.83-.1-.13-.76-1-.76-1.92 0-.9.47-1.35.64-1.53.17-.18.37-.22.5-.22h.35c.11 0 .27-.04.42.32.16.4.53 1.32.58 1.42.05.1.08.2.02.32-.06.13-.1.2-.19.32l-.28.32c-.09.09-.18.18-.08.36.1.18.45.75.97 1.2.67.6 1.24.78 1.42.87.18.09.28.07.39-.04.1-.13.44-.52.56-.7.11-.18.23-.15.39-.09.16.06 1.02.48 1.2.57.18.09.29.13.33.2.05.09.05.44-.11.88Z" fill="#fff" />,
  },
  dropbox: {
    tile: "#0061FF",
    svg: <path d="M8 6 4.5 8.3 8 10.6l3.5-2.3L8 6Zm8 0-3.5 2.3 3.5 2.3 3.5-2.3L16 6ZM4.5 12.9 8 15.2l3.5-2.3L8 10.6l-3.5 2.3Zm11.5-2.3-3.5 2.3 3.5 2.3 3.5-2.3-3.5-2.3ZM12 15.8l-3.5 2.3 3.5 2.3 3.5-2.3-3.5-2.3Z" fill="#fff" />,
  },
  linear: {
    tile: "#5E6AD2",
    svg: <path d="M5.2 13.1a7 7 0 0 0 5.7 5.7L5.2 13.1Zm-.2-1.9 8 8c.5-.05 1-.15 1.45-.3L5.3 9.75c-.15.46-.25.94-.3 1.45Zm.7-2.75 9.85 9.85c.36-.2.7-.42 1-.68L6.63 7.65c-.26.3-.48.63-.68 1ZM7.7 6.3l10 10A7 7 0 0 0 7.7 6.3Z" fill="#fff" />,
  },
  zoom: {
    tile: "#0B5CFF",
    svg: <path d="M6 9.4c0-.5.4-.9.9-.9h5.3c.5 0 .9.4.9.9v5.2c0 .5-.4.9-.9.9H6.9c-.5 0-.9-.4-.9-.9V9.4Zm8 1.5 2.9-1.7c.4-.24.9.04.9.5v4.6c0 .46-.5.74-.9.5L14 13.1v-2.2Z" fill="#fff" />,
  },
  airtable: {
    tile: "#fff",
    svg: (
      <g>
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#fff" stroke="#EDE7DA" />
        <path d="m11.4 6.3-4.6 1.9c-.4.16-.4.55 0 .7l4.65 1.85c.35.14.75.14 1.1 0l4.65-1.85c.4-.15.4-.54 0-.7l-4.6-1.9a1.5 1.5 0 0 0-1.2 0Z" fill="#FFBF00" />
        <path d="M12.5 12v4.7c0 .3.3.5.6.4l4.5-1.75c.2-.08.3-.27.3-.47V10.2c0-.3-.3-.5-.6-.4l-4.5 1.75c-.2.08-.3.27-.3.45Z" fill="#26B5F8" />
        <path d="M11 12.15 9.35 13l-.7.35-3.7 1.77c-.3.15-.65-.07-.65-.4v-4.5c0-.12.06-.22.14-.3l.2-.13 4.4 1.75c.22.1.47.13.66.6Z" fill="#ED3049" />
      </g>
    ),
  },
  hubspot: {
    tile: "#FF7A59",
    svg: <path d="M15.4 10.3V8.5a1.4 1.4 0 1 0-1 0v1.8a4 4 0 0 0-1.9.85l-3.6-2.8a1.6 1.6 0 1 0-1 1.3l3.5 2.7a4 4 0 1 0 5-1.65Zm-1.4 5.9a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" fill="#fff" />,
  },
  typeform: {
    tile: "#262627",
    svg: <path d="M8.5 8h7v1.9h-2.55v6.1h-1.9V9.9H8.5V8Z" fill="#fff" />,
  },
};

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export function BrandLogo({ name, size = 30, className = "" }: { name: string; size?: number; className?: string }) {
  const key = normalize(name);
  const glyph = GLYPH[key];
  const radius = Math.round(size * 0.26);

  if (glyph) {
    return (
      <span className={`inline-grid place-items-center shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden>
        <svg width={size} height={size} viewBox="0 0 24 24" style={{ borderRadius: radius, background: glyph.tile, boxShadow: "0 1px 2px rgba(20,16,8,0.12)" }}>
          {glyph.svg}
        </svg>
      </span>
    );
  }

  const brand = BRAND[key];
  if (brand) {
    return (
      <span
        className={`inline-grid place-items-center shrink-0 font-display font-bold ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: brand.bg,
          color: brand.dark ? "#1a1a1a" : "#fff",
          fontSize: size * 0.42,
          boxShadow: "0 1px 2px rgba(20,16,8,0.12)",
        }}
        aria-hidden
      >
        {monogram(name)}
      </span>
    );
  }

  // Unknown app: category-colored monogram (never blank).
  const node = NODES.find((n) => normalize(n.name) === key);
  const c = node ? CATEGORY_COLOR[node.category] : "var(--color-signal)";
  return (
    <span
      className={`inline-grid place-items-center shrink-0 font-display font-bold ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        color: c,
        background: `color-mix(in srgb, ${c} 15%, var(--color-paper))`,
        border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`,
        fontSize: size * 0.4,
      }}
      aria-hidden
    >
      {monogram(name)}
    </span>
  );
}
