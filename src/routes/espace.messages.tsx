import { createFileRoute } from "@tanstack/react-router";
import { AccessRestricted } from "@/components/access-restricted";
import { useSession } from "@/application/session";
import { canAccessLearnerSpace } from "@/domain/access";
import { LearnerMessagesView } from "@/features/messages/LearnerMessagesView";

function MessagesRoute() {
  const { roles, activeProgram } = useSession();
  if (!canAccessLearnerSpace(roles, activeProgram.id)) {
    return <AccessRestricted area="Mes messages" />;
  }
  return <LearnerMessagesView />;
}

export const Route = createFileRoute("/espace/messages")({
  head: () => ({
    meta: [
      { title: "Mes messages — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Annonces, relances et convocations adressées à ma promotion — réception simulée, aucun envoi réel.",
      },
      { property: "og:title", content: "Mes messages — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Annonces, relances et convocations de mon programme (simulé).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagesRoute,
});
