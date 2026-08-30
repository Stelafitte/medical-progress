import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { SupervisionCases } from "@/features/supervision/SupervisionCases";

export const Route = createFileRoute("/espace/encadrement/cas")({
  head: () => ({
    meta: [
      { title: "Cas et questions — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Cas à discuter et questions des apprenants encadrés, avec suivi du traitement.",
      },
      { property: "og:title", content: "Cas et questions — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Cas à discuter et questions des apprenants encadrés, avec suivi du traitement.",
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
  return <SupervisionCases />;
}
