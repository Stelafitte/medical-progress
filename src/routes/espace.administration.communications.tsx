import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminCommunications } from "@/features/administration/AdminCommunications";

export const Route = createFileRoute("/espace/administration/communications")({
  head: () => ({
    meta: [
      { title: "Communications du programme — Mon Passeport Éducatif" },
      {
        name: "description",
        content: "Modèles de messages, relances préparées et historique simulé.",
      },
      { property: "og:title", content: "Communications du programme — Mon Passeport Éducatif" },
      {
        property: "og:description",
        content: "Modèles de messages, relances préparées et historique simulé.",
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
  return <AdminCommunications />;
}
