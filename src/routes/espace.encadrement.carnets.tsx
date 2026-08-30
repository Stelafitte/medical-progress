import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { SupervisionLogs } from "@/features/supervision/SupervisionLogs";

export const Route = createFileRoute("/espace/encadrement/carnets")({
  head: () => ({
    meta: [
      { title: "Carnets à valider — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Validation unitaire, groupée ou finale des carnets de stage soumis.",
      },
      { property: "og:title", content: "Carnets à valider — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Validation unitaire, groupée ou finale des carnets de stage soumis.",
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
  return <SupervisionLogs />;
}
