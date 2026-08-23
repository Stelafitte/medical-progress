import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminStages } from "@/features/administration/AdminStages";

export const Route = createFileRoute("/espace/administration/stages")({
  head: () => ({
    meta: [
      { title: "Gestion des stages — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Types de stage, lieux, périodes et modes de validation du programme.",
      },
      { property: "og:title", content: "Gestion des stages — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Types de stage, lieux, périodes et modes de validation du programme.",
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
    return <AccessRestricted area="La gestion des stages" />;
  return <AdminStages />;
}
