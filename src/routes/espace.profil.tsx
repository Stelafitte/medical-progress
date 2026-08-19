import { createFileRoute } from "@tanstack/react-router";
import { ProfileView } from "@/features/profile/ProfileView";

export const Route = createFileRoute("/espace/profil")({
  head: () => ({
    meta: [
      { title: "Mon profil — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Identité du compte, préférences de langue et liste en lecture seule des programmes, cohortes et rôles contextualisés.",
      },
      { property: "og:title", content: "Mon profil — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Identité globale du compte et rôles contextualisés par programme.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfileView,
});
