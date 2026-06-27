import { NextResponse } from "next/server";
import { createIntegration, listIntegrations, redactIntegration } from "@/lib/store";
import { currentUserId } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const all = await listIntegrations();
  return NextResponse.json({ integrations: all.map(redactIntegration) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { app?: string; appUrl?: string };
  const raw = (body.app ?? "").trim();
  const rawUrl = (body.appUrl ?? "").trim();
  if (!raw) {
    return NextResponse.json({ error: "Provide an app name or URL." }, { status: 400 });
  }
  const userId = await currentUserId(req);
  // Name + an explicit public URL: the name identifies the app, the URL pins WHICH
  // one (disambiguates same-named apps) and grounds discovery + research.
  if (rawUrl) {
    const it = await createIntegration(raw, normalizeUrl(rawUrl), userId);
    return NextResponse.json({ integration: redactIntegration(it) }, { status: 201 });
  }
  // Otherwise: a bare URL typed into the name field is treated as the URL.
  const isUrl = /^https?:\/\//i.test(raw) || /^[\w-]+\.[a-z]{2,}/i.test(raw);
  const it = await createIntegration(isUrl ? prettyName(raw) : raw, isUrl ? normalizeUrl(raw) : undefined, userId);
  return NextResponse.json({ integration: redactIntegration(it) }, { status: 201 });
}

function normalizeUrl(s: string): string {
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function prettyName(s: string): string {
  const host = s.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0];
  const base = host.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}
