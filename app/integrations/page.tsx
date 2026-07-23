import Link from "next/link";
import { listIntegrations } from "@/lib/store";
import { GlowStats, PageHero } from "@/app/components/PageHero";
import { LogoCloud } from "@/app/components/LogoCloud";
import { IntegrationsList } from "./IntegrationsList";

export const dynamic = "force-dynamic";

const LIVE = new Set(["connected", "connected-via-session", "connected-via-connector"]);

export default async function IntegrationsPage() {
  const all = await listIntegrations();
  const connected = all.filter((i) => LIVE.has(i.status)).length;
  const planning = all.filter((i) => i.status === "running" || i.status === "needs-credentials").length;
  const blocked = all.filter((i) => i.status === "blocked").length;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <PageHero
        kicker="your connections"
        title="Every app you've"
        accent="hooked."
        sub="Each one signed in once and held securely. Add another by naming it, even if nobody has ever connected it before."
      >
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="btn btn-signal">
            Connect an app
          </Link>
          <Link href="/gallery" className="btn btn-ghost">
            Browse the pond
          </Link>
        </div>
      </PageHero>

      <div className="card p-7 sm:p-8 mb-9" style={{ background: "linear-gradient(120deg, color-mix(in srgb, var(--color-signal) 12%, var(--color-paper-2)), var(--color-paper-2))" }}>
        <GlowStats
          stats={[
            { value: connected, label: "connected and live", color: "var(--color-live)", rgb: "167,217,75" },
            { value: planning, label: "being set up", color: "var(--color-berry)", rgb: "255,160,61" },
            { value: blocked, label: "need a hand", color: blocked ? "var(--color-blocked)" : "var(--color-muted)", rgb: "255,107,107" },
            { value: all.length, label: "total connections", color: "var(--color-teal)", rgb: "56,198,232" },
          ]}
        />
      </div>

      <IntegrationsList initial={all} />

      {all.length > 0 && (
        <div className="mt-14">
          <p className="text-center text-xs uppercase tracking-[0.2em] mb-5" style={{ color: "var(--color-muted)" }}>
            Add any of these next, or name one of your own
          </p>
          <LogoCloud />
        </div>
      )}
    </div>
  );
}
