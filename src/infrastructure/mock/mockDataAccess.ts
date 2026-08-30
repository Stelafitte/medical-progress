/**
 * Implémentation mock des repositories : purement en mémoire, sans persistance.
 * Remplaçable par une implémentation base de données sans toucher à l'UI.
 */
import type { DataAccess } from "@/application/ports/repositories";
import type { PendingPerson } from "@/domain/peopleStaging";
import type { Cohort, LearningResource, Outcome, RoleAssignment } from "@/domain/types";
import { scopeFromGrantFields } from "@/domain/accessGrant";
import type { AssessmentModality } from "@/domain/assessmentModality";
import type { ProgramId } from "@/domain/types";
import { modalityFixturesFor } from "./assessmentModalityFixtures";
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
  /**
   * `cohorts` est mutable ici : `createCohort` doit pouvoir ajouter une
   * classe et la voir immédiatement dans `listCohorts`, même pattern que
   * `peopleStaging`/`administration` ci-dessous.
   */
  programs: (() => {
    let cohorts: Cohort[] = [...fx.cohorts];
    let counter = 0;
    return {
      listPrograms: () => ok(fx.programs),
      getProgram: (id) => ok(fx.programs.find((p) => p.id === id)),
      listCurriculumVersions: (programId) =>
        ok(fx.curriculumVersions.filter((c) => c.programId === programId)),
      listCohorts: (programId) =>
        ok(programId ? cohorts.filter((c) => c.programId === programId) : cohorts),
      getCohort: (id) => ok(cohorts.find((c) => c.id === id)),
      createCohort: (input) => {
        counter += 1;
        const created: Cohort = {
          id: `mock-cohort-${counter}` as Cohort["id"],
          createdAt: new Date().toISOString(),
          provenance: { sourceSystem: "native" },
          programId: input.programId,
          curriculumVersionId: input.curriculumVersionId,
          label: input.label,
          academicYear: input.academicYear,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          learnerCount: 0,
        };
        cohorts = [...cohorts, created];
        return ok(created);
      },
    };
  })(),
  people: {
    getPerson: (id) => ok(fx.people.find((p) => p.id === id)),
    listEnrollments: (personId) => ok(fx.enrollments.filter((e) => e.personId === personId)),
    listRoleAssignments: (personId) =>
      ok(fx.roleAssignments.filter((r) => r.personId === personId)),
  },
  /**
   * Sas de pré-inscription (D94) : non consommé par la maquette locale
   * (PeopleEnrollmentsView utilise directoryStore en mode simulé), mais
   * doit rester fonctionnel pour satisfaire l'interface DataAccess et pour
   * d'éventuels tests. Purement en mémoire, réinitialisé au rechargement.
   */
  peopleStaging: (() => {
    let pending: PendingPerson[] = [];
    let counter = 0;
    return {
      listPendingPeople: (programId) => ok(pending.filter((p) => p.programId === programId)),
      createPendingPerson: (input) => {
        counter += 1;
        const now = new Date().toISOString();
        const created: PendingPerson = {
          id: `mock-pending-${counter}`,
          programId: input.programId,
          firstName: input.firstName,
          lastName: input.lastName,
          loginEmail: input.loginEmail.trim().toLowerCase(),
          origin: "individual",
          status: "pending",
          createdAt: now,
          updatedAt: now,
          ...(input.institutionalId ? { institutionalId: input.institutionalId } : {}),
          ...(input.intendedCohortId ? { intendedCohortId: input.intendedCohortId } : {}),
        };
        pending = [...pending, created];
        return ok(created);
      },
      sendInvitations: (personIds) => {
        const now = new Date().toISOString();
        pending = pending.map((p) =>
          personIds.includes(p.id) ? { ...p, status: "invited", invitedAt: now } : p,
        );
        return ok(personIds.map((personId) => ({ personId, ok: true })));
      },
    };
  })(),
  /**
   * `outcomes` est mutable ici : `createOutcome` doit pouvoir ajouter une
   * compétence ou une connaissance et la voir immédiatement dans
   * `listOutcomes`, même pattern que `programs`/`assessments` ci-dessus.
   */
  outcomes: (() => {
    let outcomes: Outcome[] = [...fx.outcomes];
    let counter = 0;
    return {
      listOutcomes: (programId) => ok(outcomes.filter((o) => o.programId === programId)),
      listOutcomeRelations: (programId) => {
        const ids = new Set(outcomes.filter((o) => o.programId === programId).map((o) => o.id));
        return ok(
          fx.outcomeRelations.filter((r) => ids.has(r.fromOutcomeId) && ids.has(r.toOutcomeId)),
        );
      },
      createOutcome: (input) => {
        counter += 1;
        const created: Outcome = {
          id: `mock-outcome-${counter}` as Outcome["id"],
          createdAt: new Date().toISOString(),
          provenance: { sourceSystem: "native" },
          programId: input.programId,
          curriculumVersionId: input.curriculumVersionId,
          code: input.code,
          label: input.label,
          description: input.description,
          nature: input.nature,
          domain: input.domain,
          targetMastery: input.targetMastery,
        };
        outcomes = [...outcomes, created];
        return ok(created);
      },
    };
  })(),
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
  /**
   * `roleAssignments` est mutable ici : `grantRoleAssignment` doit pouvoir
   * ajouter un droit et le voir immédiatement dans `listAllRoleAssignments`,
   * même pattern que `peopleStaging` ci-dessus.
   */
  administration: (() => {
    let roleAssignments: RoleAssignment[] = [...fx.roleAssignments];
    return {
      listDocuments: (programId) => ok(pfx.adminDocuments.filter((d) => d.programId === programId)),
      listCertificates: (programId) =>
        ok(pfx.completionCertificates.filter((c) => c.programId === programId)),
      listTasks: (programId) => ok(pfx.adminTasks.filter((t) => t.programId === programId)),
      listMessageTemplates: () => ok(pfx.messageTemplates),
      listSendHistory: (programId) => ok(pfx.sendHistory.filter((s) => s.programId === programId)),
      listPeople: () => ok(fx.people),
      listAllRoleAssignments: () => ok(roleAssignments),
      listAllEnrollments: (programId) =>
        ok(fx.enrollments.filter((e) => e.programId === programId)),
      listPlatformSupervision: () => ok(pfx.platformSupervision),
      grantRoleAssignment: (input) => {
        const created: RoleAssignment = {
          personId: input.personId,
          role: input.role,
          scope: scopeFromGrantFields(input.scopeKind, input.scopeId, input.programId),
          grantedAt: new Date().toISOString(),
          provenance: { sourceSystem: "native" },
        };
        roleAssignments = [...roleAssignments, created];
        return ok(created);
      },
    };
  })(),
  /**
   * Référentiel des modalités d'évaluation : seedé avec les fixtures
   * déterministes du programme dès la première lecture, puis mutable, même
   * pattern que `peopleStaging`/`administration` ci-dessus. Les sessions par
   * cohorte restent hors périmètre (voir `assessmentModalityFixtures`).
   */
  assessments: (() => {
    let modalities: AssessmentModality[] = [];
    const seededPrograms = new Set<ProgramId>();
    let counter = 0;

    function ensureSeeded(programId: ProgramId): void {
      if (seededPrograms.has(programId)) return;
      seededPrograms.add(programId);
      modalities = [...modalities, ...modalityFixturesFor(programId)];
    }

    return {
      listAssessmentModalities: (programId) => {
        ensureSeeded(programId);
        return ok(modalities.filter((m) => m.programId === programId));
      },
      createAssessmentModality: (input) => {
        ensureSeeded(input.programId);
        counter += 1;
        const now = new Date().toISOString();
        const notes = input.notes.trim();
        const created: AssessmentModality = {
          id: `mock-modality-${counter}`,
          programId: input.programId,
          name: input.name.trim(),
          createdAt: now,
          updatedAt: now,
          mode: input.mode,
          subtype: input.subtype,
          usage: input.usage,
          ...(notes.length > 0 ? { notes } : {}),
        };
        modalities = [...modalities, created];
        return ok(created);
      },
    };
  })(),
  /**
   * `resources` est mutable ici : `createResource` (et le reste du flux de
   * création réelle — upload, enregistrement d'asset, publication d'un
   * diaporama sonorisé) doit se refléter immédiatement dans `listResources`,
   * même pattern que `outcomes`/`peopleStaging` ci-dessus. Aucun octet n'est
   * réellement transmis en mode mock : `uploadResourceFile` est un no-op.
   */
  resources: (() => {
    let resources: LearningResource[] = [...fx.learningResources];
    let counter = 0;
    return {
      listResources: (programId) => ok(resources.filter((r) => r.programId === programId)),
      createResource: (input) => {
        counter += 1;
        const created: LearningResource = {
          id: `mock-resource-${counter}` as LearningResource["id"],
          createdAt: new Date().toISOString(),
          provenance: { sourceSystem: "native" },
          programId: input.programId,
          title: input.title,
          format: input.format,
          outcomeIds: input.outcomeIds,
          estimatedMinutes: 0,
        };
        resources = [...resources, created];
        return ok(created);
      },
      requestUploadUrl: (input) => {
        counter += 1;
        return ok({
          bucket: input.bucket,
          objectPath: `mock/${input.programId}/${counter}-${input.fileName}`,
          signedUrl: `mock://upload/${counter}`,
          token: `mock-token-${counter}`,
        });
      },
      uploadResourceFile: () => ok(undefined),
      registerAsset: (input) => {
        counter += 1;
        return ok({
          id: `mock-asset-${counter}`,
          resourceId: input.resourceId,
          kind: input.kind,
          bucketName: input.bucketName,
          objectPath: input.objectPath,
        });
      },
      publishNarratedDeck: (input) => {
        counter += 1;
        return ok({
          id: `mock-deck-${counter}`,
          resourceId: input.resourceId,
          version: 1,
          status: "published",
        });
      },
      /** Aucune transcription hors ligne : la maquette annonce simplement qu'il n'y a rien a faire. */
      transcribeNextSlide: () =>
        ok({ slideIndex: null, characters: 0, remaining: 0, done: true }),
    };
  })(),
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
