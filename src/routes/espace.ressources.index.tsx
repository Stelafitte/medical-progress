import { createFileRoute } from "@tanstack/react-router";
import { ResourcesView } from "@/features/resources/ResourcesView";

export const Route = createFileRoute("/espace/ressources/")({
  // Lien profond depuis « Mon prochain jalon » : ?acquis=<code de l'acquis>
  validateSearch: (search: Record<string, unknown>): { acquis?: string } => {
    const value = search["acquis"];
    return typeof value === "string" ? { acquis: value } : {};
  },
  head: () => ({
    meta: [
      { title: "Mes ressources théoriques — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Catalogue de ressources rattachées aux acquis du programme actif.",
      },
      { property: "og:title", content: "Mes ressources théoriques — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Cours et supports rattachés aux connaissances théoriques du référentiel.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResourcesView,
});
