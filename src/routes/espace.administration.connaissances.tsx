import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminKnowledgeBase } from "@/features/administration/AdminKnowledgeBase";

export const Route = createFileRoute("/espace/administration/connaissances")({
  head: () => ({
    meta: [
      { title: "Base de connaissances — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Supports théoriques, conversion HTML5 et exploitation IA des contenus.",
      },
      { property: "og:title", content: "Base de connaissances — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Supports théoriques, conversion HTML5 et exploitation IA des contenus.",
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
  return <AdminKnowledgeBase />;
}
