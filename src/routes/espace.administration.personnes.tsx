import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { PeopleEnrollmentsView } from "@/features/administration/PeopleEnrollmentsView";

export const Route = createFileRoute("/espace/administration/personnes")({
  head: () => ({
    meta: [
      { title: "Personnes et inscriptions — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Ajout individuel, import groupé CSV/TSV, inscriptions, retraits et archivage de cohortes, pour tout type de programme.",
      },
      { property: "og:title", content: "Personnes et inscriptions — Campus Santé Augmenté" },
      {
        property: "og:description",
        content:
          "Gestion générique et simulée des personnes, comptes, cohortes et inscriptions du programme sélectionné.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès dérivée des RoleAssignment contextualisés du programme actif. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessProgramAdministration)
    return <AccessRestricted area="La gestion des personnes et des inscriptions" />;
  return <PeopleEnrollmentsView />;
}
