import { createFileRoute } from "@tanstack/react-router";
import { AccessRestricted } from "@/components/access-restricted";
import { useSession } from "@/application/session";
import { canAccessLearnerSpace } from "@/domain/access";
import { LearnerStatisticsView } from "@/features/statistics/LearnerStatisticsView";

function LearnerStatisticsRoute() {
  const { roles, activeProgram } = useSession();
  if (!canAccessLearnerSpace(roles, activeProgram.id)) {
    return <AccessRestricted area="Mes statistiques" />;
  }
  return <LearnerStatisticsView />;
}

export const Route = createFileRoute("/espace/progression")({
  head: () => ({
    meta: [
      { title: "Mes statistiques — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Ma progression chiffrée : acquis au niveau cible, preuves validées et jalons restants, à mon seul périmètre.",
      },
      { property: "og:title", content: "Mes statistiques — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Progression chiffrée personnelle : acquis, preuves et jalons.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LearnerStatisticsRoute,
});
