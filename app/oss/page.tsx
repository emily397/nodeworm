import Link from "next/link";
import { adaptedProvenance, pieceCount } from "@/lib/pieces/registry";

export const dynamic = "force-dynamic";

// Open-source attribution. Required by the licences of the code NodeWorm adapts,
// and kept accurate by lib/pieces/registry.ts rather than hand-maintained.
const COMPONENTS = [
  {
    name: "Activepieces community pieces",
    repo: "https://github.com/activepieces/activepieces",
    license: "MIT License, Copyright (c) 2023 Activepieces Inc",
    use: "Connector definitions (auth, actions, triggers) adapted into NodeWorm's own piece model. Only packages/pieces/community is used; the Activepieces Enterprise paths are not.",
  },
];

export default function OssPage() {
  const pieces = adaptedProvenance();
  const total = pieceCount();
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <div className="kicker mb-2">attribution</div>
      <h1 className="display-xl text-[clamp(2rem,4.5vw,3rem)]">
        Open source<span className="gradient-text">.</span>
      </h1>
      <p className="mt-3 text-sm max-w-xl" style={{ color: "var(--color-ink-soft)" }}>
        NodeWorm builds on open-source work. The projects below are used under their own licences, with copyright
        notices preserved on every adapted file.
      </p>

      <div className="mt-8 space-y-3">
        {COMPONENTS.map((c) => (
          <div key={c.name} className="card p-5">
            <div className="font-display font-bold text-lg leading-tight">{c.name}</div>
            <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              {c.license}
            </div>
            <p className="text-sm mt-2" style={{ color: "var(--color-ink-soft)" }}>
              {c.use}
            </p>
            <a href={c.repo} target="_blank" rel="noreferrer" className="text-xs mt-2 inline-block underline decoration-dotted" style={{ color: "var(--color-signal)" }}>
              {c.repo}
            </a>
          </div>
        ))}
      </div>

      {pieces.length > 0 && (
        <>
          <h2 className="font-display font-bold text-base mt-10 mb-3">Adapted connectors</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--color-muted)" }}>
                  <th className="text-left font-medium px-4 py-2.5">Connector</th>
                  <th className="text-left font-medium px-4 py-2.5">Licence</th>
                  <th className="text-left font-medium px-4 py-2.5">Pinned commit</th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((p) => (
                  <tr key={p.name} style={{ borderTop: "1px solid var(--color-line)" }}>
                    <td className="px-4 py-2.5 font-semibold">{p.name}</td>
                    <td className="px-4 py-2.5">{p.origin === "activepieces" ? p.license : ""}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--color-muted)" }}>
                      {p.origin === "activepieces" ? p.sha.slice(0, 10) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs mt-8" style={{ color: "var(--color-muted)" }}>
        {`NodeWorm ships ${total} built-in connectors. The ${pieces.length} listed above ${pieces.length === 1 ? "is" : "are"} adapted from open-source work and ${pieces.length === 1 ? "carries" : "carry"} the notices shown. The remaining ${total - pieces.length}, and NodeWorm's OAuth provider registry, are authored from each vendor's own public API documentation and are not derived from any third-party project.`}
      </p>
      <Link href="/" className="text-sm mt-6 inline-block underline decoration-dotted" style={{ color: "var(--color-signal)" }}>
        Back to NodeWorm
      </Link>
    </div>
  );
}
