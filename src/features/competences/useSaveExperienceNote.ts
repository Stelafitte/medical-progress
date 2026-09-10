import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useDataAccess, useSession } from "@/application/session";
import type { OutcomeId } from "@/domain/types";

/** Le plafond de la base (`outcome_experience_notes.body`), redit ici pour que
 *  le champ compte AVANT l'envoi : au-dela, la contrainte refuse la ligne et
 *  l'apprenant perdrait son texte sur une erreur. */
export const EXPERIENCE_NOTE_MAX = 10000;

/**
 * « MON EXPERIENCE D'ACQUISITION » — enfin ecrite quelque part (10/09).
 *
 * Elle vivait dans un magasin EN MEMOIRE : l'apprenant tapait son vecu,
 * rechargeait la page, tout etait perdu. Et contrairement au fil de tuteur
 * juste en dessous, la boite ne portait AUCUN badge « Simule » : rien ne
 * l'avertissait.
 *
 * ON N'ENREGISTRE PAS A CHAQUE FRAPPE. Une note de plusieurs centaines de
 * caracteres ferait autant d'appels que de lettres tapees. L'ecriture part a la
 * SORTIE du champ, une fois, et seulement si le texte a change — un aller-retour
 * reseau pour un champ qu'on a seulement survole serait du bruit.
 *
 * PAS DE `toast` DE SUCCES. Ecrire une note n'est pas un geste qu'on confirme :
 * c'est la frappe elle-meme. Un message a chaque sortie de champ deviendrait
 * une nuisance. L'echec, lui, se dit — sinon l'apprenant croit avoir enregistre.
 */
export function useSaveExperienceNote() {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { activeEnrollment } = useSession();

  return useMutation({
    mutationFn: async (input: { outcomeId: OutcomeId; body: string }) => {
      if (!activeEnrollment) {
        throw new Error("Aucune inscription active : impossible d'enregistrer une note.");
      }
      return data.passport.saveExperienceNote({
        enrollmentId: activeEnrollment.id,
        outcomeId: input.outcomeId,
        body: input.body,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["learner-passport"] });
    },
    onError: (raison) =>
      toast.error(
        raison instanceof Error ? raison.message : "Votre note n’a pas pu être enregistrée.",
      ),
  });
}
