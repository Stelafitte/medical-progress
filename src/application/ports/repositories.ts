/**
 * Contrats d'accès aux données (ports).
 *
 * Toute implémentation ultérieure (base de données provisionnée, import
 * sélectif depuis un système historique) devra respecter ces interfaces sans
 * modifier l'UI ni la logique métier.
 */
import type { PlanScheduleEntry } from "@/domain/acquisitionPlan";
import type {
  AdminDocument,
  AdminTask,
  CompletionCertificate,
  MessageTemplate,
  PlatformSupervisionRow,
  SendHistoryItem,
} from "@/domain/administration";
import type {
  CaseDiscussion,
  CompetenceConfirmation,
  PlacementReport,
  ProfessionalMessage,
  SupervisionAlert,
} from "@/domain/supervision";
import type { StageLog, StageLogTemplate } from "@/domain/stageLog";
import type { CohortStatisticsSnapshot } from "@/domain/statistics";

import type {
  AuditEvent,
  Cohort,
  CohortId,
  CurriculumVersion,
  Enrollment,
  EnrollmentId,
  Evidence,
  LearningResource,
  Outcome,
  OutcomeRelation,
  Person,
  PersonId,
  Placement,
  PlacementAssignment,
  Program,
  ProgramId,
  RoleAssignment,
} from "@/domain/types";

export interface ProgramRepository {
  listPrograms(): Promise<readonly Program[]>;
  getProgram(id: ProgramId): Promise<Program | undefined>;
  listCurriculumVersions(programId: ProgramId): Promise<readonly CurriculumVersion[]>;
  listCohorts(programId?: ProgramId): Promise<readonly Cohort[]>;
  getCohort(id: CohortId): Promise<Cohort | undefined>;
}

export interface PeopleRepository {
  getPerson(id: PersonId): Promise<Person | undefined>;
  listEnrollments(personId: PersonId): Promise<readonly Enrollment[]>;
  listRoleAssignments(personId: PersonId): Promise<readonly RoleAssignment[]>;
}

export interface OutcomeRepository {
  listOutcomes(programId: ProgramId): Promise<readonly Outcome[]>;
  listOutcomeRelations(programId: ProgramId): Promise<readonly OutcomeRelation[]>;
}

export interface EvidenceRepository {
  listEvidenceForEnrollment(enrollmentId: EnrollmentId): Promise<readonly Evidence[]>;
}

export interface PlacementRepository {
  listPlacements(programId: ProgramId): Promise<readonly Placement[]>;
  listAssignmentsForEnrollment(enrollmentId: EnrollmentId): Promise<readonly PlacementAssignment[]>;
  /** Toutes les affectations d'un programme (usage administration du programme). */
  listAssignmentsForProgram(programId: ProgramId): Promise<readonly PlacementAssignment[]>;
  /** Affectations dont une personne est responsable : périmètre de l'encadrant. */
  listAssignmentsForSupervisor(
    supervisorPersonId: PersonId,
    programId: ProgramId,
  ): Promise<readonly PlacementAssignment[]>;
}

/** Lecture du périmètre d'encadrement (responsable de stage). */
export interface SupervisionRepository {
  listAlerts(programId: ProgramId): Promise<readonly SupervisionAlert[]>;
  listCaseDiscussions(programId: ProgramId): Promise<readonly CaseDiscussion[]>;
  listCompetenceConfirmations(programId: ProgramId): Promise<readonly CompetenceConfirmation[]>;
  listPlacementReports(programId: ProgramId): Promise<readonly PlacementReport[]>;
  listMessages(programId: ProgramId): Promise<readonly ProfessionalMessage[]>;
  /** Inscriptions encadrées, résolues depuis les affectations de l'encadrant. */
  listEnrollmentsByIds(ids: readonly EnrollmentId[]): Promise<readonly Enrollment[]>;
  listPeopleByIds(ids: readonly PersonId[]): Promise<readonly Person[]>;
}

/** Lecture administrative, cloisonnée par programme. */
export interface AdministrationRepository {
  listDocuments(programId: ProgramId): Promise<readonly AdminDocument[]>;
  listCertificates(programId: ProgramId): Promise<readonly CompletionCertificate[]>;
  listTasks(programId: ProgramId): Promise<readonly AdminTask[]>;
  listMessageTemplates(): Promise<readonly MessageTemplate[]>;
  listSendHistory(programId: ProgramId): Promise<readonly SendHistoryItem[]>;
  listPeople(): Promise<readonly Person[]>;
  listAllRoleAssignments(): Promise<readonly RoleAssignment[]>;
  listAllEnrollments(programId: ProgramId): Promise<readonly Enrollment[]>;
  /** Supervision plateforme : compteurs et paramètres, jamais de dossier pédagogique. */
  listPlatformSupervision(): Promise<readonly PlatformSupervisionRow[]>;
}

export interface LearningResourceRepository {
  listResources(programId: ProgramId): Promise<readonly LearningResource[]>;
}

export interface AcquisitionPlanRepository {
  /** Calendrier de référence des acquis d'un programme. */
  listPlanSchedule(programId: ProgramId): Promise<readonly PlanScheduleEntry[]>;
}

export interface StageLogRepository {
  /** Modèles de carnets configurés pour un programme (toutes cohortes). */
  listTemplates(programId?: ProgramId): Promise<readonly StageLogTemplate[]>;
  /** Carnet(s) d'une inscription : accès apprenant limité à son propre carnet. */
  listLogsForEnrollment(enrollmentId: EnrollmentId): Promise<readonly StageLog[]>;
  /** Carnets soumis rattachés aux stages d'un encadrant / enseignant. */
  listLogsToValidate(placementAssignmentIds: readonly string[]): Promise<readonly StageLog[]>;
  /** Carnets validés puis transmis dans l'espace de l'administration du programme. */
  listLogsReceived(programId: ProgramId): Promise<readonly StageLog[]>;
}

/**
 * Statistiques conservées : les instantanés de promotion ne sont jamais
 * supprimés, ce qui rend les comparaisons pluriannuelles possibles.
 */
export interface StatisticsRepository {
  listCohortStatistics(programId: ProgramId): Promise<readonly CohortStatisticsSnapshot[]>;
}

export interface AuditRepository {
  listRecentEvents(limit?: number): Promise<readonly AuditEvent[]>;
}

/** Façade unique injectée dans l'application. */
export interface DataAccess {
  readonly programs: ProgramRepository;
  readonly people: PeopleRepository;
  readonly outcomes: OutcomeRepository;
  readonly evidence: EvidenceRepository;
  readonly placements: PlacementRepository;
  readonly resources: LearningResourceRepository;
  readonly plan: AcquisitionPlanRepository;
  readonly stageLogs: StageLogRepository;
  readonly supervision: SupervisionRepository;
  readonly administration: AdministrationRepository;
  readonly statistics: StatisticsRepository;
  readonly audit: AuditRepository;
  /** Marque explicitement une implémentation non persistante. */
  readonly isMock: boolean;
}

/**
 * Adapter de migration (non implémenté dans cette itération).
 * Sert de point d'ancrage documenté pour la réintégration sélective des
 * utilisateurs, promotions, contenus, compétences, états et moteur ECOS.
 */
export interface LegacyMigrationAdapter<TLegacy, TTarget> {
  readonly sourceSystem: string;
  readonly entityName: string;
  map(input: TLegacy): TTarget;
}
