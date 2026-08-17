import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/espace/administration")({
  head: () => ({
    meta: [
      { title: "Administration du programme — Mon Passeport Éducatif" },
      {
        name: "description",
        content: "Organisation, configuration pédagogique, suivi, documents et gouvernance.",
      },
      { property: "og:title", content: "Administration du programme — Mon Passeport Éducatif" },
      {
        property: "og:description",
        content: "Organisation, configuration pédagogique, suivi, documents et gouvernance.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
