import { createFileRoute } from "@tanstack/react-router";
import { PlatformUsersView } from "@/features/administration/PlatformUsersView";

export const Route = createFileRoute("/espace/plateforme/pilotage")({
  head: () => ({
    meta: [
      { title: "Utilisateurs et réglages — Direction plateforme" },
      {
        name: "description",
        content: "Utilisateurs par groupe de rôle et renvoi vers chaque réglage réel.",
      },
      { property: "og:title", content: "Utilisateurs et réglages — Direction plateforme" },
      {
        property: "og:description",
        content: "Utilisateurs par groupe de rôle et réglages réels de la plateforme.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlatformUsersView,
});
