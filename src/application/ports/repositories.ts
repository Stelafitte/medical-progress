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
  LearningResourceId,
  MasteryLevel,
  Outcome,
  OutcomeId,
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
  /**
   * Enregistre l'état en cours de conception du programme (« Concepteur de
   * programme »), avant finalisation et passage au pilotage. `draft` est un
   * objet libre sérialisable en JSON ; `null` efface le brouillon.
   */
  saveProgramDesignDraft(programId: ProgramId, draft: Record<string, unknown> | null): Promise<void>;
  /**
   * Analyse IA (Edge Function `analyze-program-objectives`) d'un texte
   * d'objectifs pédagogiques : propose un référentiel candidat (connaissances
   * & compétences + modalités d'évaluation). Ne crée RIEN — la validation et
   * l'édition par le concepteur, puis la création effective, passent par
   * `OutcomeRepository.createOutcome` / `AssessmentRepository.createAssessmentModality`,
   * exactement comme un ajout manuel.
   */
  analyzeObjectivesForReferential(
    programId: ProgramId,
    text: string,
  ): Promise<ProgramAiAnalysisResult>;
}

/** Un item de connaissance/compétence candidat, proposé par l'analyse IA. */
export interface ProgramAiOutcomeSuggestion {
  readonly label: string;
  readonly domain: string;
  readonly description: string;
  readonly nature: OutcomeNature;
  readonly targetMastery: MasteryLevel;
  /** Passage du document source qui justifie cette proposition. */
  readonly sourceExcerpt: string;
}

/** Une modalité d'évaluation candidate, proposée par l'analyse IA. */
export interface ProgramAiAssessmentSuggestion {
  readonly name: string;
  readonly mode: AssessmentMode;
  readonly subtype: AssessmentSubtype;
  readonly usage: AssessmentUsage;
  readonly notes: string;
}

export interface ProgramAiAnalysisResult {
  readonly knowledgeItems: readonly ProgramAiOutcomeSuggestion[];
  readonly assessmentModalities: readonly ProgramAiAssessmentSuggestion[];
  /** true si le texte fourni dépassait la limite analysée (tronqué côté serveur). */
  readonly truncated: boolean;
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
  /**
   * Retire une compétence/connaissance du programme sans la supprimer
   * (archivage réversible) : elle disparaît des listes actives mais reste
   * récupérable. Autorisation vérifiée côté serveur.
   */
  archiveOutcome(outcomeId: OutcomeId): Promise<void>;
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
  /**
   * Retire une modalité d'évaluation du programme sans la supprimer
   * (archivage réversible). Autorisation vérifiée côté serveur.
   */
  archiveAssessmentModality(assessmentModalityId: string): Promise<void>;
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

/** Visibilité d'un support, alignée sur l'enum Postgres `resource_visibility`. */
export type ResourceVisibility = "staff_only" | "cohort" | "program";

/**
 * Saisie du port `createResource` : champs plats, prêts pour le RPC serveur
 * `create_learning_resource`. Publication immédiate en v1 (pas de file
 * d'attente de relecture pédagogique).
 */
export interface CreateLearningResourceInput {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  readonly title: string;
  readonly description: string;
  readonly format: LearningResource["format"];
  readonly visibility: ResourceVisibility;
  /** Support par lien (kind « link », ou vidéo hébergée ailleurs). */
  readonly externalUrl?: string;
  readonly outcomeIds: readonly OutcomeId[];
}

/** Saisie du port `requestUploadUrl` : délègue à l'Edge Function `create-resource-upload-url`. */
export interface RequestUploadUrlInput {
  readonly programId: ProgramId;
  readonly bucket: "course-sources" | "pptx-sources" | "course-artifacts";
  readonly fileName: string;
}

export interface UploadUrlResult {
  readonly bucket: string;
  readonly objectPath: string;
  readonly signedUrl: string;
  readonly token: string;
}

/** Aligné sur l'enum Postgres `asset_kind`. */
export type ResourceAssetKind =
  | "source"
  | "slide_image"
  | "slide_audio"
  | "transcript"
  | "manifest"
  | "thumbnail"
  | "fallback_video"
  /** Clip d'une diapositive, rendu par PowerPoint avec ses animations. */
  | "slide_video";

/** Saisie du port `registerAsset` : enregistre en base un fichier déjà téléversé via une URL signée. */
export interface RegisterResourceAssetInput {
  readonly resourceId: LearningResourceId;
  readonly kind: ResourceAssetKind;
  readonly bucketName: string;
  readonly objectPath: string;
  readonly mediaType: string;
  readonly originalFileName: string;
  readonly byteSize: number;
}

export interface RegisteredResourceAsset {
  readonly id: string;
  readonly resourceId: LearningResourceId;
  readonly kind: ResourceAssetKind;
  readonly bucketName: string;
  readonly objectPath: string;
}

export interface NarratedDeckSlideInput {
  readonly slideIndex: number;
  readonly title: string;
  readonly durationMs: number;
  /** Diapositive texte seul possible : aucune image intégrée dans le PPTX source. */
  readonly imageAssetId?: string;
  readonly audioAssetId?: string;
  /**
   * Clip de la diapositive. Présent dès qu'elle porte une animation ou une
   * vidéo incluse : l'image fixe seule perdrait l'un et l'autre.
   */
  readonly videoAssetId?: string;
  /** Texte affiché sur la diapositive. La narration, elle, va dans `transcript`. */
  readonly slideText?: string;
  readonly transcript?: string;
  readonly transcriptLanguage?: string;
}

export interface NarratedDeckChapterInput {
  readonly chapterIndex: number;
  readonly title: string;
  readonly startsAtSlide: number;
}

/**
 * Saisie du port `publishNarratedDeck` : publication complète d'un
 * diaporama sonorisé (diapositives + chapitres), à partir du fichier
 * source déjà enregistré via `registerAsset`.
 */
export interface PublishNarratedDeckInput {
  readonly resourceId: LearningResourceId;
  /** Le .pptx d'origine, s'il a ete joint. Un paquet converti n'en contient pas. */
  readonly sourceAssetId: string | null;
  readonly slideCount: number;
  readonly durationMs: number;
  readonly transcriptAvailable: boolean;
  readonly slides: readonly NarratedDeckSlideInput[];
  readonly chapters: readonly NarratedDeckChapterInput[];
}

export interface PublishedNarratedDeck {
  readonly id: string;
  readonly resourceId: LearningResourceId;
  readonly version: number;
  readonly status: string;
}

/** Une diapositive prête à être jouée : liens signés, temporaires, sur le stockage privé. */
export interface NarratedDeckPlaybackSlide {
  readonly index: number;
  readonly title: string;
  readonly durationMs: number;
  /** Clip rendu par PowerPoint, narration comprise. Absent pour une diapositive statique. */
  readonly videoUrl?: string;
  /** Affiche avant lecture, et repli si le clip ne peut pas être lu. */
  readonly imageUrl?: string;
  readonly transcript?: string;
}

export interface NarratedDeckPlayback {
  readonly title: string;
  readonly slides: readonly NarratedDeckPlaybackSlide[];
  readonly chapters: readonly {
    readonly chapterIndex: number;
    readonly title: string;
    readonly startsAtSlide: number;
  }[];
}

/** Avancement de la transcription d'un cours, une diapositive par appel. */
export interface TranscriptionProgress {
  /** Diapositive qui vient d'être transcrite, null s'il n'y avait plus rien à faire. */
  readonly slideIndex: number | null;
  readonly characters: number;
  readonly remaining: number;
  readonly done: boolean;
}

export interface LearningResourceRepository {
  listResources(programId: ProgramId): Promise<readonly LearningResource[]>;
  /** Crée un support (publication immédiate en v1). Autorisation vérifiée côté serveur. */
  createResource(input: CreateLearningResourceInput): Promise<LearningResource>;
  /** Demande une URL d'upload signée pour un fichier source (Edge Function `create-resource-upload-url`). */
  requestUploadUrl(input: RequestUploadUrlInput): Promise<UploadUrlResult>;
  /** Téléverse réellement un fichier vers l'URL signée obtenue via `requestUploadUrl`. */
  uploadResourceFile(upload: UploadUrlResult, file: File): Promise<void>;
  /** Enregistre en base un fichier déjà téléversé via une URL signée. */
  registerAsset(input: RegisterResourceAssetInput): Promise<RegisteredResourceAsset>;
  /** Publie un diaporama sonorisé complet (diapositives + chapitres). */
  publishNarratedDeck(input: PublishNarratedDeckInput): Promise<PublishedNarratedDeck>;
  /**
   * Transcrit la narration de la prochaine diapositive qui n'en a pas encore.
   * Une diapositive par appel : un cours entier dépasserait le temps
   * d'exécution du service, et un échec ferait tout reperdre.
   */
  transcribeNextSlide(resourceId: LearningResourceId): Promise<TranscriptionProgress>;
  /**
   * Diaporama publié d'un support, prêt à jouer. Les liens sont signés et
   * expirent : rien du stockage privé n'est exposé durablement.
   */
  getNarratedDeckPlayback(
    resourceId: LearningResourceId,
  ): Promise<NarratedDeckPlayback | undefined>;
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
