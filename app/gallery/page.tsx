import type { Metadata } from "next";
import { Gallery } from "./Gallery";

export const metadata: Metadata = {
  title: "Gallery · NodeWorm",
  description: "Cast a worm, catch any node. Ready-made automations and every app you can name.",
};

export default function GalleryPage() {
  return <Gallery />;
}
