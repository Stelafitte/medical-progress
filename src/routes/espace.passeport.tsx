import { createFileRoute } from "@tanstack/react-router";
import { PassportView } from "@/features/passport/PassportView";

export const Route = createFileRoute("/espace/passeport")({
  head: () => ({
    meta: [
      { title: "Passeport de compétences — Passeport Éducatif Médical" },
      {
        name: "description",
        content:
          "Preuves d'acquisition et niveaux de maîtrise par acquis : connaissance, compétence simulée, compétence réelle validée.",
      },
      { property: "og:title", content: "Passeport de compétences — Passeport Éducatif Médical" },
      {
        property: "og:description",
        content: "Preuves d'acquisition et niveaux de maîtrise par acquis d'apprentissage.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PassportView,
});
