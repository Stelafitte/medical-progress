import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/espace/encadrement")({
  head: () => ({
    meta: [
      { title: "Espace responsable de stage — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Encadrement clinique : étudiants, carnets, compétences, bilans et alertes.",
      },
      { property: "og:title", content: "Espace responsable de stage — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Encadrement clinique : étudiants, carnets, compétences, bilans et alertes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
