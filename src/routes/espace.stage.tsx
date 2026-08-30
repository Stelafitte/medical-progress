import { createFileRoute } from "@tanstack/react-router";
import { StageView } from "@/features/stage/StageView";

export const Route = createFileRoute("/espace/stage")({
  head: () => ({
    meta: [
      { title: "Mon carnet de stage — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Affectations de stage, gestes enregistrés et contre-signatures de l'encadrant.",
      },
      { property: "og:title", content: "Mon carnet de stage — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Affectations de stage, gestes et contre-signatures.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StageView,
});
