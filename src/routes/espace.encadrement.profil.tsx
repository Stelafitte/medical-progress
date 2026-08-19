import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { SupervisorProfile } from "@/features/supervision/SupervisorProfile";

export const Route = createFileRoute("/espace/encadrement/profil")({
  head: () => ({
    meta: [
      { title: "Mon profil d'encadrant — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Fonction, terrains, périodes d'encadrement et préférences de notification.",
      },
      { property: "og:title", content: "Mon profil d'encadrant — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Fonction, terrains, périodes d'encadrement et préférences de notification.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès dérivée des RoleAssignment contextualisés du programme actif. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessSupervision)
    return <AccessRestricted area="L'espace responsable de stage" />;
  return <SupervisorProfile />;
}
