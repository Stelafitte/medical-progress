/**
 * Contrats d'accès aux données (ports).
 *
 * Toute implémentation ultérieure (base de données provisionnée, import
 * sélectif depuis un système historique) devra respecter ces interfaces sans
 * modifier l'UI ni la logique métier.
 */
import type { PlanScheduleEntry } from "@/domain/acquisitionPlan";
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
