import { createFileRoute } from "@tanstack/react-router";
import { AccessRestricted } from "@/components/access-restricted";
import { useSession } from "@/application/session";
import { canAccessLearnerSpace } from "@/domain/access";
import { EcosVirtuelView } from "@/features/evaluations/EcosVirtuelView";

function EvaluationsRoute() {
  const { roles, activeProgram } = useSession();
  if (!canAccessLearnerSpace(roles, activeProgram.id)) {
    return <AccessRestricted area="Mes évaluations" />;
  }
  return <EcosVirtuelView />;
}

export const Route = createFileRoute("/espace/evaluations")({
  head: () => ({
    meta: [
      { title: "Mes évaluations — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Stations ECOS virtuelles jouées dans ChatGPT et grilles de notation rapportées dans le hub.",
      },
      { property: "og:title", content: "Mes évaluations — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "ECOS virtuel : stations ChatGPT et grilles rapportées.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EvaluationsRoute,
});
