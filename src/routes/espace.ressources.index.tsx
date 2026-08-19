import { createFileRoute } from "@tanstack/react-router";
import { ResourcesView } from "@/features/resources/ResourcesView";

export const Route = createFileRoute("/espace/ressources/")({
  head: () => ({
    meta: [
      { title: "Ressources — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Catalogue de ressources rattachées aux acquis du programme actif.",
      },
      { property: "og:title", content: "Ressources — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Ressources pédagogiques rattachées aux acquis du référentiel.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResourcesView,
});
