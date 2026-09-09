import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useDataAccess, useSession } from "@/application/session";
import type { MilestoneShift, PlanMilestoneId } from "@/domain/acquisitionPlan";
import type { ReamenagementDuPlan } from "@/features/passport/views/GanttView";

/**
 * LE REAMENAGEMENT DU PLAN, COTE ECRAN (09/09).
 *
 * REND `undefined` QUAND LE PROGRAMME NE L'OUVRE PAS, et c'est tout le
 * mecanisme : le Gantt recoit alors un diagramme en lecture seule, sans une
 * seule poignee ni un seul message expliquant ce qu'on ne peut pas faire. On
 * masque, on ne grise pas — meme regle que pour l'assistant IA ce matin, et
 * pour la meme raison : un enseignement qui n'ouvre pas le reamenagement n'a
 * pas a exhiber son absence sur vingt-neuf barres.
 *
 * LE REGLAGE VIENT DE LA SESSION, pas d'une requete de plus. `activeProgram`
 * est charge par `listPrograms` au moment de la connexion et porte desormais la
 * colonne : interroger une seconde fois ferait un aller-retour pour une valeur
 * deja en main. En contrepartie, un administrateur qui ouvre le reamenagement
 * pendant qu'un etudiant est connecte ne le verra qu'au rechargement — c'est le
 * bon compromis pour un reglage qui change une fois par promotion.
 *
 * L'ECRITURE EST FRANCHE, SANS MISE A JOUR OPTIMISTE DU CACHE. Le passeport est
 * une agregation de treize lectures ; y appliquer un decalage a la main
 * dupliquerait `appliquerDecalages` a un deuxieme endroit, et c'est exactement
 * la duplication que le domaine evite. On invalide, on relit. La barre, elle,
 * reste ou l'apprenant l'a posee le temps de la relecture : c'est le Gantt qui
 * s'en charge, avec son brouillon.
 */
export function useReamenagementDuPlan(
  shifts: readonly MilestoneShift[] | undefined,
): ReamenagementDuPlan | undefined {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();
  const queryClient = useQueryClient();
  /*
   * COMPTEUR D'ECHECS. Le Gantt garde la barre a l'endroit demande tant que la
   * relecture n'a pas confirme ; si l'ecriture est refusee, la relecture ne
   * confirmera jamais et la barre resterait indefiniment a une place qui
   * n'existe pas en base. Ce compteur est le signal qui la remet en place.
   */
  const [echecs, setEchecs] = useState(0);

  const invalider = () => queryClient.invalidateQueries({ queryKey: ["learner-passport"] });
  const echouer = (reason: unknown) => {
    setEchecs((n) => n + 1);
    toast.error(
      reason instanceof Error ? reason.message : "Le déplacement n'a pas été enregistré.",
    );
  };

  const deplacement = useMutation({
    mutationFn: (input: { milestoneId: PlanMilestoneId; dueOn: string; startsOn?: string }) => {
      if (!activeEnrollment) throw new Error("Aucune inscription active.");
      return data.plan.shiftMilestone({
        enrollmentId: activeEnrollment.id,
        milestoneId: input.milestoneId,
        dueOn: input.dueOn,
        ...(input.startsOn ? { startsOn: input.startsOn } : {}),
      });
    },
    onSuccess: () => void invalider(),
    onError: echouer,
  });

  const remiseAZero = useMutation({
    mutationFn: (milestoneId: PlanMilestoneId) => {
      if (!activeEnrollment) throw new Error("Aucune inscription active.");
      return data.plan.resetMilestoneShift(activeEnrollment.id, milestoneId);
    },
    onSuccess: () => {
      toast.success("Retour à la date de la promotion.");
      void invalider();
    },
    onError: echouer,
  });

  const decales = useMemo(
    () => new Set((shifts ?? []).map((shift) => shift.milestoneId)),
    [shifts],
  );

  if (activeProgram.config.learnerPlanShiftsEnabled !== true) return undefined;
  if (!activeEnrollment) return undefined;

  return {
    deplacer: (input) => deplacement.mutate(input),
    reinitialiser: (milestoneId) => remiseAZero.mutate(milestoneId),
    decales,
    enCours: deplacement.isPending || remiseAZero.isPending,
    echecs,
  };
}
