/**
 * Contrats d'accès aux données (ports).
 *
 * Toute implémentation ultérieure (base de données provisionnée, import
 * sélectif depuis un système historique) devra respecter ces interfaces sans
 * modifier l'UI ni la logique métier.
 */
import type { PlanScheduleEntry } from "@/domain/acquisitionPlan";
import type {
  AssessmentMode,
  AssessmentModality,
  AssessmentSubtype,
  AssessmentUsage,
} from "@/domain/assessmentModality";
import type { LearnerNarratedDeck, MediaResource } from "@/domain/mediaLibrary";
import type { ContentAiProfile, LearnerAiResource, ProgramAiPolicy } from "@/domain/contentAi";
import type { AiCreditBudget, AiCreditEntry } from "@/domain/aiCredits";
import type { EcosScenarioMock, LegacyModuleInventoryItem } from "@/domain/ecosMigration";
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
  ClinicalAuditCampaign,
  ClinicalAuditSubmission,
  ClinicalAuditTemplate,
  PrePostTest,
  PrePostTestResult,
  TeachingSession,
} from "@/domain/clinicalAudit";
import type {
  DpcAttendance,
  DpcAuditEntry,
  DpcAuditGrid,
  DpcProgrammeSetup,
  DpcQuizQuestion,
  DpcRound,
  DpcSequence,
  DpcTest,
  DpcTestAttempt,
} from "@/domain/dpc";

import type {
  AuditEvent,
  Cohort,
  CohortId,
  CurriculumVersion,
  CurriculumVersionId,
  Enrollment,
  EnrollmentId,
  Evidence,
  LearningResource,
  MasteryLevel,
  Outcome,
  OutcomeNature,
  OutcomeRelation,
  Person,
  PersonId,
  Placement,
  PlacementAssignment,
  Program,
  ProgramId,
  RoleAssignment,
} from "@/domain/types";
import type { GrantableRole, GrantScopeKind } from "@/domain/accessGrant";
import type {
  CreatePendingPersonInput,
  PendingPerson,
  PendingPersonId,
  SendInvitationOutcome,
} from "@/domain/peopleStaging";

/** Saisie du port `createCohort` : champs plats, prêts pour le RPC serveur. */
export interface CreateCohortInput {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  readonly label: string;
  readonly academicYear: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

export interface ProgramRepository {
  listPrograms(): Promise<readonly Program[]>;
  getProgram(id: ProgramId): Promise<Program | undefined>;
  listCurriculumVersions(programId: ProgramId): Promise<readonly CurriculumVersion[]>;
  listCohorts(programId?: ProgramId): Promise<readonly Cohort[]>;
  getCohort(id: CohortId): Promise<Cohort | undefined>;
  /** Crée une classe (promotion). Autorisation et unicité vérifiées côté serveur. */
  createCohort(input: CreateCohortInput): Promise<Cohort>;
}

export interface PeopleRepository {
  getPerson(id: PersonId): Promise<Person | undefined>;
  listEnrollments(personId: PersonId): Promise<readonly Enrollment[]>;
  listRoleAssignments(personId: PersonId): Promise<readonly RoleAssignment[]>;
}

/**
 * Sas de pré-inscription réel (D94) : personnes créées par un membre du
 * programme mais pas encore connectées. Distinct de PeopleRepository, qui ne
 * porte que sur des comptes déjà activés (profiles).
 */
export interface PeopleStagingRepository {
  listPendingPeople(programId: ProgramId): Promise<readonly PendingPerson[]>;
  createPendingPerson(input: CreatePendingPersonInput): Promise<PendingPerson>;
  /** Déclenche l'envoi réel des invitations (Edge Function invite-person). */
  sendInvitations(personIds: readonly PendingPersonId[]): Promise<readonly SendInvitationOutcome[]>;
}

/** Saisie du port `createOutcome` : champs plats, prêts pour le RPC serveur. */
export interface CreateOutcomeInput {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly nature: OutcomeNature;
  readonly domain: string;
  readonly targetMastery: MasteryLevel;
}

/**
 * Référentiel des compétences et connaissances : un seul objet `Outcome`,
 * distingué par `nature`. Liste + création uniquement — le suivi
 * d'acquisition (Evidence) et les relations entre outcomes restent hors
 * périmètre de ce port (chantier séparé).
 */
export interface OutcomeRepository {
  listOutcomes(programId: ProgramId): Promise<readonly Outcome[]>;
  listOutcomeRelations(programId: ProgramId): Promise<readonly OutcomeRelation[]>;
  /** Crée une compétence ou une connaissance. Autorisation vérifiée côté serveur. */
  createOutcome(input: CreateOutcomeInput): Promise<Outcome>;
}

export interface EvidenceRepository {
  listEvidenceForEnrollment(enrollmentId: EnrollmentId): Promise<readonly Evidence[]>;
}

/** Saisie du port `createAssessmentModality` : champs plats, prêts pour le RPC serveur. */
export interface CreateAssessmentModalityInput {
  readonly programId: ProgramId;
  readonly name: string;
  readonly mode: AssessmentMode;
  readonly subtype: AssessmentSubtype;
  readonly usage: AssessmentUsage;
  readonly notes: string;
}

/**
 * Référentiel des modalités d'évaluation d'un programme : liste + création
 * uniquement. Les sessions par cohorte et l'import de résultats restent hors
 * périmètre (chantier séparé).
 */
export interface AssessmentRepository {
  listAssessmentModalities(programId: ProgramId): Promise<readonly AssessmentModality[]>;
  createAssessmentModality(input: CreateAssessmentModalityInput): Promise<AssessmentModality>;
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

/** Saisie du port `grantRoleAssignment` : champs plats, prêts pour le RPC serveur. */
export interface GrantRoleAssignmentInput {
  readonly personId: PersonId;
  readonly role: GrantableRole;
  readonly scopeKind: GrantScopeKind;
  /** Programme pour une portée « program », promotion ou terrain sinon. */
  readonly scopeId: string;
  readonly programId: ProgramId;
  /** Motif obligatoire : journalisé côté serveur (audit trail atomique). */
  readonly justification: string;
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
  /** Attribue un rôle contextualisé à une personne (motif obligatoire, tracé côté serveur). */
  grantRoleAssignment(input: GrantRoleAssignmentInput): Promise<RoleAssignment>;
}

export interface LearningResourceRepository {
  listResources(programId: ProgramId): Promise<readonly LearningResource[]>;
}

/**
 * Médiathèque pédagogique : MÉTADONNÉES uniquement.
 * Aucun binaire n'est lu, écrit ou transmis dans cette itération.
 */
export interface MediaLibraryRepository {
  listMedia(programId: ProgramId): Promise<readonly MediaResource[]>;
  getMedia(id: string): Promise<MediaResource | undefined>;
  /**
   * Vue apprenant des PowerPoint sonorisés convertis : DTO dérivés uniquement,
   * jamais le paquet PPTX source.
   */
  listLearnerNarratedDecks(programId: ProgramId): Promise<readonly LearnerNarratedDeck[]>;
}

/**
 * Exploitation IA des contenus : profils, politique par programme et DTO
 * apprenant. Aucun index ni appel IA n'existe dans cette itération.
 */
export interface ContentAiRepository {
  listProfiles(programId: ProgramId): Promise<readonly ContentAiProfile[]>;
  getProfile(mediaId: string): Promise<ContentAiProfile | undefined>;
  getPolicy(programId: ProgramId): Promise<ProgramAiPolicy | undefined>;
  /** Supports exploitables par l'apprenant : contenu validé et prêt uniquement. */
  listLearnerAiResources(programId: ProgramId): Promise<readonly LearnerAiResource[]>;
}

/**
 * Comptabilité des crédits IA par enseignement.
 * En production, seules des écritures serveur alimentent ce dépôt.
 */
export interface AiCreditsRepository {
  listEntries(programId: ProgramId): Promise<readonly AiCreditEntry[]>;
  getBudget(programId: ProgramId): Promise<AiCreditBudget | undefined>;
}

/** Préparation documentaire de la migration ECOS (aucun couplage runtime). */
export interface EcosMigrationRepository {
  listInventory(): Promise<readonly LegacyModuleInventoryItem[]>;
  listScenarios(programId: ProgramId): Promise<readonly EcosScenarioMock[]>;
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

/**
 * Module OPTIONNEL (audits de pratique, pré/post-tests, séances).
 * Un programme sans `config.auditsEnabled` ne consomme jamais ce dépôt.
 */
export interface ClinicalAuditRepository {
  listTemplates(programId: ProgramId): Promise<readonly ClinicalAuditTemplate[]>;
  listCampaigns(programId: ProgramId): Promise<readonly ClinicalAuditCampaign[]>;
  /** Toutes les soumissions d'un programme (administration / enseignant). */
  listSubmissions(programId: ProgramId): Promise<readonly ClinicalAuditSubmission[]>;
  /** Soumissions d'une inscription : périmètre strict de l'apprenant. */
  listSubmissionsForEnrollment(
    enrollmentId: EnrollmentId,
  ): Promise<readonly ClinicalAuditSubmission[]>;
  listTests(programId: ProgramId): Promise<readonly PrePostTest[]>;
  listTestResults(programId: ProgramId): Promise<readonly PrePostTestResult[]>;
  listSessions(programId: ProgramId): Promise<readonly TeachingSession[]>;
}

/**
 * Module DPC générique (programme intégré : audit 1 → formation → audit 2).
 * Un programme sans `config.dpcEnabled` ne consomme jamais ce dépôt.
 */
export interface DpcRepository {
  listGrids(programId: ProgramId): Promise<readonly DpcAuditGrid[]>;
  getSetup(programId: ProgramId): Promise<DpcProgrammeSetup | undefined>;
  listRounds(programId: ProgramId): Promise<readonly DpcRound[]>;
  /** Toutes les saisies du programme (administration / enseignant). */
  listEntries(programId: ProgramId): Promise<readonly DpcAuditEntry[]>;
  /** Saisies d'une inscription : périmètre strict du participant. */
  listEntriesForEnrollment(enrollmentId: EnrollmentId): Promise<readonly DpcAuditEntry[]>;
  listSequences(programId: ProgramId): Promise<readonly DpcSequence[]>;
  listQuestions(programId: ProgramId): Promise<readonly DpcQuizQuestion[]>;
  listTests(programId: ProgramId): Promise<readonly DpcTest[]>;
  listTestAttempts(programId: ProgramId): Promise<readonly DpcTestAttempt[]>;
  listAttendance(programId: ProgramId): Promise<readonly DpcAttendance[]>;
  listSessions(programId: ProgramId): Promise<readonly TeachingSession[]>;
}

export interface AuditRepository {
  listRecentEvents(limit?: number): Promise<readonly AuditEvent[]>;
}

/** Façade unique injectée dans l'application. */
export interface DataAccess {
  readonly programs: ProgramRepository;
  readonly people: PeopleRepository;
  readonly peopleStaging: PeopleStagingRepository;
  readonly outcomes: OutcomeRepository;
  readonly evidence: EvidenceRepository;
  readonly assessments: AssessmentRepository;
  readonly placements: PlacementRepository;
  readonly resources: LearningResourceRepository;
  readonly media: MediaLibraryRepository;
  readonly contentAi: ContentAiRepository;
  readonly aiCredits: AiCreditsRepository;
  readonly ecos: EcosMigrationRepository;
  readonly plan: AcquisitionPlanRepository;
  readonly stageLogs: StageLogRepository;
  readonly supervision: SupervisionRepository;
  readonly administration: AdministrationRepository;
  readonly statistics: StatisticsRepository;
  readonly clinicalAudits: ClinicalAuditRepository;
  readonly dpc: DpcRepository;
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
