import { useQuery } from "@tanstack/react-query";
import { useDataAccess, useSession } from "@/application/session";
import { computeOutcomeProgress, summarizeProgress } from "@/domain/mastery";
import { buildAcquisitionPlan } from "@/application/acquisitionPlan";

/** Agrège programme actif + acquis + preuves + stage pour l'apprenant courant. */
export function useLearnerPassport() {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();

  return useQuery({
    queryKey: ["learner-passport", activeProgram.id, activeEnrollment.id],
    queryFn: async () => {
      const [
        outcomes,
        evidence,
        placements,
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
        data.plan.listPlanSchedule(activeProgram.id),
        data.media.listLearnerNarratedDecks(activeProgram.id),
        data.contentAi.listLearnerAiResources(activeProgram.id),
      ]);

      const progress = outcomes.map((outcome) => computeOutcomeProgress(outcome, evidence));

      const plan = buildAcquisitionPlan({
        progress,
        evidence,
        relations,
        schedule,
        placements,
        assignments,
        anchorDate: "2026-06-01T00:00:00Z",
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
        summary: summarizeProgress(progress),
      };
    },
  });
}
