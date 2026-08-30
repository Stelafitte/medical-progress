import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminLearnerClasses } from "@/features/administration/AdminLearnerClasses";

export const Route = createFileRoute("/espace/administration/classes")({
  head: () => ({
    meta: [
      { title: "Classes d'apprenants — Campus Santé Augmenté" },
      { name: "description", content: "Promotions, effectifs, périodes et import des listes d'apprenants." },
      { property: "og:title", content: "Classes d'apprenants — Campus Santé Augmenté" },
      { property: "og:description", content: "Promotions, effectifs, périodes et import des listes d'apprenants." },
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
  return <AdminLearnerClasses />;
}
