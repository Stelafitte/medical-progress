import { createFileRoute } from "@tanstack/react-router";
import { SessionProvider } from "@/application/session";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/espace")({
  head: () => ({
    meta: [
      { title: "Espace apprenant — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Espace authentifié simulé de Campus Santé Augmenté : tableau de bord, passeport de compétences et administration.",
      },
      { property: "og:title", content: "Espace apprenant — Campus Santé Augmenté" },
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
