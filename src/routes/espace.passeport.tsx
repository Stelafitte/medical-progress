import { createFileRoute } from "@tanstack/react-router";
import { PassportView } from "@/features/passport/PassportView";

export const Route = createFileRoute("/espace/passeport")({
  head: () => ({
    meta: [
      { title: "Mon passeport de compétences — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Connaissances, compétences simulées et compétences en situation réelle : preuves d'acquisition et niveaux de maîtrise.",
      },
      { property: "og:title", content: "Mon passeport de compétences — Campus Santé Augmenté" },
      {
        property: "og:description",
        content:
          "Connaissances, compétences simulées et compétences en situation réelle, avec leurs preuves.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PassportView,
});
