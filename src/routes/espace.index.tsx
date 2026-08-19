import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "@/features/dashboard/DashboardView";

export const Route = createFileRoute("/espace/")({
  head: () => ({
    meta: [
      { title: "Tableau de bord apprenant — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Aujourd'hui, cette semaine, jalons, progression et stage : le pilotage quotidien de l'apprenant.",
      },
      { property: "og:title", content: "Tableau de bord apprenant — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Aujourd'hui, cette semaine, jalons, progression et stage.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardView,
});
