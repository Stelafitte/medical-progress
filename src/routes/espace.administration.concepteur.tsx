import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminProgramDesigner } from "@/features/administration/AdminProgramDesigner";

export const Route = createFileRoute("/espace/administration/concepteur")({
  head: () => ({
    meta: [
      { title: "Concepteur de programme — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Modèle réutilisable du programme : référentiel, objectifs, chronologie type, carnets.",
      },
      { property: "og:title", content: "Concepteur de programme — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Modèle réutilisable du programme : référentiel, objectifs, chronologie type, carnets.",
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
    return <AccessRestricted area="Le concepteur de programme" />;
  return <AdminProgramDesigner />;
}
