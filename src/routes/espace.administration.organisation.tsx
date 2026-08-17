import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminOrganisation } from "@/features/administration/AdminOrganisation";

export const Route = createFileRoute("/espace/administration/organisation")({
  head: () => ({
    meta: [
      { title: "Organisation du programme — Mon Passeport Éducatif" },
      {
        name: "description",
        content: "Cursus, promotions, utilisateurs, rôles, terrains de stage et affectations.",
      },
      { property: "og:title", content: "Organisation du programme — Mon Passeport Éducatif" },
      {
        property: "og:description",
        content: "Cursus, promotions, utilisateurs, rôles, terrains de stage et affectations.",
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
  return <AdminOrganisation />;
}
