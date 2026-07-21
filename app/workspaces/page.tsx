import { WorkspacesHome } from "./WorkspacesHome";

export const dynamic = "force-dynamic";

export default function WorkspacesPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <div className="mb-8">
        <div className="kicker mb-2">team layer</div>
        <h1 className="display-xl text-[clamp(2.2rem,5vw,3.4rem)]">
          Workspaces<span className="gradient-text">.</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--color-ink-soft)" }}>
          Share flows and connections with your team. Shared connections run server-side under the owner&apos;s sealed
          credentials: members use them, nobody sees them.
        </p>
      </div>
      <WorkspacesHome />
    </div>
  );
}
