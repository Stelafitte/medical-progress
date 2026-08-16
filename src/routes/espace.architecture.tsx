import { createFileRoute } from "@tanstack/react-router";
import { ArchitectureView } from "@/features/architecture/ArchitectureView";

export const Route = createFileRoute("/espace/architecture")({
  head: () => ({
    meta: [
      { title: "Architecture du socle — Passeport Éducatif Médical" },
      { name: "description", content: "État du socle technique, visible en développement." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ArchitectureView,
});
