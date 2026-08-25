import { createFileRoute } from "@tanstack/react-router";
import { PlatformPilotageView } from "@/features/administration/PlatformPilotageView";

export const Route = createFileRoute("/espace/plateforme/pilotage")({
  head: () => ({
    meta: [
      { title: "Pilotage et paramétrage — Direction plateforme" },
      {
        name: "description",
        content:
          "Utilisateurs par groupe de rôle, cadre général et par programme, notifications et courriel aux intervenants.",
      },
      { property: "og:title", content: "Pilotage et paramétrage — Direction plateforme" },
      {
        property: "og:description",
        content: "Paramétrage transversal simulé de la plateforme.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlatformPilotageView,
});
