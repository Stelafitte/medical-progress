import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminDashboard } from "@/features/administration/AdminDashboard";

export const Route = createFileRoute("/espace/administration/")({
  head: () => ({
    meta: [
      { title: "Vue d’ensemble du programme — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Indicateurs de promotion, tâches prioritaires, alertes et validations.",
      },
      { property: "og:title", content: "Vue d’ensemble du programme — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Indicateurs de promotion, tâches prioritaires, alertes et validations.",
      },
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
  return <AdminDashboard />;
}
