import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminDocuments } from "@/features/administration/AdminDocuments";

export const Route = createFileRoute("/espace/administration/documents")({
  head: () => ({
    meta: [
      { title: "Documents et certificats — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Pièces administratives et workflow du certificat de complétude.",
      },
      { property: "og:title", content: "Documents et certificats — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Pièces administratives et workflow du certificat de complétude.",
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
  return <AdminDocuments />;
}
