import { createFileRoute } from "@tanstack/react-router";
import { AccessRestricted } from "@/components/access-restricted";
import { useSession } from "@/application/session";
import { canAccessLearnerSpace } from "@/domain/access";
import { CompetencesView } from "@/features/competences/CompetencesView";

function CompetencesRoute() {
  const { roles, activeProgram } = useSession();
  if (!canAccessLearnerSpace(roles, activeProgram.id)) {
    return <AccessRestricted area="Mes compétences" />;
  }
  return <CompetencesView />;
}

export const Route = createFileRoute("/espace/competences")({
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
      { title: "Mes compétences — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Compétences simulées et compétences en situation réelle, preuves retenues et validations humaines.",
      },
      { property: "og:title", content: "Mes compétences — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Compétences simulées et réelles, preuves et validations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CompetencesRoute,
});
