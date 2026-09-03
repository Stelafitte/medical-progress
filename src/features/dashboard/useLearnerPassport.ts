import { useQuery } from "@tanstack/react-query";
import { useDataAccess, useSession } from "@/application/session";
import { computeOutcomeProgress, summarizeProgress } from "@/domain/mastery";
import { buildAcquisitionPlan } from "@/application/acquisitionPlan";
import { useLocalPlacements } from "@/application/placementDraftStore";
import { mergePlacements } from "@/domain/placementDraft";

/** Agrège programme actif + acquis + preuves + stage pour l'apprenant courant. */
export function useLearnerPassport() {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();
  /** Boucle apprenant : ce que l'administration crée en session est visible ici. */
  const localPlacements = useLocalPlacements(activeProgram.id);

  return useQuery({
    queryKey: [
      "learner-passport",
      activeProgram.id,
      activeEnrollment?.id ?? "none",
      localPlacements.length,
    ],
    enabled: Boolean(activeEnrollment),
    queryFn: async () => {
      if (!activeEnrollment) throw new Error("Aucune inscription active pour ce programme.");
      const [
        outcomes,
        evidence,
        storedPlacements,
        assignments,
        resources,
        relations,
        schedule,
        narratedDecks,
        aiResources,
      ] = await Promise.all([
        data.outcomes.listOutcomes(activeProgram.id),
        data.evidence.listEvidenceForEnrollment(activeEnrollment.id),
        data.placements.listPlacements(activeProgram.id),
        data.placements.listAssignmentsForEnrollment(activeEnrollment.id),
        data.resources.listResources(activeProgram.id),
        data.outcomes.listOutcomeRelations(activeProgram.id),
        // La promotion de l'apprenant : sans elle, aucun jalon ne le concerne.
        data.plan.listPlanSchedule(activeProgram.id, activeEnrollment.cohortId),
        data.media.listLearnerNarratedDecks(activeProgram.id),
        data.contentAi.listLearnerAiResources(activeProgram.id),
      ]);

      /*
       * Lecture separee, et non un 11e element du Promise.all ci-dessus :
       * au-dela de dix promesses, TypeScript perd l'inference de tuple et le
       * resultat retombe en `any` — l'erreur se propage alors jusqu'aux ecrans
       * qui consomment ce hook, tres loin d'ici.
       */
      const cohort = await data.programs.getCohort(activeEnrollment.cohortId);

      /*
       * Les chapitres, lus a part pour la meme raison que la promotion : au-dela
       * de dix promesses, `Promise.all` perd son inference de tuple. Ils portent
       * le regroupement de la liste des acquis — sans eux l'apprenant lit
       * plusieurs centaines de lignes a plat. La RLS d'`outcome_themes` autorise
       * deja tout inscrit du programme.
       */
      const themes = await data.outcomes.listOutcomeThemes(activeProgram.id);

      /*
       * CE QUE L'APPRENANT A DECLARE. Lu a part, pour la meme raison que les
       * chapitres. Sans cette lecture, cocher un acquis ecrirait bien en base
       * mais ne changerait RIEN a l'ecran ni au passeport — la boucle
       * resterait ouverte et l'etudiant croirait que rien n'a ete enregistre.
       */
      const selfReports = await data.passport.listSelfReports(activeEnrollment.id);
      const declarationParAcquis = new Map(selfReports.map((r) => [r.outcomeId, r] as const));

      const placements = mergePlacements(storedPlacements, localPlacements);

      const progress = outcomes.map((outcome) =>
        computeOutcomeProgress(outcome, evidence, declarationParAcquis.get(outcome.id)),
      );

      const plan = buildAcquisitionPlan({
        progress,
        evidence,
        relations,
        schedule,
        placements,
        assignments,
        /*
         * L'origine des temps du passeport est le DEBUT REEL de la promotion,
         * pas une date de demonstration. Elle valait "2026-06-01" en dur :
         * meme branche sur les vrais jalons, tout le plan se serait calcule
         * depuis un 1er juin arbitraire, et l'etudiant aurait vu des echeances
         * decalees sans qu'aucune erreur ne le signale.
         * Repli sur aujourd'hui si la promotion est introuvable : mieux vaut un
         * plan cale sur le present qu'un plan cale sur une date inventee.
         *
         * PIEGE, paye le 03/09 : `getCohort` normalise DEJA la date via
         * `normalizeIsoDate`. Lui rajouter un suffixe produisait une date
         * invalide, `toISOString()` levait, react-query avalait l'exception —
         * et le tableau de bord restait sur son squelette de chargement, sans
         * la moindre erreur en console. Ne jamais reformater ce que
         * l'adaptateur a deja normalise.
         */
        anchorDate: cohort ? cohort.startsOn : new Date().toISOString(),
      });

      return {
        outcomes,
        relations,
        plan,
        evidence,
        placements,
        assignments,
        resources,
        narratedDecks,
        aiResources,
        progress,
        themes,
        selfReports,
        // La promotion : son debut date tout le retroplanning, et c'est ce qui
        // permet a la Vue d'ensemble de dire ou l'on en est dans le stage.
        cohort,
        summary: summarizeProgress(progress),
      };
    },
  });
}
