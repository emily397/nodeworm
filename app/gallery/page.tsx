import type { Metadata } from "next";
import { listBridges } from "@/lib/store";
import { allPieces, pieceToNode } from "@/lib/pieces/registry";
import { Gallery, type MyWorm } from "./Gallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gallery · NodeWorm",
  description: "Cast a worm, catch any node. Ready-made automations and every app you can name.",
};

export default async function GalleryPage() {
  const bridges = await listBridges();
  // Worms already on the line: the user's cast bridges, most recent first.
  const myWorms: MyWorm[] = bridges.slice(0, 8).map((b) => ({
    id: b.id,
    from: b.sourceName,
    to: b.targetName,
    status: b.status,
  }));
  // Built-in connectors are first-class nodes in the pond: they carry curated
  // real actions, so they should be discoverable next to the catalog apps.
  const pieceNodes = allPieces().map(pieceToNode);
  return <Gallery myWorms={myWorms} pieceNodes={pieceNodes} />;
}
