import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { SupervisionCompetences } from "@/features/supervision/SupervisionCompetences";

export const Route = createFileRoute("/espace/encadrement/competences")({
  head: () => ({
    meta: [
      { title: "Compétences à confirmer — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Confirmation humaine des compétences réelles et du niveau d'autonomie.",
      },
      { property: "og:title", content: "Compétences à confirmer — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Confirmation humaine des compétences réelles et du niveau d'autonomie.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès dérivée des RoleAssignment contextualisés du programme actif. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessSupervision)
    return <AccessRestricted area="L'espace responsable de stage" />;
  return <SupervisionCompetences />;
}
