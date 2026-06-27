import { NextResponse } from "next/server";
import { cobrowseStatus } from "@/lib/engine/cobrowse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(cobrowseStatus());
}
