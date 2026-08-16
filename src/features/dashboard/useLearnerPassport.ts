import { useQuery } from "@tanstack/react-query";
import { useDataAccess, useSession } from "@/application/session";
import { computeOutcomeProgress, summarizeProgress } from "@/domain/mastery";

/** Agrège programme actif + acquis + preuves + stage pour l'apprenant courant. */
export function useLearnerPassport() {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();

  return useQuery({
    queryKey: ["learner-passport", activeProgram.id, activeEnrollment.id],
    queryFn: async () => {
      const [outcomes, evidence, placements, assignments, resources] = await Promise.all([
        data.outcomes.listOutcomes(activeProgram.id),
        data.evidence.listEvidenceForEnrollment(activeEnrollment.id),
        data.placements.listPlacements(activeProgram.id),
        data.placements.listAssignmentsForEnrollment(activeEnrollment.id),
        data.resources.listResources(activeProgram.id),
      ]);

      const progress = outcomes.map((outcome) => computeOutcomeProgress(outcome, evidence));

      return {
        outcomes,
        evidence,
        placements,
        assignments,
        resources,
        progress,
        summary: summarizeProgress(progress),
      };
    },
  });
}
