import { createFileRoute } from "@tanstack/react-router";
import { ResourcesView } from "@/features/resources/ResourcesView";

export const Route = createFileRoute("/espace/ressources/")({
  // Lien profond depuis « Mon prochain jalon » : ?acquis=<code de l'acquis>
  /*
   * DEUX PARAMETRES, DEUX USAGES DIFFERENTS.
   * `acquis` ouvre UN acquis precis (lien profond depuis « Mon prochain jalon »).
   * `q` PRE-REMPLIT le filtre local de l'ecran : c'est ce que la recherche
   * transverse emporte quand l'etudiant clique « voir les N autres ». Sans lui,
   * le lien ouvrait l'onglet entier, sans le moindre rapport avec ce qu'il
   * venait de chercher -- il annoncait 96 resultats et en montrait 314.
   */
  validateSearch: (search: Record<string, unknown>): { acquis?: string; q?: string } => {
    const value = search["acquis"];
    const q = search["q"];
    return {
      ...(typeof value === "string" ? { acquis: value } : {}),
      ...(typeof q === "string" && q.length > 0 ? { q } : {}),
    };
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
