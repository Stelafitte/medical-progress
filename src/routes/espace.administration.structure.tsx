import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminProgramStructure } from "@/features/administration/AdminProgramStructure";

export const Route = createFileRoute("/espace/administration/structure")({
  head: () => ({
    meta: [
      { title: "Structure du programme — Campus Santé Augmenté" },
      { name: "description", content: "Création du programme réutilisable et pilotage de chacune de ses classes." },
      { property: "og:title", content: "Structure du programme — Campus Santé Augmenté" },
      { property: "og:description", content: "Création du programme réutilisable et pilotage de chacune de ses classes." },
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
  return <AdminProgramStructure />;
}
