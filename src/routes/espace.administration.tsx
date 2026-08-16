import { createFileRoute } from "@tanstack/react-router";
import { AdministrationView } from "@/features/administration/AdministrationView";

export const Route = createFileRoute("/espace/administration")({
  head: () => ({
    meta: [
      { title: "Administration des programmes — Passeport Éducatif Médical" },
      {
        name: "description",
        content:
          "Vue administrative minimale : programmes, versions de référentiel et cohortes du socle multi-programmes.",
      },
      { property: "og:title", content: "Administration — Passeport Éducatif Médical" },
      {
        property: "og:description",
        content: "Programmes, référentiels et cohortes gérés par un moteur commun configurable.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdministrationView,
});
