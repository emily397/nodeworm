import { NextResponse } from "next/server";
import { createIntegration, listIntegrations, redactIntegration } from "@/lib/store";
import { visibleList } from "@/lib/engine/access";
import { currentUserId } from "@/lib/engine/auth";
import { myWorkspaceIds } from "@/lib/engine/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = await currentUserId(req);
  const all = await listIntegrations();
  // Multi-tenant: a signed-in user sees their own plus workspace-shared records;
  // anonymous/unkeyed mode has no owners and stays single-tenant.
  const visible = visibleList(all, uid, await myWorkspaceIds(uid));
  return NextResponse.json({ integrations: visible.map(redactIntegration) });
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
