import { useMutation, useQueryClient } from "@tanstack/react-query";

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
    mutationFn: async (input: { outcomeId: OutcomeId; level: MasteryLevel; note?: string }) => {
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["learner-passport"] });
    },
  });
}
