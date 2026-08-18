/**
 * Chargement du périmètre de l'ADMINISTRATION DU PROGRAMME sélectionné.
 * Tout est filtré par programme : aucun autre programme n'est chargé.
 */
import { useQuery } from "@tanstack/react-query";
import { useDataAccess, useSession } from "@/application/session";

export function useProgramAdmin() {
  const data = useDataAccess();
  const { activeProgram } = useSession();

  return useQuery({
    queryKey: ["program-admin", activeProgram.id],
    queryFn: async () => {
      const [
        program,
        versions,
        cohorts,
        outcomes,
        resources,
        media,
        ecosInventory,
        ecosScenarios,
        planSchedule,
        placements,
        assignments,
        templates,
        logsReceived,
        documents,
        certificates,
        tasks,
        messageTemplates,
        sendHistory,
        alerts,
        enrollments,
        people,
        roleAssignments,
        auditEvents,
      ] = await Promise.all([
        data.programs.getProgram(activeProgram.id),
        data.programs.listCurriculumVersions(activeProgram.id),
        data.programs.listCohorts(activeProgram.id),
        data.outcomes.listOutcomes(activeProgram.id),
        data.resources.listResources(activeProgram.id),
        data.media.listMedia(activeProgram.id),
        data.ecos.listInventory(),
        data.ecos.listScenarios(activeProgram.id),
        data.plan.listPlanSchedule(activeProgram.id),
        data.placements.listPlacements(activeProgram.id),
        data.placements.listAssignmentsForProgram(activeProgram.id),
        data.stageLogs.listTemplates(activeProgram.id),
        data.stageLogs.listLogsReceived(activeProgram.id),
        data.administration.listDocuments(activeProgram.id),
        data.administration.listCertificates(activeProgram.id),
        data.administration.listTasks(activeProgram.id),
        data.administration.listMessageTemplates(),
        data.administration.listSendHistory(activeProgram.id),
        data.supervision.listAlerts(activeProgram.id),
        data.administration.listAllEnrollments(activeProgram.id),
        data.administration.listPeople(),
        data.administration.listAllRoleAssignments(),
        data.audit.listRecentEvents(8),
      ]);

      return {
        program,
        versions,
        cohorts,
        outcomes,
        resources,
        media,
        ecosInventory,
        ecosScenarios,
        planSchedule,
        placements,
        assignments,
        templates,
        logsReceived,
        documents,
        certificates,
        tasks,
        messageTemplates,
        sendHistory,
        alerts,
        enrollments,
        people,
        roleAssignments,
        auditEvents,
      };
    },
  });
}

export type ProgramAdminScope = NonNullable<ReturnType<typeof useProgramAdmin>["data"]>;

export function personNameFor(scope: ProgramAdminScope, enrollmentId: string): string {
  const enrollment = scope.enrollments.find((e) => e.id === enrollmentId);
  return scope.people.find((p) => p.id === enrollment?.personId)?.fullName ?? "Apprenant";
}
