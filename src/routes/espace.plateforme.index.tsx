import { createFileRoute } from "@tanstack/react-router";
import { PlatformOverview } from "@/features/administration/PlatformOverview";

export const Route = createFileRoute("/espace/plateforme/")({
  head: () => ({
    meta: [
      { title: "Vue d'ensemble — Direction plateforme" },
      {
        name: "description",
        content:
          "État des programmes, promotions ouvertes, supports, intervenants, stockage et crédits IA.",
      },
      { property: "og:title", content: "Vue d'ensemble — Direction plateforme" },
      {
        property: "og:description",
        content: "État des programmes, promotions ouvertes, supports et consommations simulées.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlatformOverview,
});
