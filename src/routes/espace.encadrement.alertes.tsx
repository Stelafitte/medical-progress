import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { SupervisionAlerts } from "@/features/supervision/SupervisionAlerts";

export const Route = createFileRoute("/espace/encadrement/alertes")({
  head: () => ({
    meta: [
      { title: "Alertes d'encadrement — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Faible activité, quotas manquants, absence de saisie et validations en retard.",
      },
      { property: "og:title", content: "Alertes d'encadrement — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Faible activité, quotas manquants, absence de saisie et validations en retard.",
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
  return <SupervisionAlerts />;
}
