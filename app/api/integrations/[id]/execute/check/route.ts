import { NextResponse } from "next/server";
import { getIntegration } from "@/lib/store";
import { executionAvailableFor } from "@/lib/engine/execute/plan";
import { recipeForApp } from "@/lib/engine/execute/recipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Is agentic execution OFFERED for this app from the cloud side? True only when a
// curated recipe exists AND the signing key is configured (inert-until-keyed). The
// client separately checks whether the NodeWorm Agent is actually installed (via the
// extension) before showing the "Set this up for me" button.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const researchKind = it.research?.best?.kind;
  const available = executionAvailableFor(it.appName, researchKind, it.appUrl);
  const recipe = recipeForApp(it.appName);
  const isCaptureMethod = researchKind === "reverse-api-capture";
  return NextResponse.json({
    available,
    connectorName: recipe?.connectorName ?? (isCaptureMethod ? `${it.appName}-reverse-api` : undefined),
    summary: recipe?.summary ?? (isCaptureMethod
      ? `Capture live network traffic from ${it.appName}, generate a REST client, and connect it. Your only step is to log in during capture.`
      : undefined),
    humanActions: recipe?.humanActions ?? (isCaptureMethod
      ? [
          "Approve this plan (you will see every command before it runs).",
          `Log into ${it.appName} in the browser NodeWorm opens. Browse your key screens. Close the tab when done.`,
        ]
      : []),
  });
}
