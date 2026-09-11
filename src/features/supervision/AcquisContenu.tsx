/**
 * LE CONTENU D'UN ACQUIS, VU PAR L'ENCADRANT — exactement ce que reçoit
 * l'étudiant (11/09, demande de Stef répétée deux fois avant que je l'entende).
 *
 * CE QUE J'AVAIS MANQUÉ. L'onglet Connaissances offrait le texte du cours ;
 * l'onglet Compétences n'offrait RIEN. Or la demande portait sur les deux :
 * on ne peut pas demander à un encadrant de juger l'exactitude d'un contenu
 * qu'il ne peut pas ouvrir.
 *
 * ⚠️ LES MEMES COMPOSANTS QUE L'ECRAN APPRENANT, PAS UNE MISE EN PAGE REFAITE.
 * `OutcomeSectionsPanel`, `ChapterTextPanel` et `ResourceMediaPlayer` sont
 * importés tels quels. Une relecture faite sur une version « presque pareille »
 * ne prouverait rien : c'est la source servie qu'on vérifie, pas une
 * reconstitution.
 *
 * DEUX GISEMENTS, ET ILS NE SE RECOUVRENT PAS :
 *   - le TEXTE PROPRE à l'acquis (`read_outcome_sections`), qui n'existe que
 *     pour les connaissances rattachées au découpage 2026 ;
 *   - les SUPPORTS rattachés (`learning_resource_outcomes`) : vidéos, chapitres,
 *     diaporamas. C'est par eux que passent les compétences.
 * Un acquis peut n'avoir ni l'un ni l'autre — et on le DIT, plutôt que de
 * laisser un vide qui ressemble à une réponse.
 *
 * LE DROIT DE LIRE EST DEJA LA : `can_read_resource` accepte `is_program_staff`,
 * qui inclut l'encadrant et le responsable de stage. Rien à ouvrir en base.
 */
import { ChapterTextPanel } from "@/features/resources/ChapterTextPanel";
import { OutcomeSectionsPanel } from "@/features/resources/OutcomeSectionsPanel";
import { ResourceMediaPlayer } from "@/features/resources/ResourceMediaPlayer";
import type { LearningResource, OutcomeId } from "@/domain/types";

export function AcquisContenu({
  outcomeId,
  supports,
  avecTexteDeLAcquis = true,
}: {
  outcomeId: OutcomeId;
  supports: readonly LearningResource[];
  /**
   * Le passage propre à l'acquis. Vrai pour les connaissances, où le découpage
   * 2026 le rend ; on le demande aussi pour les compétences, qui n'en ont pas
   * aujourd'hui — la fonction répond alors sa phrase de repli, ce qui est une
   * information et non une panne.
   */
  avecTexteDeLAcquis?: boolean | undefined;
}) {
  return (
    <div className="space-y-3">
      {avecTexteDeLAcquis ? <OutcomeSectionsPanel outcomeId={outcomeId} /> : null}

      {supports.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Aucun support n'est rattaché à cet acquis dans la médiathèque du programme.
        </p>
      ) : (
        <ul className="space-y-3">
          {supports.map((support) => (
            <li key={support.id} className="space-y-1.5">
              <p className="text-[13px] font-medium">{support.title}</p>
              {support.format === "video" ? (
                <ResourceMediaPlayer resourceId={support.id} title={support.title} />
              ) : (
                <ChapterTextPanel resourceId={support.id} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
