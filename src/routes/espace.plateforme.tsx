import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { PlatformAdminView } from "@/features/administration/PlatformAdminView";

export const Route = createFileRoute("/espace/plateforme")({
  head: () => ({
    meta: [
      { title: "Administration plateforme — Mon Passeport Éducatif" },
      { name: "description", content: "Supervision des programmes, administrateurs autorisés et paramètres communs." },
      { property: "og:title", content: "Administration plateforme — Mon Passeport Éducatif" },
      { property: "og:description", content: "Supervision des programmes, administrateurs autorisés et paramètres communs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès dérivée des RoleAssignment contextualisés du programme actif. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessPlatformAdministration) return <AccessRestricted area="L'administration de la plateforme" />;
  return <PlatformAdminView />;
}
