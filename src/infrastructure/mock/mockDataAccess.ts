/**
 * Implémentation mock des repositories : purement en mémoire, sans persistance.
 * Remplaçable par une implémentation base de données sans toucher à l'UI.
 */
import type { DataAccess } from "@/application/ports/repositories";
import * as fx from "./fixtures";
import * as pfx from "./professionalFixtures";
import * as slfx from "./stageLogFixtures";
import * as stfx from "./statisticsFixtures";
import { toLearnerNarratedDeck } from "@/domain/mediaLibrary";
import { toLearnerAiResource } from "@/domain/contentAi";
import * as mfx from "./mediaFixtures";
import * as cafx from "./contentAiFixtures";
import * as aicfx from "./aiCreditsFixtures";
import * as efx from "./ecosFixtures";
import * as dpc from "./dpcFixtures";
import * as hvg from "./dpcHvgFixtures";

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
    listAssignmentsForProgram: (programId) => {
      const placementIds = new Set(
        fx.placements.filter((p) => p.programId === programId).map((p) => p.id),
      );
      return ok(fx.placementAssignments.filter((a) => placementIds.has(a.placementId)));
    },
    listAssignmentsForSupervisor: (supervisorPersonId, programId) => {
      const placementIds = new Set(
        fx.placements.filter((p) => p.programId === programId).map((p) => p.id),
      );
      return ok(
        fx.placementAssignments.filter(
          (a) => a.supervisorPersonId === supervisorPersonId && placementIds.has(a.placementId),
        ),
      );
    },
  },
  supervision: {
    listAlerts: (programId) => ok(pfx.supervisionAlerts.filter((a) => a.programId === programId)),
    listCaseDiscussions: (programId) =>
      ok(pfx.caseDiscussions.filter((c) => c.programId === programId)),
    listCompetenceConfirmations: (programId) =>
      ok(pfx.competenceConfirmations.filter((c) => c.programId === programId)),
    listPlacementReports: (programId) =>
      ok(pfx.placementReports.filter((r) => r.programId === programId)),
    listMessages: (programId) =>
      ok(pfx.professionalMessages.filter((m) => m.programId === programId)),
    listEnrollmentsByIds: (ids) => ok(fx.enrollments.filter((e) => ids.includes(e.id))),
    listPeopleByIds: (ids) => ok(fx.people.filter((p) => ids.includes(p.id))),
  },
  administration: {
    listDocuments: (programId) => ok(pfx.adminDocuments.filter((d) => d.programId === programId)),
    listCertificates: (programId) =>
      ok(pfx.completionCertificates.filter((c) => c.programId === programId)),
    listTasks: (programId) => ok(pfx.adminTasks.filter((t) => t.programId === programId)),
    listMessageTemplates: () => ok(pfx.messageTemplates),
    listSendHistory: (programId) => ok(pfx.sendHistory.filter((s) => s.programId === programId)),
    listPeople: () => ok(fx.people),
    listAllRoleAssignments: () => ok(fx.roleAssignments),
    listAllEnrollments: (programId) => ok(fx.enrollments.filter((e) => e.programId === programId)),
    listPlatformSupervision: () => ok(pfx.platformSupervision),
  },
  resources: {
    listResources: (programId) => ok(fx.learningResources.filter((r) => r.programId === programId)),
  },
  media: {
    listMedia: (programId) => ok(mfx.mediaResources.filter((m) => m.programId === programId)),
    getMedia: (id) => ok(mfx.mediaResources.find((m) => m.id === id)),
    listLearnerNarratedDecks: (programId) =>
      ok(
        mfx.mediaResources
          .filter((m) => m.programId === programId)
          .map((m) => toLearnerNarratedDeck(m))
          .filter((d): d is NonNullable<typeof d> => d !== undefined),
      ),
  },
  aiCredits: {
    listEntries: (programId) => ok(aicfx.aiCreditEntries.filter((e) => e.programId === programId)),
    getBudget: (programId) => ok(aicfx.aiCreditBudgets.find((b) => b.programId === programId)),
  },
  contentAi: {
    listProfiles: (programId) =>
      ok(cafx.allContentAiProfiles.filter((p) => p.programId === programId)),
    getProfile: (mediaId) => ok(cafx.allContentAiProfiles.find((p) => p.mediaId === mediaId)),
    getPolicy: (programId) => ok(cafx.programAiPolicies.find((p) => p.programId === programId)),
    listLearnerAiResources: (programId) => {
      const policy = cafx.programAiPolicies.find((p) => p.programId === programId);
      if (!policy) return ok([]);
      return ok(
        mfx.mediaResources
          .filter((m) => m.programId === programId)
          .map((m) =>
            toLearnerAiResource(
              m,
              cafx.allContentAiProfiles.find((p) => p.mediaId === m.id),
              policy,
            ),
          )
          .filter((r): r is NonNullable<typeof r> => r !== undefined),
      );
    },
  },
  ecos: {
    listInventory: () => ok(efx.legacyEcosInventory),
    listScenarios: (programId) => ok(efx.ecosScenarios.filter((s) => s.programId === programId)),
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
          (l) =>
            l.programId === programId && (l.status === "validated" || l.status === "transmitted"),
        ),
      ),
  },
  statistics: {
    listCohortStatistics: (programId) =>
      ok(stfx.cohortStatistics.filter((s) => s.programId === programId)),
  },
  clinicalAudits: {
    listTemplates: (programId) => ok(dpc.auditTemplates.filter((t) => t.programId === programId)),
    listCampaigns: (programId) => ok(dpc.auditCampaigns.filter((c) => c.programId === programId)),
    listSubmissions: (programId) => {
      const campaignIds = new Set(
        dpc.auditCampaigns.filter((c) => c.programId === programId).map((c) => c.id),
      );
      return ok(dpc.auditSubmissions.filter((s) => campaignIds.has(s.campaignId)));
    },
    listSubmissionsForEnrollment: (enrollmentId) =>
      ok(dpc.auditSubmissions.filter((s) => s.enrollmentId === enrollmentId)),
    listTests: (programId) => ok(dpc.prePostTests.filter((t) => t.programId === programId)),
    listTestResults: (programId) => {
      const testIds = new Set(
        dpc.prePostTests.filter((t) => t.programId === programId).map((t) => t.id),
      );
      return ok(dpc.prePostTestResults.filter((r) => testIds.has(r.testId)));
    },
    listSessions: (programId) => ok(dpc.teachingSessions.filter((s) => s.programId === programId)),
  },
  dpc: {
    listGrids: (programId) => ok(hvg.dpcHvgGrids.filter((g) => g.programId === programId)),
    getSetup: (programId) =>
      ok(hvg.dpcHvgSetup.programId === programId ? hvg.dpcHvgSetup : undefined),
    listRounds: (programId) => ok(hvg.dpcHvgRounds.filter((r) => r.programId === programId)),
    listEntries: (programId) => {
      const roundIds = new Set(
        hvg.dpcHvgRounds.filter((r) => r.programId === programId).map((r) => r.id),
      );
      return ok(hvg.dpcHvgEntries.filter((e) => roundIds.has(e.roundId)));
    },
    listEntriesForEnrollment: (enrollmentId) =>
      ok(hvg.dpcHvgEntries.filter((e) => e.enrollmentId === enrollmentId)),
    listSequences: (programId) =>
      ok(programId === hvg.DPC_HVG_PROGRAM_ID ? hvg.dpcHvgSequences : []),
    listQuestions: (programId) =>
      ok(programId === hvg.DPC_HVG_PROGRAM_ID ? hvg.dpcHvgQuestions : []),
    listTests: (programId) => ok(hvg.dpcHvgTests.filter((t) => t.programId === programId)),
    listTestAttempts: (programId) => {
      const testIds = new Set(
        hvg.dpcHvgTests.filter((t) => t.programId === programId).map((t) => t.id),
      );
      return ok(hvg.dpcHvgTestAttempts.filter((a) => testIds.has(a.testId)));
    },
    listAttendance: (programId) => {
      const sessionIds = new Set(
        hvg.dpcHvgSessions.filter((s) => s.programId === programId).map((s) => s.id),
      );
      return ok(hvg.dpcHvgAttendance.filter((a) => sessionIds.has(a.sessionId)));
    },
    listSessions: (programId) => ok(hvg.dpcHvgSessions.filter((s) => s.programId === programId)),
  },
  audit: {
    listRecentEvents: (limit = 20) => ok(fx.auditEvents.slice(0, limit)),
  },
};
