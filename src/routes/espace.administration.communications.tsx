import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { CommunicationDirectorySection } from "@/features/administration/CommunicationDirectorySection";

/**
 * COMMUNICATION INTERNE.
 *
 * ⚠️ L'ASSISTANT EN CINQ ETAPES A ETE RETIRE LE 10/09, sur decision de Stef.
 * Il ne savait rien envoyer -- « simulation locale stricte », aucun reseau,
 * aucune persistance -- et ses menus deroulants restaient vides parce qu'il
 * lisait des donnees de maquette absentes de ce programme. Stef s'y est trouve
 * bloque a la premiere etape en croyant utiliser le vrai outil : deux ecrans
 * au meme vocabulaire, dont un seul agit, fabriquaient exactement la confusion
 * que ce depot traque partout ailleurs.
 *
 * Ce qu'il promettait est desormais tenu par « Destinataires et envois », qui
 * lit l'annuaire reel du programme (inscrits ET vivier) et passe par les
 * fonctions edge habilitees.
 */
export const Route = createFileRoute("/espace/administration/communications")({
  head: () => ({
    meta: [
      { title: "Communication interne — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Annuaire des destinataires, invitations et envois du programme.",
      },
      { property: "og:title", content: "Communication interne — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Annuaire des destinataires, invitations et envois du programme.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès dérivée des RoleAssignment contextualisés du programme actif. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessProgramAdministration)
    return <AccessRestricted area="L'administration du programme" />;
  return <CommunicationDirectorySection />;
}
