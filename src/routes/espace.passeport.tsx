import { createFileRoute } from "@tanstack/react-router";
import { PassportView } from "@/features/passport/PassportView";

export const Route = createFileRoute("/espace/passeport")({
  head: () => ({
    meta: [
      { title: "Mon Passeport Éducatif — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Progression et objectifs dans le temps pour les connaissances théoriques et les compétences.",
      },
      { property: "og:title", content: "Mon Passeport Éducatif — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Progression et objectifs pour les connaissances théoriques et les compétences.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PassportView,
});
