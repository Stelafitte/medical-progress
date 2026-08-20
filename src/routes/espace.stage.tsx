import { createFileRoute } from "@tanstack/react-router";
import { StageView } from "@/features/stage/StageView";

export const Route = createFileRoute("/espace/stage")({
  head: () => ({
    meta: [
      { title: "Mes compétences — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Compétences travaillées en simulation ou en stage, preuves et validations.",
      },
      { property: "og:title", content: "Mes compétences — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Compétences travaillées, preuves et validations.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StageView,
});
