import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { StatisticsView } from "@/features/statistics/StatisticsView";

export const Route = createFileRoute("/espace/plateforme/statistiques")({
  head: () => ({
    meta: [
      { title: "Statistiques plateforme — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Statistiques pluriannuelles agrégées de la plateforme : promotions, réussite et compétences réelles.",
      },
      { property: "og:title", content: "Statistiques plateforme — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Agrégats pluriannuels tous programmes confondus, sans donnée nominative.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès : direction de la plateforme uniquement. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessPlatformAdministration)
    return <AccessRestricted area="Les statistiques de la plateforme" />;
  return <StatisticsView />;
}
