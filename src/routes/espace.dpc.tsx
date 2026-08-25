import { createFileRoute } from "@tanstack/react-router";
import { AccessRestricted } from "@/components/access-restricted";
import { useSession } from "@/application/session";
import { canAccessLearnerSpace } from "@/domain/access";
import { DpcLearnerView } from "@/features/dpc/DpcLearnerView";

function DpcRoute() {
  const { rolesForAccess, activeProgram } = useSession();
  if (!canAccessLearnerSpace(rolesForAccess, activeProgram.id))
    return <AccessRestricted area="L'espace apprenant" />;
  if (!activeProgram.config.dpcEnabled) return <AccessRestricted area="Le parcours DPC" />;
  return <DpcLearnerView />;
}

export const Route = createFileRoute("/espace/dpc")({
  head: () => ({
    meta: [
      { title: "Mon parcours DPC — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Parcours DPC intégré : audit clinique avant formation, formation, pré/post-test, audit après formation et attestation.",
      },
      { property: "og:title", content: "Mon parcours DPC — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Audit 1, formation, audit 2 : progression mesurée sur dossiers anonymes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DpcRoute,
});
