/**
 * Contrats d'accès aux données (ports).
 *
 * Toute implémentation ultérieure (base de données provisionnée, import
 * sélectif depuis un système historique) devra respecter ces interfaces sans
 * modifier l'UI ni la logique métier.
 */
import type { CohortInterruption, CohortInterruptionMode } from "@/domain/cohortInterruption";
import type {
  MilestoneShift,
  PlanMilestone,
  PlanMilestoneId,
  PlanScheduleEntry,
} from "@/domain/acquisitionPlan";
import type { OutcomeSelfReport } from "@/domain/passport";
import type {
  EncadrementSource,
  EncadrementSourceId,
  EncadrementSyncPreview,
  EncadrementSyncReport,
  EncadrementSyncRun,
  DiscussionMessage,
  DiscussionThread,
  DiscussionThreadId,
  OutcomeExperienceNote,
} from "@/domain/types";
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
  AssessmentSession,
  AssessmentSubtype,
  AssessmentUsage,
  CohortAssessmentLink,
  QcmWindowConfig,
} from "@/domain/assessmentModality";
import type { LearnerNarratedDeck, MediaResource } from "@/domain/mediaLibrary";
import type { ImportMode, ImportReport, ImportedQuestion } from "@/domain/questionBankImport";
import type { ImportedCase } from "@/domain/questionCaseImport";
import type { ContentAiProfile, LearnerAiResource, ProgramAiPolicy } from "@/domain/contentAi";
import type { AiCreditBudget, AiCreditEntry } from "@/domain/aiCredits";
import type { AiFallbackPolicy, ProgramAiSettings, ProgramAiUsage } from "@/domain/programAi";
import type { CourseSection, OutcomeSections } from "@/domain/courseSections";
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
import type { LearnerMessage } from "@/domain/communication";
import type { StageLog, StageLogId, StageLogTemplate, StageLogTemplateId } from "@/domain/stageLog";
import type {
  StageAttestation,
  StageLogbookReport,
  StageTrackingMode,
} from "@/domain/stageTracking";
import type { EcosExternalRun, EcosGridItem, RecordEcosExternalRunInput } from "@/domain/ecos";
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
  MessageDeliveryId,
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
  SupervisionGroupWeek,
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
   * INTERROMPT une promotion selon l'un des trois degrés (Stef, 16/09 : « il
   * faut des boutons pour chaque situation »). Le motif est obligatoire — la
   * fonction SQL le refuse vide, et c'est voulu : une promotion arrêtée sans
   * motif, six semaines plus tard, plus personne ne sait pourquoi.
   */
  pauseCohort(input: {
    readonly cohortId: CohortId;
    readonly mode: CohortInterruptionMode;
    readonly reason: string;
    readonly expectedUntil?: string | null;
  }): Promise<void>;
  /**
   * LÈVE l'interruption en cours. `shiftWeeks` décale la fin de la promotion
   * et les jalons POSTÉRIEURS au début de la pause : c'est ce décalage qui
   * sépare une pause qui répare d'une pause qui laisse la promotion en retard.
   * Zéro est une décision comme une autre — la promotion rattrape.
   */
  resumeCohort(input: {
    readonly cohortId: CohortId;
    readonly shiftWeeks: number;
    readonly note?: string;
  }): Promise<{ readonly semainesDecalees: number; readonly jalonsDecales: number }>;
  /** L'historique des interruptions d'une promotion, la plus récente d'abord. */
  listCohortInterruptions(cohortId: CohortId): Promise<readonly CohortInterruption[]>;
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
   * Ouvre ou referme le REAMENAGEMENT DU PLAN par les apprenants du programme.
   *
   * UNE RPC ET NON UN `update`, parce que `programs` ne porte aucune policy
   * d'ecriture : la table decrit ce qu'est un programme (son code, son
   * etablissement), et l'ouvrir en ecriture pour un booleen ouvrirait le
   * reste au meme mouvement.
   *
   * REFERMER N'EFFACE RIEN. Les decalages deja poses restent et continuent de
   * s'appliquer au plan de leurs auteurs : refermer veut dire « on n'en pose
   * plus », pas « on annule ce que les etudiants ont fait ».
   */
  setLearnerPlanShifts(programId: ProgramId, enabled: boolean): Promise<Program>;
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

/** Modification en place : les mêmes champs, sur une modalité existante. */
export interface UpdateAssessmentModalityInput {
  readonly assessmentModalityId: string;
  readonly name: string;
  readonly mode: AssessmentMode;
  readonly subtype: AssessmentSubtype;
  readonly usage: AssessmentUsage;
  readonly notes: string;
}

export interface CreateAssessmentSessionInput {
  readonly assessmentModalityId: string;
  readonly cohortId: string;
  /** `AAAA-MM-JJ`. */
  readonly scheduledOn: string;
  readonly location: string;
  readonly notes: string;
  readonly closesOn?: string;
  readonly config?: QcmWindowConfig;
}

export interface SetCohortAssessmentPilotageInput {
  readonly cohortId: string;
  readonly assessmentModalityId: string;
  readonly isOpen: boolean;
  readonly questionSource: string;
  readonly freeAccess: boolean;
}

/** Les stations d'ECOS simulé offertes à une promotion (16/09). Liste vide = aucune. */
export interface SetCohortAssessmentEcosInput {
  readonly cohortId: string;
  readonly assessmentModalityId: string;
  readonly stationKeys: readonly string[];
}

/** Une banque telle que l'écran la présente : provenance et comptes. */
export interface QuestionBankRow {
  readonly source: string;
  readonly fileName?: string;
  readonly fileModifiedAt?: string;
  readonly lastImportedAt: string;
  readonly published: number;
  readonly drafts: number;
  readonly flagged: number;
  readonly retired: number;
  /** Dossiers progressifs publiés (mini-DP, KFP) portés par cette source. */
  readonly cases: number;
}

export interface QuestionFilter {
  readonly programId: ProgramId;
  readonly source: string;
  readonly themeIds: readonly string[];
  readonly ranks: readonly string[];
  /** Items (chapitres) et sous-items (clés « chapitre|section ») ; absents ou vides = tous. */
  readonly chapters?: readonly number[];
  readonly sections?: readonly string[];
}

/** Un sous-item d'une banque : son chapitre (l'item), sa section, son compte. */
export interface QuestionSectionRow {
  readonly chapter: number;
  readonly chapterTitle: string;
  readonly itemCode: string;
  readonly sectionKey: string;
  readonly sectionLabel: string;
  readonly published: number;
}

/** Une question SANS sa réponse — ce que `read_question` rend. */
export interface QuestionToAnswer {
  readonly id: string;
  readonly format: string;
  readonly docimologicClass: string;
  readonly stem: string;
  readonly outcomeId: string;
  readonly chapter?: number;
  readonly options: readonly { readonly letter: string; readonly body: string }[];
}

/** La correction — ce que `answer_question` rend, au barème EDN. */
export interface QuestionCorrection {
  readonly score: number;
  readonly discordances: number;
  readonly eliminatory: boolean;
  readonly options: readonly {
    readonly letter: string;
    readonly correct: boolean;
    readonly explanation?: string;
    readonly flag?: string;
  }[];
}

/** Un signalement tel que l'équipe le lit : la question, l'auteur, l'état. */
export interface QuestionReportRow {
  readonly id: string;
  readonly questionId: string;
  readonly externalRef: string;
  readonly stem: string;
  readonly questionStatus: string;
  readonly reason: string;
  readonly message: string;
  readonly status: string;
  readonly reportedByName?: string;
  readonly createdAt: string;
  readonly handledByName?: string;
  readonly handledAt?: string;
  readonly resolution?: string;
}

export type QuestionReportDecision = "en_revue" | "corrige" | "confirme" | "rejete";

/** Les tentatives d'un étudiant, agrégées (jamais la copie question par question). */
export interface LearnerQuestionResults {
  readonly enrollmentId: string;
  readonly personId: string;
  readonly fullName: string;
  readonly attempts: number;
  readonly distinctQuestions: number;
  /** Score EDN moyen 0..1, absent tant qu'aucune réponse. */
  readonly avgScore?: number;
  readonly lastAnsweredAt?: string;
}

export interface ThemeQuestionResults {
  readonly themeId?: string;
  readonly themeLabel: string;
  readonly attempts: number;
  readonly avgScore?: number;
  readonly learners: number;
}

export interface MyQuestionResults {
  readonly attempts: number;
  readonly distinctQuestions: number;
  readonly avgScore?: number;
  readonly lastAnsweredAt?: string;
}

/** Mes résultats par item (thème de l'acquis) — l'étudiant, lui seul. */
export interface MyThemeQuestionResults {
  readonly themeId?: string;
  readonly themeLabel: string;
  readonly attempts: number;
  readonly distinctQuestions: number;
  readonly avgScore?: number;
  readonly lastAnsweredAt?: string;
}

/** Un dossier tel que l'écran le liste : pour choisir lequel jouer. */
export interface QuestionCaseRow {
  readonly id: string;
  readonly externalRef: string;
  readonly kind: "mini_dp" | "kfp";
  readonly title: string;
  readonly chapter?: number;
  readonly chapterTitle?: string;
  readonly itemCode?: string;
  readonly status: string;
  readonly validated: boolean;
  readonly steps: number;
}

/** Un dossier entier SANS ses réponses — ce que `read_case` rend. */
export interface CaseToPlay {
  readonly id: string;
  readonly externalRef: string;
  readonly kind: "mini_dp" | "kfp";
  readonly title: string;
  readonly vignette: string;
  readonly chapter?: number;
  readonly chapterTitle?: string;
  readonly itemCode?: string;
  readonly steps: readonly {
    readonly id: string;
    readonly position: number;
    readonly format: string;
    readonly reveal?: string;
    readonly stem: string;
    readonly expected?: number;
    readonly options: readonly { readonly letter: string; readonly body: string }[];
  }[];
}

/** La correction d'une étape : celle d'une question, plus le corrigé du dossier. */
export interface CaseStepCorrection extends QuestionCorrection {
  readonly note?: string;
}

export interface MyCaseResults {
  readonly caseId: string;
  readonly externalRef: string;
  readonly title: string;
  readonly kind: string;
  readonly chapter?: number;
  readonly itemCode?: string;
  readonly steps: number;
  readonly answered: number;
  readonly avgScore?: number;
  readonly lastAnsweredAt?: string;
}

export interface CohortCaseResults {
  readonly caseId: string;
  readonly externalRef: string;
  readonly title: string;
  readonly kind: string;
  readonly chapter?: number;
  readonly itemCode?: string;
  readonly learners: number;
  readonly attempts: number;
  readonly avgScore?: number;
}

export interface ImportQuestionCasesInput {
  readonly programId: ProgramId;
  readonly mode: ImportMode;
  readonly source: string;
  readonly cases: readonly ImportedCase[];
  readonly publish: boolean;
  readonly fileName?: string;
  readonly fileModifiedAt?: string;
}

export interface ImportQuestionItemsInput {
  readonly programId: ProgramId;
  readonly mode: ImportMode;
  readonly source: string;
  readonly items: readonly ImportedQuestion[];
  readonly publish: boolean;
  readonly fileName?: string;
  readonly fileModifiedAt?: string;
}

export interface UpdateAssessmentSessionInput {
  readonly assessmentSessionId: string;
  readonly scheduledOn: string;
  readonly location: string;
  readonly notes: string;
  readonly closesOn?: string;
  readonly config?: QcmWindowConfig;
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
  /**
   * Bascule « retenue au parcours » sur un LOT de modalités.
   *
   * Un lot plutôt qu'un appel par ligne, pour la raison qui vaut déjà pour
   * `setOutcomesRetained` : le Concepteur enregistre l'état de toutes les
   * cases d'une liste en une fois, et une bascule partielle laisserait
   * l'écran et la base en désaccord. Autorisation vérifiée côté serveur,
   * programme par programme.
   */
  setAssessmentModalitiesRetained(
    assessmentModalityIds: readonly string[],
    retained: boolean,
  ): Promise<void>;
  /**
   * Modification en place (14/09 soir). Jusque-là, corriger un format ou un
   * usage obligeait à archiver et recréer.
   */
  updateAssessmentModality(input: UpdateAssessmentModalityInput): Promise<AssessmentModality>;
  /** Les épreuves datées du programme, toutes promotions confondues. */
  listAssessmentSessions(programId: ProgramId): Promise<readonly AssessmentSession[]>;
  createAssessmentSession(input: CreateAssessmentSessionInput): Promise<AssessmentSession>;
  updateAssessmentSession(input: UpdateAssessmentSessionInput): Promise<AssessmentSession>;
  deleteAssessmentSession(assessmentSessionId: string): Promise<void>;
  /** Quelles promotions utilisent quelles modalités, pour tout le programme. */
  listCohortAssessmentLinks(programId: ProgramId): Promise<readonly CohortAssessmentLink[]>;
  /**
   * La banque de questions (15/09). `importQuestionItems` porte les quatre
   * gestes — mesurer, fusionner, remplacer, supprimer — sur une SOURCE d'un
   * programme ; le rapprochement question ↔ acquis se fait en base par code.
   * Voir supabase/migrations/20260915110000_import_question_items.sql.
   */
  questionBankSummary(programId: ProgramId): Promise<readonly QuestionBankRow[]>;
  importQuestionItems(input: ImportQuestionItemsInput): Promise<ImportReport>;
  /**
   * Active ou retire une modalité pour une promotion. Retirer supprime aussi
   * ses épreuves datées pour cette promotion (règle serveur).
   */
  setCohortAssessmentModality(
    cohortId: string,
    assessmentModalityId: string,
    enabled: boolean,
  ): Promise<void>;
  /* ---- Pilotage des QCM (15/09) --------------------------------------- */
  setCohortAssessmentPilotage(input: SetCohortAssessmentPilotageInput): Promise<void>;
  /* ---- Pilotage de l'ECOS simulé (16/09) ------------------------------- */
  setCohortAssessmentEcos(input: SetCohortAssessmentEcosInput): Promise<void>;
  /* ---- Journal de stage : de quoi la trace est faite (16/09) ----------- */
  setStageTracking(input: {
    readonly assessmentModalityId: string;
    readonly modes: readonly StageTrackingMode[];
    readonly stageLogTemplateId?: string;
  }): Promise<void>;
  /** Les items et sous-items d'une banque, avec leurs comptes — pour composer un filtre. */
  listQuestionSections(
    programId: ProgramId,
    source: string,
  ): Promise<readonly QuestionSectionRow[]>;
  /** Combien de questions publiées répondent au filtre — avant de lancer. */
  countQuestions(filter: QuestionFilter): Promise<number>;
  /** N identifiants tirés au sort dans la banque, filtrés. */
  pickQuestions(filter: QuestionFilter, count: number): Promise<readonly string[]>;
  /**
   * L'inscription fait TIRER l'ordre des propositions À CHAQUE LECTURE
   * (20260916200000, arbitrage de Stef du 16/09 : une question rejouée ne doit
   * pas remontrer le même ordre). Sans elle — relecture par l'équipe —, l'ordre
   * du fichier est conservé, c'est celui qu'on corrige.
   */
  readQuestion(questionId: string, enrollmentId?: string): Promise<QuestionToAnswer>;
  answerQuestion(
    questionId: string,
    enrollmentId: string,
    selected: readonly string[],
  ): Promise<QuestionCorrection>;
  reportQuestion(questionId: string, reason: string, message: string): Promise<void>;
  /* ---- Résultats et signalements, côté équipe (15/09, suite) ---------- */
  /** Tous les signalements du programme, nouveaux d'abord. Équipe d'encadrement. */
  listQuestionReports(programId: ProgramId): Promise<readonly QuestionReportRow[]>;
  /** Traiter un signalement : n'importe quel membre de l'équipe (décision de Stef). */
  resolveQuestionReport(
    reportId: string,
    decision: QuestionReportDecision,
    resolution: string,
  ): Promise<void>;
  questionResultsByLearner(cohortId: string): Promise<readonly LearnerQuestionResults[]>;
  questionResultsByTheme(cohortId: string): Promise<readonly ThemeQuestionResults[]>;
  myQuestionResults(enrollmentId: string): Promise<MyQuestionResults>;
  myQuestionResultsByTheme(enrollmentId: string): Promise<readonly MyThemeQuestionResults[]>;
  /* ---- Dossiers progressifs (mini-DP, KFP) — 15/09 soir ---------------- */
  importQuestionCases(input: ImportQuestionCasesInput): Promise<ImportReport>;
  listQuestionCases(programId: ProgramId, source: string): Promise<readonly QuestionCaseRow[]>;
  readCase(caseId: string, enrollmentId?: string): Promise<CaseToPlay>;
  answerCaseStep(
    questionId: string,
    enrollmentId: string,
    selected: readonly string[],
  ): Promise<CaseStepCorrection>;
  myCaseResults(enrollmentId: string): Promise<readonly MyCaseResults[]>;
  caseResultsByCohort(cohortId: string): Promise<readonly CohortCaseResults[]>;
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

  /**
   * LE CALENDRIER « SEMAINE EN SERVICE / SEMAINE CHEZ SOI » des groupes du
   * programme. Sans lui, le calendrier de presence ne sait pas distinguer une
   * journee manquee d une semaine ou personne n etait attendu.
   */
  listSupervisionGroupWeeks(programId: ProgramId): Promise<readonly SupervisionGroupWeek[]>;

  /**
   * L ETUDIANT SE PLACE LUI-MEME dans un groupe de sa promotion, et peut en
   * changer en cours de stage. Aucun identifiant d etudiant en argument : la
   * fonction serveur retrouve l inscription depuis `auth.uid()`, donc personne
   * ne peut placer quelqu un d autre.
   */
  joinSupervisionGroup(groupId: SupervisionGroupId): Promise<void>;

  /** Pose ou corrige UNE semaine. `kind` a `null` efface la ligne. */
  setSupervisionGroupWeek(input: {
    readonly groupId: SupervisionGroupId;
    readonly weekStart: string;
    readonly kind: "on" | "off" | null;
  }): Promise<void>;

  /**
   * Pose l alternance reguliere sur toute la periode de la promotion et
   * REMPLACE le calendrier existant du groupe. Rend le nombre de semaines.
   */
  generateSupervisionGroupWeeks(input: {
    readonly groupId: SupervisionGroupId;
    readonly firstKind: "on" | "off";
    readonly period: number;
  }): Promise<number>;
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

/**
 * Une section du texte 2026 retrouvée par la recherche transverse.
 *
 * Distincte de `ResourceTextMatch`, qui décrit un segment aveugle de 4 000
 * caractères de l'import 2022 : ici l'unité est la SECTION du livre, elle porte
 * son numéro, son titre et son chapitre, donc elle se cite à l'écran.
 */
export interface ProgramSectionMatch {
  readonly sectionId: string;
  readonly resourceId: LearningResourceId;
  /** Le chapitre d'où vient la section — ce que l'apprenant lit comme contexte. */
  readonly resourceTitle: string;
  readonly chapitre: number;
  readonly numero: string;
  readonly titre: string;
  readonly partie: string | undefined;
  readonly rubrique: string | undefined;
  readonly contenu: string;
  readonly nCaracteres: number;
  readonly rank: number;
  /**
   * Nombre TOTAL de sections trouvées, avant la limite. C'est ce qui permet
   * d'écrire « voir les 12 autres » sans payer une seconde requête : la
   * fonction serveur le calcule par une fenêtre, évaluée avant le `limit`.
   */
  readonly totalMatches: number;
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
  /**
   * LE TEXTE 2026 D'UN CHAPITRE, dans son ordre de lecture.
   *
   * Remplace `listResourceTexts` partout ou l'apprenant LIT (decision de Stef,
   * 09/09 : « tout DOIT etre du 2026 »). L'ancienne methode reste au port : elle
   * sert encore a l'import, et `learning_resource_texts` demeure l'archive de
   * l'import 2022 — a garder, ne pas supprimer.
   *
   * La fonction en base est `security invoker` et porte en plus un predicat
   * explicite `can_read_resource` : un inscrit d'un autre programme, ou un
   * chapitre non publie, ne rendent RIEN plutot qu'une erreur.
   */
  readChapterSections(resourceId: LearningResourceId): Promise<readonly CourseSection[]>;
  /**
   * LE TEXTE PROPRE A UN ACQUIS, et la voie qui l'a trouve.
   *
   * `origin` est une CONDITION D'AFFICHAGE, pas une statistique : le repli
   * `chapitre` ne doit jamais s'afficher sous un sous-item (voir
   * `sectionsPropres`). L'ecran ne decide pas de cette regle, il l'applique.
   */
  readOutcomeSections(outcomeId: OutcomeId): Promise<OutcomeSections>;
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
   * RECHERCHE TRANSVERSE dans le texte 2026 de TOUT le programme.
   *
   * Sœur de `searchResourceTexts`, et la différence n'est pas le cadrage mais
   * le CORPUS : celle-ci lit `course_sections` — le texte 2026, source unique
   * depuis le 08/09 — là où l'autre lit `learning_resource_texts`, l'archive
   * 2022 conservée pour mémoire.
   *
   * Comme pour sa sœur, la normalisation (accents, racines, mots outils) vit
   * côté serveur, pour qu'elle soit exactement celle de l'index. Une
   * normalisation refaite ici rendrait moins que ce que le corpus contient,
   * sans erreur — le pire des cas.
   */
  searchProgramSections(
    programId: ProgramId,
    query: string,
    limit?: number,
  ): Promise<readonly ProgramSectionMatch[]>;
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

/**
 * LA BOITE DE RECEPTION DE L'APPRENANT.
 *
 * AUCUN ARGUMENT DE PERIMETRE, ET C'EST VOULU. « Mes messages » veut dire ceux
 * de la personne connectee : la RLS de `communication_deliveries` compare
 * `person_id` a `auth.uid()`, et passer un identifiant en parametre laisserait
 * croire qu'on peut demander la boite de quelqu'un d'autre — ce que la base
 * refuserait, mais que la signature aurait promis.
 *
 * PAS D'ENVOI ICI. Un apprenant recoit ; il ne repond pas. Le jour ou il devra,
 * ce sera une autre table et un autre garde-fou — pas une methode de plus sur
 * une lecture.
 */
export interface LearnerMessagesRepository {
  listMyMessages(): Promise<readonly LearnerMessage[]>;
  /** Idempotent : relire un message deja lu ne repousse pas l'heure. */
  markRead(deliveryId: MessageDeliveryId): Promise<void>;
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
  /**
   * LES DECALAGES PERSONNELS d'un apprenant, par jalon.
   *
   * SEPARE DE `listPlanSchedule`, et non un parametre de plus : ce dernier rend
   * le calendrier DE REFERENCE de la promotion, que les ecrans
   * d'administration lisent aussi. Y melanger les dates d'un etudiant ferait
   * lire a un administrateur un plan qui n'est celui de personne.
   */
  listMilestoneShifts(enrollmentId: EnrollmentId): Promise<readonly MilestoneShift[]>;
  /**
   * Deplace un jalon POUR CET APPRENANT SEUL. `plan_milestones` — le
   * retroplanning de la promotion — n'est pas touchee.
   *
   * La base refuse : un jalon officiel (contrainte declarative), une inscription
   * qui n'est pas la sienne, et un programme dont l'administrateur n'a pas
   * ouvert le reamenagement. Le message remonte tel quel.
   */
  shiftMilestone(input: {
    enrollmentId: EnrollmentId;
    milestoneId: PlanMilestoneId;
    /** Date seule, `YYYY-MM-DD` : la base attend un `date`, pas un horodatage. */
    dueOn: string;
    /**
     * Debut choisi, meme format. OMIS = la duree du retroplanning est
     * conservee et la fenetre glisse d'un bloc ; fourni = l'apprenant a tire
     * une extremite et choisit sa duree. La base refuse une fin anterieure au
     * debut, par la fonction ET par une contrainte.
     */
    startsOn?: string;
  }): Promise<MilestoneShift>;
  /** Revenir a la date de la promotion. Reste possible meme si le reglage se referme. */
  resetMilestoneShift(enrollmentId: EnrollmentId, milestoneId: PlanMilestoneId): Promise<void>;
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

/**
 * ECOS VIRTUEL EXTERNE — les stations ChatGPT déclarées dans le hub (13/09).
 *
 * La station se joue dans ChatGPT ; le hub ne reçoit que la grille que
 * l'étudiant rapporte (migration 20260913100000). Lecture : l'étudiant et son
 * équipe de stage, périmètre décidé en base par `supervises_enrollment()`.
 * Écriture : l'étudiant seul, par fonction serveur ; le score est recalculé
 * côté base, jamais lu du fichier.
 */
export interface EcosExternalRepository {
  /** Passages d'une inscription, du plus récent au plus ancien. */
  listRunsForEnrollment(enrollmentId: EnrollmentId): Promise<readonly EcosExternalRun[]>;
  /** Passages visibles de l'appelant dans un programme (équipe de stage, admin). */
  listRunsForProgram(programId: ProgramId): Promise<readonly EcosExternalRun[]>;
  /** La grille d'un passage, dans l'ordre du fichier. */
  listRunItems(runId: string): Promise<readonly EcosGridItem[]>;
  /** Déclare un passage avec sa grille ; rend l'identifiant créé. */
  recordRun(input: RecordEcosExternalRunInput): Promise<string>;
  /** Efface un passage déclaré par erreur — réservé à son auteur. */
  deleteRun(runId: string): Promise<void>;
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

  /* ---------------------------------------------------------------- */
  /* LA TRACE DU STAGE (16/09) — 20260916220000_trace_du_stage.sql     */
  /* ---------------------------------------------------------------- */

  /** Crée ou corrige un modèle de carnet (nom, items, nombres attendus). */
  upsertStageLogTemplate(input: UpsertStageLogTemplateInput): Promise<StageLogTemplate>;
  /** Sort un modèle de la liste servie à la conception, sans rien supprimer. */
  archiveStageLogTemplate(templateId: StageLogTemplateId, enabled: boolean): Promise<void>;

  /** Le carnet déclaré par un apprenant, item par item. */
  listLogbookReports(enrollmentId: EnrollmentId): Promise<readonly StageLogbookReport[]>;
  /** L'apprenant déclare son compte pour un item ; la validation retombe. */
  declareLogbookCount(input: DeclareLogbookCountInput): Promise<StageLogbookReport>;
  /** L'encadrant confirme — ou retire sa confirmation. */
  validateLogbookReport(reportId: string, valide: boolean): Promise<void>;

  /** Les traces tenues hors plateforme, attestées pour cette inscription. */
  listStageAttestations(enrollmentId: EnrollmentId): Promise<readonly StageAttestation[]>;
  /** Réservé au responsable de stage et à l'administration du programme. */
  grantStageAttestation(input: {
    readonly enrollmentId: EnrollmentId;
    readonly kind: StageAttestation["kind"];
    readonly note: string;
  }): Promise<void>;
  revokeStageAttestation(enrollmentId: EnrollmentId, kind: StageAttestation["kind"]): Promise<void>;
}

export interface UpsertStageLogTemplateInput {
  readonly programId: ProgramId;
  /** Absent = création. */
  readonly templateId?: StageLogTemplateId;
  readonly label: string;
  readonly description: string;
  /** Un item = un libellé libre et un nombre attendu (« ETT », 150). */
  readonly objectives: readonly { readonly label: string; readonly quota: number }[];
}

export interface DeclareLogbookCountInput {
  readonly enrollmentId: EnrollmentId;
  readonly templateId: StageLogTemplateId;
  readonly objectiveKey: string;
  readonly count: number;
  readonly note: string;
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
  /** `not_validated` = le stage est refuse ; `needs_revision` = a completer. */
  readonly decision: "validated" | "needs_revision" | "not_validated";
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
  /**
   * L'ENCADRANT CONFIRME une declaration. `validate_outcome_declaration`
   * existe en base depuis le 31/08 et n'etait appelee par AUCUNE ligne de
   * code : c'est le geste central de l'encadrement, et il n'avait pas de
   * bouton. La base refuse d'elle-meme une CONNAISSANCE -- « la V1 ne teste
   * pas les connaissances » -- donc l'ecran n'a pas a re-verifier la nature.
   */
  validateOutcomeDeclaration(input: {
    readonly enrollmentId: EnrollmentId;
    readonly outcomeId: OutcomeId;
  }): Promise<OutcomeSelfReport>;
  /** Retirer une confirmation posee par erreur. Reversible. */
  revokeOutcomeValidation(input: {
    readonly enrollmentId: EnrollmentId;
    readonly outcomeId: OutcomeId;
  }): Promise<OutcomeSelfReport>;
  /**
   * Les notes d'experience de l'apprenant, INDEPENDANTES de ses declarations.
   * Lisibles par l'encadrement : c'est le corpus de la future analyse.
   */
  listExperienceNotes(enrollmentId: EnrollmentId): Promise<readonly OutcomeExperienceNote[]>;
  /** Enregistre ou remplace une note. Un corps vide EFFACE la note. */
  saveExperienceNote(input: {
    readonly enrollmentId: EnrollmentId;
    readonly outcomeId: OutcomeId;
    readonly body: string;
  }): Promise<void>;
}

/**
 * LES FILS DE DISCUSSION — apprenant et encadrants, a propos d'une chose.
 *
 * Distinct de `LearnerMessagesRepository` a dessein, et ce n'est pas une
 * commodite : celui-la lit des CAMPAGNES (diffusion, une ligne de remise par
 * destinataire, aucun auteur par message, aucune reponse possible), celui-ci
 * une CONVERSATION. Les deux modeles sont en base, ils ne se melangent pas.
 */
export interface DiscussionRepository {
  /** Les fils d'une inscription, du plus recemment actif au plus ancien. */
  listThreads(enrollmentId: EnrollmentId): Promise<readonly DiscussionThread[]>;
  /**
   * TOUS les fils du programme QUE J'AI LE DROIT DE LIRE — la lecture de
   * l'encadrant. Le perimetre n'est PAS calcule ici : la policy
   * `discussion_threads_select` s'appuie sur `supervises_enrollment()`, donc un
   * encadrant ne recoit que les fils de ses groupes meme s'il demande tout le
   * programme. Structurel, pas declaratif — la meme regle que les carnets.
   */
  listThreadsForProgram(programId: ProgramId): Promise<readonly DiscussionThread[]>;
  /** Les messages d'un fil, dans l'ordre. */
  listMessages(threadId: DiscussionThreadId): Promise<readonly DiscussionMessage[]>;
  /**
   * Poste un message. OUVRE LE FIL S'IL N'EXISTE PAS — un seul geste pour les
   * deux, l'ecran n'a pas a savoir si le fil existe deja.
   */
  postMessage(input: {
    readonly enrollmentId: EnrollmentId;
    readonly outcomeId?: OutcomeId;
    readonly stageLogEntryId?: string;
    readonly body: string;
  }): Promise<DiscussionThread>;
  /** Marque le fil lu POUR MOI seulement : les autres encadrants gardent le leur. */
  markThreadRead(threadId: DiscussionThreadId): Promise<void>;
}

/**
 * LES SOURCES D'EQUIPE D'ENCADREMENT.
 *
 * `setSource` prend le jeton EN CLAIR une seule fois, le temps de l'appel : la
 * fonction SQL le range dans Vault et ne le rend jamais. Aucune methode de ce
 * depot ne peut RELIRE un jeton -- c'est voulu, et c'est verifie en base.
 */
export interface EncadrementSourceRepository {
  listSources(programId: ProgramId): Promise<readonly EncadrementSource[]>;
  listRuns(sourceId: EncadrementSourceId): Promise<readonly EncadrementSyncRun[]>;
  /** Pose ou remplace la source ET son jeton. Rend l'identifiant de la source. */
  setSource(input: {
    readonly programId: ProgramId;
    readonly placementId: PlacementId;
    readonly label: string;
    readonly endpointUrl: string;
    readonly token: string;
  }): Promise<EncadrementSourceId>;
  /** Appelle la source SANS RIEN ECRIRE : c'est « Tester la connexion ». */
  testSource(sourceId: EncadrementSourceId): Promise<EncadrementSyncPreview>;
  /** Appelle la source ET applique : ajouts au vivier, retraits PROPOSES. */
  syncSource(sourceId: EncadrementSourceId): Promise<EncadrementSyncReport>;
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
  readonly messages: LearnerMessagesRepository;
  readonly passport: PassportRepository;
  readonly discussions: DiscussionRepository;
  readonly encadrementSources: EncadrementSourceRepository;
  readonly stageLogs: StageLogRepository;
  readonly ecosExternal: EcosExternalRepository;
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
