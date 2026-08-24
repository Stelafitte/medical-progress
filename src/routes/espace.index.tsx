import { createFileRoute } from "@tanstack/react-router";
import { AccessRestricted } from "@/components/access-restricted";
import { useSession } from "@/application/session";
import { canAccessLearnerSpace } from "@/domain/access";
import { DashboardView } from "@/features/dashboard/DashboardView";

function EspaceIndexRoute() {
  const { rolesForAccess, activeProgram } = useSession();
  if (!canAccessLearnerSpace(rolesForAccess, activeProgram.id)) {
    return <AccessRestricted area="Le tableau de bord apprenant" />;
  }
  return <DashboardView />;
}

export const Route = createFileRoute("/espace/")({
  head: () => ({
    meta: [
      { title: "Tableau de bord apprenant — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Aujourd'hui, cette semaine, jalons, progression et stage : le pilotage quotidien de l'apprenant.",
      },
      { property: "og:title", content: "Tableau de bord apprenant — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Aujourd'hui, cette semaine, jalons, progression et stage.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EspaceIndexRoute,
});
