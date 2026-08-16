import { createFileRoute } from "@tanstack/react-router";
import { ProfileView } from "@/features/profile/ProfileView";

export const Route = createFileRoute("/espace/profil")({
  head: () => ({
    meta: [
      { title: "Mon profil — Passeport Éducatif Médical" },
      {
        name: "description",
        content:
          "Identité du compte, préférences de langue et liste en lecture seule des programmes, cohortes et rôles contextualisés.",
      },
      { property: "og:title", content: "Mon profil — Passeport Éducatif Médical" },
      {
        property: "og:description",
        content: "Identité globale du compte et rôles contextualisés par programme.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfileView,
});
