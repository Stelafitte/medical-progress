/**
 * Contrats d'accès aux données (ports).
 *
 * Toute implémentation ultérieure (base de données provisionnée, import
 * sélectif depuis un système historique) devra respecter ces interfaces sans
 * modifier l'UI ni la logique métier.
 */
import type { PlanMilestone, PlanMilestoneId, PlanScheduleEntry } from "@/domain/acquisitionPlan";
import type { OutcomeSelfReport } from "@/domain/passport";
import type { CohortOpeningReport } from "@/domain/cohortOpening";
import type {
  MilestoneTemplate,
  MilestoneTemplateApplyMode,
  MilestoneTemplateApplyReport,
  MilestoneTemplateId,
} from "@/domain/milestoneTemplate";
import type {
  AssessmentMode,
  AssessmentModality,
  AssessmentSubtype,
  AssessmentUsage,
} from "@/domain/assessmentModality";
import type { LearnerNarratedDeck, MediaResource } from "@/domain/mediaLibrary";
import type { ContentAiProfile, LearnerAiResource, ProgramAiPolicy } from "@/domain/contentAi";
import type { AiCreditBudget, AiCreditEntry } from "@/domain/aiCredits";
import type { AiFallbackPolicy, ProgramAiSettings, ProgramAiUsage } from "@/domain/programAi";
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
import type { StageLog, StageLogId, StageLogTemplate } from "@/domain/stageLog";
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
  KnowledgeRank,
  MasteryLevel,
  Outcome,
  OutcomeTheme,
  OutcomeThemeId,
  OutcomeId,
  OutcomeNature,
  OutcomeRelation,
  Person,
  PersonId,
  Placement,
  PlacementAssignment,
  PlacementId,
  Program,
  ProgramId,
  RoleAssignment,
  SupervisionGroup,
  SupervisionGroupId,
} from "@/domain/types";
import type { GrantableRole, GrantScopeKind } from "@/domain/accessGrant";
import type {
  CreatePendingPersonInput,
  PendingPerson,
  PendingPersonId,
  SendInvitationOutcome,
  UpdatePendingPersonInput,
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

/**
 * Saisie du port `updateCohort`. `programId` et `curriculumVersionId` en sont
 * volontairement ABSENTS : déplacer une classe d'un programme à l'autre
 * laisserait ses inscriptions, ses jalons et ses carnets rattachés à l'ancien.
 * Ce n'est pas une modification, c'est une migration de données.
 */
export interface UpdateCohortInput {
  readonly cohortId: CohortId;
  readonly label: string;
  readonly academicYear: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

export interface ProgramRepository {
  listPrograms(): Promise<readonly Program[]>;
  getProgram(id: ProgramId): Promise<Program | undefined>;
  listCurriculumVersions(programId: ProgramId): Promise<readonly CurriculumVersion[]>;
  /**
   * Les classes ACTIVES du programme. `includeArchived` les rend toutes, pour
   * le seul écran qui propose de désarchiver — partout ailleurs, une classe
   * archivée doit être invisible, comme un acquis archivé.
   */
  listCohorts(
    programId?: ProgramId,
    options?: { readonly includeArchived?: boolean },
  ): Promise<readonly Cohort[]>;
  getCohort(id: CohortId): Promise<Cohort | undefined>;
  /** Crée une classe (promotion). Autorisation et unicité vérifiées côté serveur. */
  createCohort(input: CreateCohortInput): Promise<Cohort>;
  /** Reprend une classe existante : nom, année, dates. Droits vérifiés côté serveur. */
  updateCohort(input: UpdateCohortInput): Promise<Cohort>;
  /**
   * Ouvre une promotion : elle cesse d'être un brouillon, et son modèle de
   * curriculum se fige.
   *
   * `dryRun` rend le MÊME rapport sans rien écrire — c'est le serveur qui
   * vérifie (rétroplanning non vide, aucun jalon après la fin du stage), et
   * c'est lui qui refuse. L'écran ne fait que le dire plus tôt.
   */
  openCohort(
    cohortId: CohortId,
    options?: { readonly dryRun?: boolean },
  ): Promise<CohortOpeningReport>;
  /**
   * Retire le sceau. Ne rend rien : la fonction SQL rend la classe sans son
   * effectif, et un objet qui prétendrait le connaître mentirait.
   *
   * Ne redescend PAS la version de curriculum : elle sert peut-être d'autres
   * promotions, qu'on rouvrirait sous leurs pieds.
   */
  revertCohortToDraft(cohortId: CohortId): Promise<void>;
  /**
   * Archive ou désarchive une classe. Réversible et sans perte — la suppression
   * n'existe pas : cinq tables pointent vers `cohorts`.
   */
  setCohortArchived(cohortId: CohortId, archived: boolean): Promise<Cohort>;
  /**
   * Enregistre l'état en cours de conception du programme (« Concepteur de
   * programme »), avant finalisation et passage au pilotage. `draft` est un
   * objet libre sérialisable en JSON ; `null` efface le brouillon.
   */
  saveProgramDesignDraft(
    programId: ProgramId,
    draft: Record<string, unknown> | null,
  ): Promise<void>;
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
  /**
   * Corrige SA PROPRE fiche. Aucun identifiant en argument : c'est la session
   * qui designe la personne, jamais l'appelant — sinon l'ecran deviendrait le
   * gardien du droit, alors que la policy `profiles_update_self` l'est deja.
   *
   * Constat du 03/09 : une personne activee n'avait AUCUN moyen de corriger son
   * nom. Ni elle-meme (rien dans ce port), ni son gestionnaire, qui ne peut
   * editer que le sas `people` — sans effet une fois la personne activee, et
   * sans que rien ne le dise. Stef s'y est fait prendre.
   */
  updateOwnProfile(input: { readonly fullName: string }): Promise<Person>;
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
  /** Corrige une ligne du sas : nom, adresse, identifiant, promotion visée. */
  updatePendingPerson(input: UpdatePendingPersonInput): Promise<PendingPerson>;
  /**
   * Retire une personne de la liste, ou l'y remet.
   *
   * Retirer n'EFFACE pas : la ligne passe en « annulée » et se restaure. Une
   * suppression ferait disparaître qui avait été inscrit et par qui, et la
   * base ne l'accorde d'ailleurs pas (aucun `delete` sur `people`).
   */
  setPendingPersonCancelled(personId: PendingPersonId, cancelled: boolean): Promise<PendingPerson>;
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
  /** Rang R2C. La base refuse un rang sur une compétence. */
  readonly knowledgeRank?: KnowledgeRank;
}

/**
 * Révision d'un acquis existant. Le CODE et la NATURE en sont absents et
 * doivent le rester : le code est l'identité de la ligne (l'unicité et l'import
 * rejouable en dépendent), et changer la nature laisserait orphelines les
 * déclarations d'étudiants et les validations par un senior déjà posées dessus.
 *
 * Champ absent = inchangé. On ne peut donc pas VIDER un rang par cette voie ;
 * le jour où il le faudra, ajouter un paramètre explicite plutôt que de donner
 * un second sens à l'absence.
 */
export interface UpdateOutcomeInput {
  readonly outcomeId: OutcomeId;
  readonly label?: string;
  readonly description?: string;
  readonly targetMastery?: MasteryLevel;
  readonly knowledgeRank?: KnowledgeRank;
}

/**
 * Référentiel des compétences et connaissances : un seul objet `Outcome`,
 * distingué par `nature`. Liste + création uniquement — le suivi
 * d'acquisition (Evidence) et les relations entre outcomes restent hors
 * périmètre de ce port (chantier séparé).
 */
export interface OutcomeRepository {
  listOutcomes(programId: ProgramId): Promise<readonly Outcome[]>;
  /**
   * TOUS les codes déjà pris dans ce programme, archivés compris.
   *
   * `listOutcomes` masque les acquis archivés, mais la contrainte
   * `unique (program_id, code)` ne les oublie pas : un code archivé reste
   * réservé. Générer un code à partir des seules listes visibles produit donc
   * des collisions que rien à l'écran ne laissait prévoir.
   */
  listTakenOutcomeCodes(programId: ProgramId): Promise<readonly string[]>;
  listOutcomeRelations(programId: ProgramId): Promise<readonly OutcomeRelation[]>;
  /** Crée une compétence ou une connaissance. Autorisation vérifiée côté serveur. */
  createOutcome(input: CreateOutcomeInput): Promise<Outcome>;
  /**
   * Révise un acquis : intitulé, description, niveau attendu, rang R2C. Ni le
   * code ni la nature — voir `UpdateOutcomeInput`. Droits vérifiés côté serveur.
   */
  updateOutcome(input: UpdateOutcomeInput): Promise<Outcome>;
  /**
   * Retire une compétence/connaissance du programme sans la supprimer
   * (archivage réversible) : elle disparaît des listes actives mais reste
   * récupérable. Autorisation vérifiée côté serveur.
   */
  archiveOutcome(outcomeId: OutcomeId): Promise<void>;
  /**
   * Retient (ou retire du parcours) un lot d'acquis, sans les archiver : ils
   * restent visibles et modifiables dans le referentiel du programme.
   * Un seul appel pour tout le lot, pour que l'ecran et la base ne puissent
   * pas diverger sur une bascule partielle.
   */
  setOutcomesRetained(outcomeIds: readonly OutcomeId[], retained: boolean): Promise<void>;

  /* ---------------------------------------------------------------- */
  /* Thèmes : le chapitre au-dessus des acquis                        */
  /* ---------------------------------------------------------------- */

  listOutcomeThemes(programId: ProgramId): Promise<readonly OutcomeTheme[]>;
  /** Crée un chapitre. Un thème n'est pas un acquis : ni nature, ni niveau. */
  createOutcomeTheme(input: CreateOutcomeThemeInput): Promise<OutcomeTheme>;
  /**
   * Range un lot d'acquis sous un thème, dans l'ordre donné — `undefined` les
   * en retire sans les archiver. Un seul appel pour tout le lot : l'écran
   * enregistre l'état complet d'une liste, et une bascule partielle laisserait
   * l'écran et la base en désaccord.
   */
  setOutcomesTheme(
    outcomeIds: readonly OutcomeId[],
    themeId: OutcomeThemeId | undefined,
  ): Promise<void>;
}

/** Saisie du port `createOutcomeTheme` : champs plats, prêts pour le RPC. */
export interface CreateOutcomeThemeInput {
  readonly programId: ProgramId;
  readonly label: string;
  readonly description?: string;
  readonly position?: number;
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

  /* ---------------------------------------------------------------- */
  /* Écriture — passe par les fonctions serveur de la migration stage  */
  /* ---------------------------------------------------------------- */

  /** Crée un terrain de stage (RPC `create_placement`). */
  createPlacement(input: CreatePlacementInput): Promise<Placement>;

  /**
   * Groupes d'encadrement du programme, membres et encadrants inclus.
   * Générique : vaut pour toute cohorte de tout programme.
   */
  listSupervisionGroups(programId: ProgramId): Promise<readonly SupervisionGroup[]>;

  /** Crée un groupe d'encadrement pour une cohorte sur un terrain donné. */
  createSupervisionGroup(input: CreateSupervisionGroupInput): Promise<SupervisionGroup>;

  /** REMPLACE la liste des membres du groupe. Idempotent. */
  setSupervisionGroupMembers(
    groupId: SupervisionGroupId,
    enrollmentIds: readonly EnrollmentId[],
  ): Promise<void>;

  /** REMPLACE la liste des encadrants du groupe. Idempotent. */
  setSupervisionGroupSupervisors(
    groupId: SupervisionGroupId,
    personIds: readonly PersonId[],
  ): Promise<void>;
}

export interface CreatePlacementInput {
  readonly programId: ProgramId;
  readonly name: string;
  readonly site: string;
  readonly department: string;
  readonly capacity: number;
}

export interface CreateSupervisionGroupInput {
  readonly cohortId: CohortId;
  readonly placementId: PlacementId;
  readonly label: string;
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
  | "slide_video"
  /** Figure d'un document importé (ECG, schéma, coupe), déposée à côté de lui. */
  | "illustration";

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

/** Un passage retrouvé dans le texte intégral d'un support. */
export interface ResourceTextMatch {
  readonly resourceId: LearningResourceId;
  readonly resourceTitle: string;
  readonly sourcePath: string;
  readonly segmentIndex: number;
  readonly content: string;
  readonly rank: number;
}

/** Un segment du texte conservé d'un support, dans son ordre d'origine. */
export interface ResourceTextSegment {
  readonly sourcePath: string;
  readonly segmentIndex: number;
  readonly content: string;
}

export interface LearningResourceRepository {
  listResources(programId: ProgramId): Promise<readonly LearningResource[]>;
  /**
   * Lien de LECTURE d'un support deposé en seau privé — une vidéo, un PDF.
   * `null` quand le support n'a pas de fichier source, ou que le lien ne peut
   * pas etre produit.
   *
   * POURQUOI PAS UNE URL DANS `LearningResource`. Un lien signé expire (une
   * heure ici). Le porter dans l'objet du domaine obligerait à le regénérer à
   * chaque lecture de la liste, pour les 26 supports, alors qu'on n'en regarde
   * qu'un — et donnerait à l'écran un lien déjà périmé s'il l'affiche plus
   * tard. Il se demande donc au moment de lire, et seulement là.
   *
   * Constat du 03/09 : les 4 vidéos étaient visibles et INJOUABLES. Aucune
   * balise `video` nulle part, aucun appel à `signAssetUrls`, alors que la
   * fonction existait depuis le 30/08.
   */
  signResourceMediaUrl(resourceId: LearningResourceId): Promise<string | null>;
  /** Crée un support (publication immédiate en v1). Autorisation vérifiée côté serveur. */
  createResource(input: CreateLearningResourceInput): Promise<LearningResource>;
  /**
   * Rattache un support à des acquis DÉJÀ existants, et rend le nombre de liens
   * réellement ajoutés.
   *
   * `createResource` ne sait poser des liens qu'à la création. Rejouer un corpus
   * sur un programme dont le référentiel existe déjà n'avait donc aucun moyen de
   * dire « ce chapitre traite de ces connaissances-là » sans les recréer en
   * double.
   *
   * **Elle ajoute, elle ne retire jamais** : un support peut couvrir deux
   * référentiels qui décrivent la même matière sous deux découpages. Remplacer
   * le lot entier serait une autre opération, avec un autre nom.
   */
  linkResourceOutcomes(
    resourceId: LearningResource["id"],
    outcomeIds: readonly OutcomeId[],
  ): Promise<number>;
  /** Demande une URL d'upload signée pour un fichier source (Edge Function `create-resource-upload-url`). */
  requestUploadUrl(input: RequestUploadUrlInput): Promise<UploadUrlResult>;
  /** Téléverse réellement un fichier vers l'URL signée obtenue via `requestUploadUrl`. */
  uploadResourceFile(upload: UploadUrlResult, file: File): Promise<void>;
  /** Enregistre en base un fichier déjà téléversé via une URL signée. */
  registerAsset(input: RegisterResourceAssetInput): Promise<RegisteredResourceAsset>;
  /**
   * Conserve le TEXTE INTÉGRAL d'un document source, découpé en segments.
   *
   * C'est la matière des usages qui viennent après l'import : l'apprenant qui
   * interroge un cours, l'interrogation automatique, la production de QCM.
   * Ces usages lisent des passages — d'où le découpage, et non un bloc.
   *
   * Remplace ce qui existait pour ce `sourcePath` : un réimport doit donner le
   * même état qu'un premier import.
   */
  storeResourceText(
    resourceId: LearningResourceId,
    sourcePath: string,
    segments: readonly string[],
  ): Promise<number>;
  /**
   * Passages du programme correspondant à une recherche. La normalisation
   * (accents, racines) vit côté serveur, pour qu'elle soit exactement celle de
   * l'index — sinon la recherche rendrait moins que ce qu'elle contient, sans
   * erreur, ce qui est le pire des cas.
   */
  searchResourceTexts(
    programId: ProgramId,
    query: string,
    limit?: number,
  ): Promise<readonly ResourceTextMatch[]>;
  /**
   * Le texte conservé d'UN support, dans l'ordre.
   *
   * `searchResourceTexts` cherche à travers tout le programme et rend des
   * extraits classés par pertinence ; ce port-ci rend le contenu d'un seul
   * support, du premier segment au dernier. Sans lui, on peut écrire un texte
   * et le chercher, mais pas le relire — c'est-à-dire pas vérifier qu'il est
   * correct, ce qui est la première chose qu'on veut faire après un import.
   */
  listResourceTexts(resourceId: LearningResourceId): Promise<readonly ResourceTextSegment[]>;
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
/**
 * Reglage de l'assistant IA d'un programme — LECTURE ET ECRITURE REELLES (09/09).
 *
 * DEPOT A PART, et non des methodes ajoutees a `contentAi` ou `aiCredits` : ces
 * deux-la decrivent une maquette (paliers de modele, enveloppes par periode,
 * mode vocal) dont RIEN n'existe en base. Tout ce qui suit correspond a une
 * colonne ou a une fonction reelle. Melanger les deux ferait un depot dont on
 * ne saurait plus, methode par methode, ce qui est vrai.
 */
export interface ProgramAiRepository {
  /**
   * L'absence de ligne vaut REFUS, pas defaut : rendre les valeurs de
   * `defaultProgramAiSettings` (assistant ferme) plutot que `undefined`, pour
   * qu'aucun ecran n'ait a decider ce que signifie « pas de reglage ».
   */
  getSettings(programId: ProgramId): Promise<ProgramAiSettings>;
  /**
   * Rend le reglage TEL QU'IL A ETE ECRIT, pas celui envoye : la base peut
   * refuser (ouverture sans moteur) ou completer. L'ecran affiche le retour.
   */
  saveSettings(input: {
    programId: ProgramId;
    enabled: boolean;
    monthlyCreditCap: number;
    fallbackPolicy: AiFallbackPolicy;
  }): Promise<ProgramAiSettings>;
  /** Consommation du mois en cours, agregee. Aucun contenu de message n'en sort. */
  getUsageThisMonth(programId: ProgramId): Promise<ProgramAiUsage>;
}

export interface AiCreditsRepository {
  listEntries(programId: ProgramId): Promise<readonly AiCreditEntry[]>;
  getBudget(programId: ProgramId): Promise<AiCreditBudget | undefined>;
}

/** Préparation documentaire de la migration ECOS (aucun couplage runtime). */
export interface EcosMigrationRepository {
  listInventory(): Promise<readonly LegacyModuleInventoryItem[]>;
  listScenarios(programId: ProgramId): Promise<readonly EcosScenarioMock[]>;
}

/**
 * Entrée d'un jalon. `weekOffsetEnd` absent = jalon ponctuel.
 *
 * `outcomeIds` n'est PAS ici : la composition d'un jalon se pose en un appel
 * distinct (`setMilestoneOutcomes`), pour la même raison que
 * `setOutcomesRetained` — l'écran enregistre l'état complet d'une liste, et une
 * bascule partielle laisserait l'écran et la base en désaccord.
 */
export interface CreatePlanMilestoneInput {
  readonly cohortId: CohortId;
  readonly label: string;
  readonly weekOffset: number;
  readonly weekOffsetEnd?: number;
  readonly official?: boolean;
  readonly position?: number;
}

/**
 * Reprise d'un jalon. Chaque champ absent reste inchangé — SAUF la fin de
 * période, qui a besoin d'un geste explicite pour être effacée.
 *
 * `clearWeekOffsetEnd` existe parce que `null` veut dire deux choses
 * différentes sur cette colonne : « ne touche pas » et « ce jalon redevient
 * ponctuel ». Sans ce drapeau, étaler un jalon serait un aller sans retour.
 */
export interface UpdatePlanMilestoneInput {
  readonly milestoneId: PlanMilestoneId;
  readonly label?: string;
  readonly weekOffset?: number;
  readonly weekOffsetEnd?: number;
  readonly clearWeekOffsetEnd?: boolean;
  readonly official?: boolean;
  readonly position?: number;
}

/** Relève d'un modèle. Le nom doit être neuf dans le programme. */
export interface SaveMilestoneTemplateInput {
  readonly cohortId: CohortId;
  readonly label: string;
  readonly description?: string;
}

export interface UpdateMilestoneTemplateInput {
  readonly templateId: MilestoneTemplateId;
  readonly label: string;
  readonly description: string;
}

/**
 * Pose d'un modèle.
 *
 * `mode` n'a pas de valeur par défaut ici, volontairement : « compléter » et
 * « remplacer » n'ont pas les mêmes conséquences, et un appelant qui n'y aurait
 * pas pensé doit être arrêté par le compilateur, pas servi par une supposition.
 */
export interface ApplyMilestoneTemplateInput {
  readonly templateId: MilestoneTemplateId;
  readonly cohortId: CohortId;
  readonly mode: MilestoneTemplateApplyMode;
  /** Compte sans écrire. Même rapport, aucune ligne posée. */
  readonly dryRun?: boolean;
}

export interface AcquisitionPlanRepository {
  /** Calendrier de référence des acquis d'un programme. */
  /**
   * Calendrier de reference des acquis. La promotion est INDISPENSABLE : un
   * jalon appartient a une promotion, pas a un programme — deux centuries du
   * meme programme n'ont pas le meme retroplanning. Sans elle, la seule reponse
   * honnete est une liste vide.
   */
  listPlanSchedule(
    programId: ProgramId,
    cohortId?: CohortId,
  ): Promise<readonly PlanScheduleEntry[]>;
  /**
   * Le rétroplanning d'une PROMOTION, avec la composition de chaque jalon.
   *
   * Par cohorte et non par programme : un jalon « semaine 4 » n'a de sens que
   * pour un stage donné, et le même programme porte un rétroplanning différent
   * d'une promotion à l'autre.
   */
  listMilestones(cohortId: CohortId): Promise<readonly PlanMilestone[]>;
  createMilestone(input: CreatePlanMilestoneInput): Promise<PlanMilestone>;
  updateMilestone(input: UpdatePlanMilestoneInput): Promise<PlanMilestone>;
  deleteMilestone(milestoneId: PlanMilestoneId): Promise<void>;
  /**
   * Remplace la composition d'un jalon par la liste fournie. Rend le nombre
   * d'acquis rattachés. Un acquis d'un autre programme est refusé côté serveur.
   */
  setMilestoneOutcomes(
    milestoneId: PlanMilestoneId,
    outcomeIds: readonly OutcomeId[],
  ): Promise<number>;

  /* --------------------------------------------------------------- */
  /* Modèles de rétroplanning                                         */
  /* --------------------------------------------------------------- */

  /**
   * Les modèles visibles depuis un programme.
   *
   * Par programme et non par promotion : un modèle est justement ce qui SURVIT
   * à la promotion dont il a été relevé.
   */
  listTemplates(programId: ProgramId): Promise<readonly MilestoneTemplate[]>;
  /** Relève le calendrier d'une promotion sous un nom. */
  saveTemplate(input: SaveMilestoneTemplateInput): Promise<MilestoneTemplate>;
  /**
   * Renomme un modèle. Ne rend rien : la fonction SQL rend le modèle SANS ses
   * lignes, et un objet qui prétendrait les connaître mentirait. L'appelant
   * recharge la liste, qui les porte.
   */
  updateTemplate(input: UpdateMilestoneTemplateInput): Promise<void>;
  deleteTemplate(templateId: MilestoneTemplateId): Promise<void>;
  /**
   * Pose un modèle sur une promotion, et rend le compte de ce qui s'est passé.
   *
   * `dryRun` rend LE MÊME rapport sans rien écrire. C'est le serveur qui le
   * calcule, jamais l'écran : deux calculs finiraient par diverger, et c'est
   * celui du serveur qui écrit.
   */
  applyTemplate(input: ApplyMilestoneTemplateInput): Promise<MilestoneTemplateApplyReport>;
}

export interface StageLogRepository {
  /** Modèles de carnets configurés pour un programme (toutes cohortes). */
  listTemplates(programId?: ProgramId): Promise<readonly StageLogTemplate[]>;
  /** Carnet(s) d'une inscription : accès apprenant limité à son propre carnet. */
  listLogsForEnrollment(enrollmentId: EnrollmentId): Promise<readonly StageLog[]>;
  /**
   * Carnets des étudiants que l'appelant encadre RÉELLEMENT.
   *
   * La signature d'origine prenait des identifiants d'affectation, qui
   * n'existent plus : le rattachement passe par les groupes d'encadrement
   * depuis le 31/08. Le périmètre est décidé côté serveur par
   * `supervises_enrollment()` — l'écran ne le calcule pas.
   */
  listLogsToValidate(programId: ProgramId): Promise<readonly StageLog[]>;
  /** Carnets validés puis transmis dans l'espace de l'administration du programme. */
  listLogsReceived(programId: ProgramId): Promise<readonly StageLog[]>;

  /* ---------------------------------------------------------------- */
  /* Écriture — fonctions serveur de la migration 20260831093000       */
  /* ---------------------------------------------------------------- */

  /**
   * Enregistre UNE JOURNÉE PRÉSENTE. L'existence de l'entrée EST la présence ;
   * le récit peut être vide. Rejouable : réécrit la journée si elle existe.
   */
  saveStageLogDay(input: SaveStageLogDayInput): Promise<void>;

  /** Retire une journée — donc déclare l'absence. */
  deleteStageLogDay(input: {
    readonly enrollmentId: EnrollmentId;
    readonly placementId: PlacementId;
    readonly occurredOn: string;
  }): Promise<void>;

  /** L'encadrant valide un BLOC : une semaine, deux, ou tout le stage. */
  validateStageLogBlock(input: ValidateStageLogBlockInput): Promise<void>;

  /** Ouvre les carnets de tous les membres d'un groupe. Idempotent. */
  openStageLogsForGroup(groupId: SupervisionGroupId): Promise<void>;
}

export interface SaveStageLogDayInput {
  readonly enrollmentId: EnrollmentId;
  readonly placementId: PlacementId;
  /** Jour concerné, en `AAAA-MM-JJ`. */
  readonly occurredOn: string;
  readonly narrative: string;
}

export interface ValidateStageLogBlockInput {
  readonly stageLogId: StageLogId;
  readonly coversFrom: string;
  readonly coversTo: string;
  readonly decision: "validated" | "needs_revision";
  readonly comment: string;
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
/**
 * Le passeport de l'apprenant : ce qu'il declare, et ce qu'un senior confirme.
 *
 * Depot distinct d'`EvidenceRepository` a dessein : une declaration n'est pas
 * une preuve (voir `@/domain/passport`). Les fonctions existent en base depuis
 * le 31/08 et n'etaient appelees par AUCUNE ligne de code jusqu'au 03/09.
 */
export interface PassportRepository {
  /** Declare ou revise son niveau sur un acquis DU PARCOURS. Idempotent. */
  declareOutcomeLevel(input: {
    readonly enrollmentId: EnrollmentId;
    readonly outcomeId: OutcomeId;
    readonly level: MasteryLevel;
    readonly note?: string;
  }): Promise<OutcomeSelfReport>;
  /** Les declarations d'une inscription. */
  listSelfReports(enrollmentId: EnrollmentId): Promise<readonly OutcomeSelfReport[]>;
}

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
  readonly programAi: ProgramAiRepository;
  readonly ecos: EcosMigrationRepository;
  readonly plan: AcquisitionPlanRepository;
  readonly passport: PassportRepository;
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
