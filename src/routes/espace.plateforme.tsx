import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";

export const Route = createFileRoute("/espace/plateforme")({
  head: () => ({
    meta: [
      { title: "Direction plateforme — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Supervision des programmes, administrateurs autorisés et paramètres communs.",
      },
      { property: "og:title", content: "Direction plateforme — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Supervision des programmes, administrateurs autorisés et paramètres communs.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès dérivée des RoleAssignment contextualisés. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessPlatformAdministration)
    return <AccessRestricted area="L'administration de la plateforme" />;
  return <Outlet />;
}
