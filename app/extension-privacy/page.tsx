import Link from "next/link";

export const metadata = {
  title: "NodeWorm Helper privacy policy",
  description: "Privacy policy and Chrome Web Store Limited Use disclosure for the NodeWorm Helper browser extension.",
};

// Privacy policy for the NodeWorm Helper Chrome extension. The Web Store requires a
// reachable privacy policy URL because the extension's privacy form declares that it
// handles authentication information (the OAuth client id/secret the user creates).
// This page states exactly what is handled, that it goes only to the user's own
// NodeWorm account, and includes the required Limited Use statement.
export default function ExtensionPrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <div className="kicker mb-2">browser extension</div>
      <h1 className="display-xl text-[clamp(2rem,4.5vw,3rem)]">NodeWorm Helper privacy policy</h1>
      <p className="font-mono text-[0.7rem] uppercase tracking-wider mt-3" style={{ color: "var(--color-muted)" }}>
        Last updated 26 June 2026
      </p>

      <div className="card p-6 sm:p-8 mt-8 space-y-7" style={{ color: "var(--color-ink-soft)" }}>
        <Section title="What NodeWorm Helper is">
          NodeWorm Helper is a companion browser extension for the NodeWorm app (https://abie-three.vercel.app and
          your local NodeWorm development server). It exists only to help you finish connecting an app inside
          NodeWorm. It has no standalone function and does nothing on sites other than NodeWorm unless you explicitly
          start an action.
        </Section>

        <Section title="What it handles, and where that data goes">
          <ul className="space-y-2 list-disc pl-5">
            <li>
              <strong>OAuth client credentials.</strong> When you register an app on a provider&apos;s developer
              portal, the Helper can capture the Client ID and Client Secret you create and send them back to your
              own NodeWorm account, over your existing NodeWorm session, exactly as if you had typed them into
              NodeWorm yourself. They are posted only to your NodeWorm instance
              (/api/integrations/&lt;id&gt;/oauth/client). They are never sent to the developer of this extension or
              to any third party.
            </li>
            <li>
              <strong>A short-lived hand-off record.</strong> While a connection is in progress, the Helper stores a
              small non-secret record in the browser&apos;s local extension storage (the OAuth recipe and the IDs of
              the NodeWorm tab and the portal tab) so it can match the portal tab to your NodeWorm session. It is
              deleted as soon as the credentials are handed back.
            </li>
            <li>
              <strong>Local connector checks.</strong> If a connector runs on your own machine (for example
              http://localhost) that NodeWorm&apos;s cloud cannot reach, the Helper makes that request from your
              browser and reports only the result (such as the HTTP status) back to your NodeWorm account.
            </li>
            <li>
              <strong>Signed setup plans.</strong> The Helper can relay cryptographically signed setup plans to a
              separate application you install yourself (the NodeWorm Agent) through Chrome native messaging. Only the
              signed plan and control messages are exchanged; no browsing data is sent.
            </li>
          </ul>
        </Section>

        <Section title="What it does not do">
          <ul className="space-y-2 list-disc pl-5">
            <li>It never sees or stores your provider password. You log in and click the provider&apos;s own buttons.</li>
            <li>It does not collect, sell, rent, or transfer your personal data to anyone.</li>
            <li>It does not track your browsing, read your history, or run on sites other than NodeWorm on its own.</li>
            <li>It does not download or execute remote code; it runs only the code shipped in the extension.</li>
          </ul>
        </Section>

        <Section title="Permissions">
          The Helper requests the minimum it needs: access to the NodeWorm app origins (to add the connect button and
          return results to your account), storage (for the short-lived hand-off record), scripting and native
          messaging (to fill a portal form and relay signed plans). Broad site access is optional, off by default, and
          requested only when you turn on &quot;Advanced automation&quot; from the extension popup so the Helper can act
          on a provider portal you choose or reach a connector on your own machine.
        </Section>

        <Section title="Chrome Web Store Limited Use disclosure">
          NodeWorm Helper&apos;s use of information received from Google APIs and from your browser adheres to the
          Chrome Web Store User Data Policy, including the Limited Use requirements. Data handled by the Helper is used
          solely to provide and improve the single user-facing feature of connecting an app inside your own NodeWorm
          account. We do not sell or transfer this data to third parties; we do not use or transfer it for advertising,
          credit, or any purpose unrelated to that feature; and humans do not read it.
        </Section>

        <Section title="Contact">
          Questions about this policy can be sent to{" "}
          <a href="mailto:emily@cancelcosts.com" className="underline" style={{ color: "var(--color-teal)" }}>
            emily@cancelcosts.com
          </a>
          .
        </Section>
      </div>

      <div className="mt-8">
        <Link href="/" className="font-mono text-xs underline" style={{ color: "var(--color-muted)" }}>
          &larr; back to NodeWorm
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display font-bold text-lg mb-2" style={{ color: "var(--color-ink)" }}>
        {title}
      </h2>
      <div className="text-sm leading-relaxed">{children}</div>
    </section>
  );
}
