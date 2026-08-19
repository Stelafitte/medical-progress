import { createFileRoute } from "@tanstack/react-router";
import { AccessRestricted } from "@/components/layout/access-restricted";
import { useSession } from "@/application/session";
import { canAccessLearnerSpace } from "@/domain/access";
import { LearnerAuditsView } from "@/features/audits/LearnerAuditsView";

function AuditsRoute() {
  const { roleAssignments, activeProgram } = useSession();
  if (!canAccessLearnerSpace(roleAssignments, activeProgram.id)) {
    return <AccessRestricted space="learner" />;
  }
  if (!activeProgram.config.auditsEnabled) {
    return (
      <AccessRestricted
        space="learner"
        message="Le module d'audits de pratique n'est pas activé pour ce programme."
      />
    );
  }
  return <LearnerAuditsView />;
}

export const Route = createFileRoute("/espace/audits")({
  head: () => ({
    meta: [
      { title: "Audits de pratique — Mon Passeport Éducatif" },
      {
        name: "description",
        content:
          "Audits de pratique avant et après formation, pré/post-tests et séances du programme de DPC.",
      },
      { property: "og:title", content: "Audits de pratique — Mon Passeport Éducatif" },
      {
        property: "og:description",
        content: "Mesure de la pratique avant et après formation, sur dossiers anonymes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditsRoute,
});
