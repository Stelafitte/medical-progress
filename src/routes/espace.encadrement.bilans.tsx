import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { SupervisionReports } from "@/features/supervision/SupervisionReports";

export const Route = createFileRoute("/espace/encadrement/bilans")({
  head: () => ({
    meta: [
      { title: "Bilans de fin de stage — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Synthèse de stage, appréciation, signature simulée et transmission interne.",
      },
      { property: "og:title", content: "Bilans de fin de stage — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Synthèse de stage, appréciation, signature simulée et transmission interne.",
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
  return <SupervisionReports />;
}
