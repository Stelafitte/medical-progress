/**
 * Implémentation mock des repositories : purement en mémoire, sans persistance.
 * Remplaçable par une implémentation base de données sans toucher à l'UI.
 */
import type { DataAccess } from "@/application/ports/repositories";
import * as fx from "./fixtures";
import * as slfx from "./stageLogFixtures";


const clone = <T>(value: T): T => value;
const ok = <T>(value: T): Promise<T> => Promise.resolve(clone(value));

export const mockDataAccess: DataAccess = {
  isMock: true,
  programs: {
    listPrograms: () => ok(fx.programs),
    getProgram: (id) => ok(fx.programs.find((p) => p.id === id)),
    listCurriculumVersions: (programId) =>
      ok(fx.curriculumVersions.filter((c) => c.programId === programId)),
    listCohorts: (programId) =>
      ok(programId ? fx.cohorts.filter((c) => c.programId === programId) : fx.cohorts),
    getCohort: (id) => ok(fx.cohorts.find((c) => c.id === id)),
  },
  people: {
    getPerson: (id) => ok(fx.people.find((p) => p.id === id)),
    listEnrollments: (personId) => ok(fx.enrollments.filter((e) => e.personId === personId)),
    listRoleAssignments: (personId) =>
      ok(fx.roleAssignments.filter((r) => r.personId === personId)),
  },
  outcomes: {
    listOutcomes: (programId) => ok(fx.outcomes.filter((o) => o.programId === programId)),
    listOutcomeRelations: (programId) => {
      const ids = new Set(fx.outcomes.filter((o) => o.programId === programId).map((o) => o.id));
      return ok(
        fx.outcomeRelations.filter((r) => ids.has(r.fromOutcomeId) && ids.has(r.toOutcomeId)),
      );
    },
  },
  evidence: {
    listEvidenceForEnrollment: (enrollmentId) =>
      ok(fx.evidence.filter((e) => e.enrollmentId === enrollmentId)),
  },
  placements: {
    listPlacements: (programId) => ok(fx.placements.filter((p) => p.programId === programId)),
    listAssignmentsForEnrollment: (enrollmentId) =>
      ok(fx.placementAssignments.filter((a) => a.enrollmentId === enrollmentId)),
  },
  resources: {
    listResources: (programId) => ok(fx.learningResources.filter((r) => r.programId === programId)),
  },
  plan: {
    listPlanSchedule: (programId) => {
      const ids = new Set(fx.outcomes.filter((o) => o.programId === programId).map((o) => o.id));
      return ok(fx.planSchedule.filter((s) => ids.has(s.outcomeId)));
    },
  },
  stageLogs: {
    listTemplates: (programId) =>
      ok(
        programId
          ? slfx.stageLogTemplates.filter((t) => t.programId === programId)
          : slfx.stageLogTemplates,
      ),
    listLogsForEnrollment: (enrollmentId) =>
      ok(slfx.stageLogs.filter((l) => l.enrollmentId === enrollmentId)),
    listLogsToValidate: (placementAssignmentIds) =>
      ok(
        slfx.stageLogs.filter(
          (l) =>
            l.status === "submitted" &&
            !!l.placementAssignmentId &&
            placementAssignmentIds.includes(l.placementAssignmentId),
        ),
      ),
    listLogsReceived: (programId) =>
      ok(
        slfx.stageLogs.filter(
          (l) => l.programId === programId && (l.status === "validated" || l.status === "transmitted"),
        ),
      ),
  },
  audit: {
    listRecentEvents: (limit = 20) => ok(fx.auditEvents.slice(0, limit)),
  },

};
