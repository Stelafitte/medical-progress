import { createFileRoute } from "@tanstack/react-router";
import { AccessRestricted } from "@/components/access-restricted";
import { useSession } from "@/application/session";
import { canAccessLearnerSpace } from "@/domain/access";
import { LearnerProgramsView } from "@/features/programs/LearnerProgramsView";

function MyProgramsRoute() {
  const { roles, activeProgram } = useSession();
  if (!canAccessLearnerSpace(roles, activeProgram.id)) {
    return <AccessRestricted area="Mes programmes" />;
  }
  return <LearnerProgramsView />;
}

export const Route = createFileRoute("/espace/mes-programmes")({
  head: () => ({
    meta: [
      { title: "Mes programmes — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Vue consolidée de mes parcours de formation, inscriptions et rôles contextualisés sur la plateforme.",
      },
      { property: "og:title", content: "Mes programmes — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Vue consolidée de mes parcours, inscriptions et rôles.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyProgramsRoute,
});
