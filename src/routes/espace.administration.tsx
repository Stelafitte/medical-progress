import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/espace/administration")({
  head: () => ({
    meta: [
      { title: "Administration du programme — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Organisation, configuration pédagogique, suivi, documents et gouvernance.",
      },
      { property: "og:title", content: "Administration du programme — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Organisation, configuration pédagogique, suivi, documents et gouvernance.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
