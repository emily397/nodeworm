import { PageHero } from "@/app/components/PageHero";
import { WorkspacesHome } from "./WorkspacesHome";

export const dynamic = "force-dynamic";

const PROMISES = [
  { t: "Share the work, not the passwords", d: "Teammates use your connected apps without ever seeing a credential. Everything runs server-side under sealed keys.", c: "var(--color-live)" },
  { t: "One invite, they're in", d: "Invite by email. If they already have an account they join instantly, otherwise it converts the moment they sign up.", c: "var(--color-teal)" },
  { t: "Anything you build, together", d: "Share an automation and the whole team can view, edit and run it. Keep the rest private by default.", c: "var(--color-signal)" },
];

export default function WorkspacesPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <PageHero
        kicker="your team"
        kickerColor="var(--color-teal)"
        title="Build it once."
        accent="Everyone benefits."
        sub="Share automations and connected apps with your team. They get the power, your credentials stay sealed."
      />

      <div className="grid sm:grid-cols-3 gap-3.5 mb-10">
        {PROMISES.map((p, i) => (
          <div key={p.t} className="card p-5 rise" style={{ animationDelay: `${i * 90}ms`, borderTop: `3px solid ${p.c}` }}>
            <div className="font-display font-bold text-base leading-snug">{p.t}</div>
            <p className="text-sm mt-2 leading-snug" style={{ color: "var(--color-ink-soft)" }}>
              {p.d}
            </p>
          </div>
        ))}
      </div>

      <WorkspacesHome />
    </div>
  );
}
