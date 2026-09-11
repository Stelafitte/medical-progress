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
  /*
   * LIEN PROFOND DEPUIS LE BOUTON « Echanger avec mon tuteur ».
   *
   * DEUX NOMS DISTINCTS, et non le `?acquis=` de l ecran des competences : la
   * ce parametre porte le CODE de l acquis, ici il faut son IDENTIFIANT pour
   * ouvrir ou creer le fil. Deux sens pour un meme nom sur deux routes est
   * exactement le genre de detail qui se paie six mois plus tard.
   */
  validateSearch: (search: Record<string, unknown>): { competence?: string; journee?: string } => {
    const competence = search["competence"];
    const journee = search["journee"];
    return {
      ...(typeof competence === "string" ? { competence } : {}),
      ...(typeof journee === "string" ? { journee } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Mes messages — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Annonces de mon programme, et mes échanges avec mes encadrants.",
      },
      { property: "og:title", content: "Mes messages — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Annonces de mon programme, et mes échanges avec mes encadrants.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagesRoute,
});
