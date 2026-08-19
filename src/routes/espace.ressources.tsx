import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/espace/ressources")({
  head: () => ({
    meta: [
      { title: "Ressources — Campus Santé Augmenté" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
