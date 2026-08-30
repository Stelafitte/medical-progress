import { createFileRoute } from "@tanstack/react-router";
import { AccessRestricted } from "@/components/access-restricted";
import { useSession } from "@/application/session";
import { canAccessLearnerSpace } from "@/domain/access";
import { LearnerAuditsView } from "@/features/audits/LearnerAuditsView";

function AuditsRoute() {
  const { rolesForAccess, activeProgram } = useSession();
  if (!canAccessLearnerSpace(rolesForAccess, activeProgram.id)) {
    return <AccessRestricted area="L'espace apprenant" />;
  }
  if (!activeProgram.config.auditsEnabled) {
    return <AccessRestricted area="Le module d'audits de pratique" />;
  }
  return <LearnerAuditsView />;
}

export const Route = createFileRoute("/espace/audits")({
  head: () => ({
    meta: [
      { title: "Audits de pratique — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Audits de pratique avant et après formation, pré/post-tests et séances du programme de DPC.",
      },
      { property: "og:title", content: "Audits de pratique — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Mesure de la pratique avant et après formation, sur dossiers anonymes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditsRoute,
});
