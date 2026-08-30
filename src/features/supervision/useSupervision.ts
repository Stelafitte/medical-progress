/**
 * Chargement du périmètre du RESPONSABLE DE STAGE.
 *
 * Le périmètre est calculé à partir des affectations dont la personne est
 * responsable : aucun étudiant hors de ces affectations n'est chargé.
 */
import { useQuery } from "@tanstack/react-query";
import { useDataAccess, useSession } from "@/application/session";
import { scopedToSupervisedEnrollments, supervisedEnrollmentIds } from "@/domain/supervision";
import { useLocalPlacements } from "@/application/placementDraftStore";
import { mergePlacements } from "@/domain/placementDraft";

export function useSupervision() {
  const data = useDataAccess();
  const { person, activeProgram } = useSession();
  /** Les terrains créés par l'administration en session sont visibles ici aussi. */
  const localPlacements = useLocalPlacements(activeProgram.id);

  return useQuery({
    queryKey: ["supervision", person.id, activeProgram.id, localPlacements.length],
    queryFn: async () => {
      const assignments = await data.placements.listAssignmentsForSupervisor(
        person.id,
        activeProgram.id,
      );
      const enrollmentIds = supervisedEnrollmentIds(assignments, person.id);
      const [
        storedPlacements,
        outcomes,
        enrollments,
        alerts,
        cases,
        confirmations,
        reports,
        messages,
        logsToValidate,
      ] = await Promise.all([
        data.placements.listPlacements(activeProgram.id),
        data.outcomes.listOutcomes(activeProgram.id),
        data.supervision.listEnrollmentsByIds(enrollmentIds),
        data.supervision.listAlerts(activeProgram.id),
        data.supervision.listCaseDiscussions(activeProgram.id),
        data.supervision.listCompetenceConfirmations(activeProgram.id),
        data.supervision.listPlacementReports(activeProgram.id),
        data.supervision.listMessages(activeProgram.id),
        data.stageLogs.listLogsToValidate(assignments.map((a) => a.id)),
      ]);
      const learners = await data.supervision.listPeopleByIds(enrollments.map((e) => e.personId));

      return {
        assignments,
        enrollmentIds,
        enrollments,
        learners,
        placements: mergePlacements(storedPlacements, localPlacements),
        outcomes,
        logsToValidate,
        alerts: scopedToSupervisedEnrollments(alerts, enrollmentIds),
        cases: scopedToSupervisedEnrollments(cases, enrollmentIds),
        confirmations: scopedToSupervisedEnrollments(confirmations, enrollmentIds),
        reports: scopedToSupervisedEnrollments(reports, enrollmentIds),
        messages,
      };
    },
  });
}

export type SupervisionScope = NonNullable<ReturnType<typeof useSupervision>["data"]>;

/** Nom de l'apprenant rattaché à une inscription encadrée. */
export function learnerName(scope: SupervisionScope, enrollmentId: string): string {
  const enrollment = scope.enrollments.find((e) => e.id === enrollmentId);
  return scope.learners.find((p) => p.id === enrollment?.personId)?.fullName ?? "Apprenant";
}
