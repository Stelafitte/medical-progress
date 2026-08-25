import { createFileRoute } from "@tanstack/react-router";
import { PlatformProgramsView } from "@/features/administration/PlatformProgramsView";

export const Route = createFileRoute("/espace/plateforme/programmes")({
  head: () => ({
    meta: [
      { title: "Programmes agrégés — Direction plateforme" },
      {
        name: "description",
        content:
          "Tous les programmes agrégés : promotions, supports, terrains de stage, crédits IA et administrateurs.",
      },
      { property: "og:title", content: "Programmes agrégés — Direction plateforme" },
      {
        property: "og:description",
        content: "Comparaison détaillée des programmes de la plateforme.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlatformProgramsView,
});
