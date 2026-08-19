import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { SupervisionDashboard } from "@/features/supervision/SupervisionDashboard";

export const Route = createFileRoute("/espace/encadrement/")({
  head: () => ({
    meta: [
      { title: "Espace responsable de stage — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Tableau de bord d'encadrement : étudiants encadrés, stages, tâches et alertes.",
      },
      { property: "og:title", content: "Espace responsable de stage — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Tableau de bord d'encadrement : étudiants encadrés, stages, tâches et alertes.",
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
  return <SupervisionDashboard />;
}
