import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopBar } from "./components/TopBar";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NodeWorm - Autonomous Bidirectional Integration Engine",
  description:
    "Name an app. A five-agent swarm scouts its API, picks the connection path, wires bidirectional sync, and reports back.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${hanken.variable} ${jetbrains.variable}`}>
      <body>
        <TopBar />
        <main>{children}</main>
        <footer className="mx-auto max-w-6xl px-5 py-10 mt-16 border-t hairline">
          <div
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            <span className="font-mono text-xs">
              NodeWorm // autonomous bidirectional integration engine
            </span>
            <span className="font-mono text-xs">Scout · Architect · Wire · Auditor · Relay</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
