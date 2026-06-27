import Link from "next/link";
import { listIntegrations } from "@/lib/store";
import { IntegrationsList } from "./IntegrationsList";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const all = await listIntegrations();
  const connected = all.filter((i) => i.status === "connected").length;
  const planning = all.filter((i) => i.status === "running" || i.status === "needs-credentials").length;
  const blocked = all.filter((i) => i.status === "blocked").length;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="kicker mb-2">control plane</div>
          <h1 className="display-xl text-[clamp(2.2rem,5vw,3.4rem)]">Integrations</h1>
        </div>
        <Link href="/" className="btn btn-signal">
          New connection
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <Stat label="connected" value={connected} color="var(--color-teal)" />
        <Stat label="in progress" value={planning} color="var(--color-signal)" />
        <Stat label="blocked" value={blocked} color="var(--color-blocked)" />
      </div>

      <IntegrationsList initial={all} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card p-5">
      <div className="font-display font-extrabold text-4xl leading-none" style={{ color }}>
        {value}
      </div>
      <div className="font-mono text-[0.66rem] uppercase tracking-wider mt-2" style={{ color: "var(--color-muted)" }}>
        {label}
      </div>
    </div>
  );
}
