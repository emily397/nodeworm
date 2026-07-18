import { NextResponse } from "next/server";
import { getOwnedFlow, listRuns } from "@/lib/flow/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = await getOwnedFlow(req, id);
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ runs: await listRuns(id) });
}
