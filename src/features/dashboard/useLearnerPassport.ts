import { useQuery } from "@tanstack/react-query";
import { useDataAccess, useSession } from "@/application/session";
import { computeOutcomeProgress, summarizeProgress } from "@/domain/mastery";
import { buildAcquisitionPlan } from "@/application/acquisitionPlan";
import { useLocalPlacements } from "@/application/placementDraftStore";
import { useLocalKnowledge } from "@/application/knowledgeDraftStore";
import { useLocalCompetences } from "@/application/competenceDraftStore";
import { mergePlacements } from "@/domain/placementDraft";
import { mergeOutcomes } from "@/domain/competenceDraft";

/** Agrège programme actif + acquis + preuves + stage pour l'apprenant courant. */
export function useLearnerPassport() {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();
  /** Boucle apprenant : ce que l'administration crée en session est visible ici. */
  const localPlacements = useLocalPlacements(activeProgram.id);
  const localKnowledge = useLocalKnowledge(activeProgram.id);
  const localCompetences = useLocalCompetences(activeProgram.id);

  return useQuery({
    queryKey: [
      "learner-passport",
      activeProgram.id,
      activeEnrollment?.id ?? "none",
      localPlacements.length,
      localKnowledge.length,
      localCompetences.length,
    ],
    enabled: Boolean(activeEnrollment),
    queryFn: async () => {
      if (!activeEnrollment) throw new Error("Aucune inscription active pour ce programme.");
      const [
        storedOutcomes,
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
        data.plan.listPlanSchedule(activeProgram.id),
        data.media.listLearnerNarratedDecks(activeProgram.id),
        data.contentAi.listLearnerAiResources(activeProgram.id),
      ]);

      /** Liste UNIQUE : dépôt + créations d'administration de la session. */
      const outcomes = mergeOutcomes(storedOutcomes, [...localKnowledge, ...localCompetences]);
      const placements = mergePlacements(storedPlacements, localPlacements);

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
