import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminProgramPilot } from "@/features/administration/AdminProgramPilot";

export const Route = createFileRoute("/espace/administration/pilotage")({
  // Lien profond depuis « Classes d'apprenants » : ?promotion=<cohortId>
  validateSearch: (search: Record<string, unknown>) => ({
    promotion: typeof search.promotion === "string" ? search.promotion : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Pilotage de programme — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Suivi d'une promotion : calendrier daté, inscriptions, carnets, alertes, intervenants.",
      },
      { property: "og:title", content: "Pilotage de programme — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Suivi d'une promotion : calendrier daté, inscriptions, carnets, alertes, intervenants.",
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
    return <AccessRestricted area="Le pilotage de programme" />;
  return <AdminProgramPilot />;
}
