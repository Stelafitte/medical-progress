import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useDataAccess, useSession } from "@/application/session";
import type { MasteryLevel, OutcomeId } from "@/domain/types";

/**
 * L'objectif 3 du passeport : « pouvoir cocher / enregistrer les acquis au fur
 * et à mesure, par déclaration libre de l'apprenant » (Stef, 03/09).
 *
 * UN SEUL POINT D'ÉCRITURE pour les deux gestes prévus — la case à cocher sur
 * ordinateur et le glissement sur téléphone. Ce sont deux façons de dire la
 * même chose ; leur faire écrire deux chemins différents finirait par les faire
 * diverger.
 *
 * ON RÉINTERROGE TOUT LE PASSEPORT après l'écriture plutôt que de recoller le
 * résultat dans le cache. Une déclaration ne change pas qu'une case : elle
 * déplace l'acquis dans le Kanban, dans la synthèse « Qu'ai-je acquis ? » et
 * dans le compte du chapitre. Relire est moins malin, et juste.
 */
export function useDeclareOutcome() {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { activeEnrollment } = useSession();

  return useMutation({
    mutationFn: async (input: {
      outcomeId: OutcomeId;
      level: MasteryLevel;
      note?: string;
      /** Le code affiche a l'ecran, pour que le message nomme l'acquis. */
      code?: string;
      /** Une competence reelle attend une contresignature ; pas une connaissance. */
      nature?: "knowledge" | "simulated_competence" | "real_competence";
    }) => {
      if (!activeEnrollment) {
        throw new Error("Aucune inscription active : impossible d'enregistrer une déclaration.");
      }
      return data.passport.declareOutcomeLevel({
        enrollmentId: activeEnrollment.id,
        outcomeId: input.outcomeId,
        level: input.level,
        ...(input.note === undefined ? {} : { note: input.note }),
      });
    },
    /*
     * DIRE OU C'EST PARTI (Stef, 08/09 : « quand je clique sur le bouton d'une
     * competence, la ligne disparait »).
     *
     * ELLE NE DISPARAISSAIT PAS : le Kanban range par etat, et declarer une
     * COMPETENCE REELLE leve `blockedBySelfDeclaration`, donc l'acquis passe de
     * « A travailler » a « A valider » — trois colonnes plus loin, c'est-a-dire
     * hors de l'ecran sur un telephone. Le comportement etait juste, le retour
     * absent : l'etudiant faisait un geste et voyait une ligne s'effacer.
     *
     * LE MESSAGE EST ECRIT ICI, PAS DANS L'INTERRUPTEUR : six ecrans portent ce
     * geste, et une copie par ecran aurait fini par en dire six choses
     * differentes. Il ne s'affiche qu'a la MONTEE : decocher est un retrait, il
     * n'a rien a annoncer.
     */
    onSuccess: (_resultat, input) => {
      void queryClient.invalidateQueries({ queryKey: ["learner-passport"] });
      if (input.level === "not_started") return;
      const nom = input.code ?? "L'acquis";
      toast.success(
        input.nature === "real_competence" ? `${nom} déclaré` : `${nom} acquis`,
        input.nature === "real_competence"
          ? {
              description: "En attente de la validation de votre encadrant, dans « À valider ».",
            }
          : undefined,
      );
    },
  });
}
