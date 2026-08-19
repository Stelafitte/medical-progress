import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminMonitoring } from "@/features/administration/AdminMonitoring";

export const Route = createFileRoute("/espace/administration/suivi")({
  head: () => ({
    meta: [
      { title: "Suivi pédagogique — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Cockpit de promotion, états des carnets et dossiers institutionnels.",
      },
      { property: "og:title", content: "Suivi pédagogique — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Cockpit de promotion, états des carnets et dossiers institutionnels.",
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
  return <AdminMonitoring />;
}
