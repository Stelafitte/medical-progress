import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { canAccessLearnerSpace } from "@/domain/access";
import { NarratedReaderView } from "@/features/resources/NarratedReaderView";

export const Route = createFileRoute("/espace/ressources/$resourceId/lecture")({
  head: () => ({
    meta: [
      { title: "Lecture d'un cours commenté — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Lecteur web synchronisé d'un diaporama commenté : diapositives, audio, sommaire et transcription.",
      },
      { property: "og:title", content: "Lecture d'un cours commenté — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Écran de lecture dédié aux apprenants du programme actif.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde de rôle : écran réservé aux apprenants du programme sélectionné. */
function Guarded() {
  const session = useSession();
  const { resourceId } = Route.useParams();
  if (!canAccessLearnerSpace(session.rolesForAccess, session.activeProgram.id))
    return <AccessRestricted area="La lecture des cours de l'espace apprenant" />;
  return <NarratedReaderView resourceId={resourceId} />;
}
