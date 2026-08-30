import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminAssessments } from "@/features/administration/AdminAssessments";

export const Route = createFileRoute("/espace/administration/evaluations")({
  head: () => ({
    meta: [
      { title: "Évaluations — Campus Santé Augmenté" },
      { name: "description", content: "Modalités d'évaluation du programme, création, import de résultats externes et résultats par cohorte." },
      { property: "og:title", content: "Évaluations — Campus Santé Augmenté" },
      { property: "og:description", content: "Modalités d'évaluation du programme, création, import de résultats externes et résultats par cohorte." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès dérivée des RoleAssignment contextualisés du programme actif. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessProgramAdministration)
    return <AccessRestricted area="L'administration du programme" />;
  return <AdminAssessments />;
}
