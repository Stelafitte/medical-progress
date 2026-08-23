import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminGovernance } from "@/features/administration/AdminGovernance";

export const Route = createFileRoute("/espace/administration/gouvernance")({
  head: () => ({
    meta: [
      { title: "Gouvernance du programme — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Droits contextualisés, partage, conservation, audit et sécurité.",
      },
      { property: "og:title", content: "Gouvernance du programme — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Droits contextualisés, partage, conservation, audit et sécurité.",
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
  return <AdminGovernance />;
}
