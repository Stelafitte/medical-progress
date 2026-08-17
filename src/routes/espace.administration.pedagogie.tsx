import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminPedagogy } from "@/features/administration/AdminPedagogy";

export const Route = createFileRoute("/espace/administration/pedagogie")({
  head: () => ({
    meta: [
      { title: "Configuration pédagogique — Mon Passeport Éducatif" },
      {
        name: "description",
        content: "Référentiels, compétences, plans d'acquisition, carnets et ressources.",
      },
      { property: "og:title", content: "Configuration pédagogique — Mon Passeport Éducatif" },
      {
        property: "og:description",
        content: "Référentiels, compétences, plans d'acquisition, carnets et ressources.",
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
  return <AdminPedagogy />;
}
