import { createFileRoute } from "@tanstack/react-router";
import { SessionProvider } from "@/application/session";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/espace")({
  head: () => ({
    meta: [
      { title: "Espace apprenant — Passeport Éducatif Médical" },
      {
        name: "description",
        content:
          "Espace authentifié simulé du Passeport Éducatif Médical : tableau de bord, passeport de compétences et administration.",
      },
      { property: "og:title", content: "Espace apprenant — Passeport Éducatif Médical" },
      {
        property: "og:description",
        content: "Tableau de bord, passeport de compétences et administration multi-programmes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EspaceLayout,
});

function EspaceLayout() {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}
