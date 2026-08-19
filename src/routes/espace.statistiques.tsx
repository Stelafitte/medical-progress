import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { StatisticsView } from "@/features/statistics/StatisticsView";

export const Route = createFileRoute("/espace/statistiques")({
  head: () => ({
    meta: [
      { title: "Statistiques pluriannuelles — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Comparaison des promotions et des années universitaires : réussite, compétences réelles, stages.",
      },
      { property: "og:title", content: "Statistiques pluriannuelles — Campus Santé Augmenté" },
      {
        property: "og:description",
        content:
          "Suivi longitudinal des promotions, agrégats anonymes et conservation des données.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès : encadrants, enseignants et administrateurs uniquement. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessStatistics) return <AccessRestricted area="L'outil statistique" />;
  return <StatisticsView />;
}
