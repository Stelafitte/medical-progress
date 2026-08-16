import { createFileRoute } from "@tanstack/react-router";
import { StageView } from "@/features/stage/StageView";

export const Route = createFileRoute("/espace/stage")({
  head: () => ({
    meta: [
      { title: "Stage — Passeport Éducatif Médical" },
      {
        name: "description",
        content:
          "Affectations de stage, encadrants responsables et preuves de terrain de l'apprenant.",
      },
      { property: "og:title", content: "Stage — Passeport Éducatif Médical" },
      {
        property: "og:description",
        content: "Affectations de stage, encadrants et preuves de terrain.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StageView,
});
