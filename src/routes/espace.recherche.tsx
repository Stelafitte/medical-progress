import { createFileRoute } from "@tanstack/react-router";
import { AccessRestricted } from "@/components/access-restricted";
import { useSession } from "@/application/session";
import { canSearchProgram } from "@/domain/access";
import { RechercheView } from "@/features/recherche/RechercheView";

function RechercheRoute() {
  const { rolesForAccess, activeProgram } = useSession();
  const { q } = Route.useSearch();
  /*
   * OUVERTE À TOUS LES PROFILS DU PROGRAMME (Stef, 14/09) : apprenant,
   * encadrant, enseignant, administrateur. Ouvrir l'outil n'ouvre pas les
   * données — chacun ne reçoit que ce que la RLS lui laisse déjà lire, et les
   * blocs personnels (carnet, calendrier) n'existent que pour un inscrit.
   */
  if (!canSearchProgram(rolesForAccess, activeProgram.id)) {
    return <AccessRestricted area="La recherche" />;
  }
  return <RechercheView requete={q ?? ""} />;
}

/**
 * LA RECHERCHE EST UNE ROUTE, PAS UN ONGLET (décision de Stef, 14/09).
 *
 * Chercher est un GESTE transverse, pas un lieu : le champ vit dans l'en-tête
 * et reste atteignable depuis les neuf onglets. Mais il faut quand même une
 * route — six blocs d'extraits ne tiennent pas dans un menu déroulant en
 * 390 px, et une URL se recharge, se partage et revient par le bouton Précédent.
 *
 * AUCUNE ENTRÉE N'EST AJOUTÉE À `LEARNER_NAV` : `uiContract.test.ts` fige
 * l'ordre de la navigation apprenante, et cet ordre EST une décision. Une route
 * sans entrée de navigation ne coûte rien ; une dixième entrée, si.
 */
export const Route = createFileRoute("/espace/recherche")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const value = search["q"];
    return typeof value === "string" && value.length > 0 ? { q: value } : {};
  },
  head: () => ({
    meta: [
      { title: "Recherche — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Recherche transverse dans les connaissances, les compétences, les évaluations, le stage, le calendrier et les messages du programme actif.",
      },
      { property: "og:title", content: "Recherche — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Une demande, six blocs de résultats.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RechercheRoute,
});
