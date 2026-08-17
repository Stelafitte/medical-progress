import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminDashboard } from "@/features/administration/AdminDashboard";

export const Route = createFileRoute("/espace/administration/")({
  head: () => ({
    meta: [
      { title: "Pilotage du programme — Mon Passeport Éducatif" },
      {
        name: "description",
        content: "Indicateurs de promotion, tâches prioritaires, alertes et validations.",
      },
      { property: "og:title", content: "Pilotage du programme — Mon Passeport Éducatif" },
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
