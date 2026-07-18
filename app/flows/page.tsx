import { redactFlow } from "@/lib/flow/model";
import { listFlows } from "@/lib/flow/store";
import { FlowsHome } from "./FlowsHome";

export const dynamic = "force-dynamic";

export default async function FlowsPage() {
  const all = (await listFlows()).map(redactFlow);
  const live = all.filter((f) => f.enabled && f.steps.length > 0).length;
  const paused = all.filter((f) => !f.enabled).length;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="kicker mb-2">automation layer</div>
          <h1 className="display-xl text-[clamp(2.2rem,5vw,3.4rem)]">
            Flows<span className="gradient-text">.</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--color-ink-soft)" }}>
            Multi-step automations over your connections: a trigger, filters, AI steps and real actions. Describe one in
            plain language and NodeWorm drafts it.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="live" value={live} color="var(--color-live)" />
          <Stat label="paused" value={paused} color="var(--color-amber)" />
        </div>
      </div>

      <FlowsHome initial={all} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card px-5 py-4">
      <div className="font-display font-extrabold text-3xl leading-none" style={{ color }}>
        {value}
      </div>
      <div className="font-mono text-[0.66rem] uppercase tracking-wider mt-1.5" style={{ color: "var(--color-muted)" }}>
        {label}
      </div>
    </div>
  );
}
