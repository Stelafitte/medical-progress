import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { CommunicationDirectorySection } from "@/features/administration/CommunicationDirectorySection";
import { EquipeDuProgrammeAutonome } from "@/features/supervision/EquipeDuProgramme";

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

/**
 * Garde d'accès dérivée des RoleAssignment contextualisés du programme actif.
 *
 * ⚠️ TOUTE L'EQUIPE DU PROGRAMME, PAS SEULEMENT L'ADMINISTRATION (Stef,
 * 11/09). La garde lisait `canAccessProgramAdministration` et fermait la porte
 * a l'encadrant comme au responsable de stage — alors que la base, elle, les
 * autorise depuis toujours : les politiques de `communication_campaigns`
 * passent par `is_program_staff`, qui couvre l'enseignant, l'encadrant et le
 * responsable de stage. L'ecran etait donc PLUS STRICT QUE LA BASE, ce qui est
 * le sens le moins visible de l'erreur : personne ne voit un droit qu'on ne
 * lui montre pas.
 */
function Guarded() {
  const session = useSession();
  if (!session.canAccessInternalCommunication)
    return <AccessRestricted area="La communication interne du programme" />;
  return (
    <div className="space-y-6">
      {/* A QUI S'ADRESSER, AVANT DE SAVOIR QUOI ECRIRE (Stef, 11/09). La carte
          n'apparait que pour qui encadre : l'administration a deja sa propre
          vue de l'equipe dans « Equipe d'encadrement ». */}
      {session.canAccessSupervision ? (
        <EquipeDuProgrammeAutonome titre="À qui vous adresser dans ce programme" />
      ) : null}
      <CommunicationDirectorySection />
    </div>
  );
}
