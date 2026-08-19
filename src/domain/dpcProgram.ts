/**
 * MODÈLE GÉNÉRIQUE d'un programme DPC (étape 1 du socle générique).
 *
 * Ce module décrit la CONFIGURATION d'un programme DPC indépendamment de tout
 * démonstrateur. Le programme « DPC HVG–Amylose » n'est qu'une instance de ce
 * modèle : aucune règle ci-dessous ne dépend de ses valeurs (10 dossiers,
 * 29 critères, 4 parties, 2 tours, HVG, amylose).
 *
 * Invariants :
 *  - une grille d'audit clinique et un QCM de connaissances sont deux natures
 *    d'éléments DISTINCTES, jamais interchangeables ;
 *  - un programme peut n'avoir aucune grille et aucun tour d'audit ;
 *  - une comparaison entre deux tours n'est licite que si les deux tours
 *    utilisent la MÊME version publiée de la MÊME grille ;
 *  - une version gelée n'est plus modifiable sur ses éléments pédagogiques
 *    structurants ;
 *  - toutes les fonctions de ce module sont pures, sans IA, sans I/O.
 *
 * Hors périmètre de cette étape : ingestion réelle de documents, saisie
 * apprenant, SQL, IA, interface.
 */
import type { CohortId, IsoDateTime, PersonId, ProgramId, Provenance } from "./types";

/* ------------------------------------------------------------------ */
/* 1. Nature explicite des éléments importables                        */
/* ------------------------------------------------------------------ */

export type DpcImportableKind =
  | "program_document"
  | "audit_grid"
  | "knowledge_quiz"
  | "teaching_resource"
  | "bibliography"
  | "attendance_document"
  | "improvement_plan_template";

export const DPC_IMPORTABLE_KIND_LABELS_FR: Record<DpcImportableKind, string> = {
  program_document: "Document de programme",
  audit_grid: "Grille d'audit clinique",
  knowledge_quiz: "QCM de connaissances",
  teaching_resource: "Support pédagogique",
  bibliography: "Bibliographie",
  attendance_document: "Document d'émargement",
  improvement_plan_template: "Modèle de plan d'amélioration",
};

/** Un élément importé conserve sa nature et sa provenance, jamais devinées. */
export interface DpcSourceDocument {
  readonly id: string;
  readonly kind: DpcImportableKind;
  readonly fileName: string;
  readonly importedAt?: IsoDateTime;
  readonly importedBy?: PersonId;
  readonly checksum?: string;
  readonly provenance: Provenance;
  /** Élément de configuration produit à partir de ce document, si connu. */
  readonly producedRef?: string;
}

/** Une grille d'audit ne peut jamais être traitée comme un QCM. */
export function isAuditGridArtifact(kind: DpcImportableKind): boolean {
  return kind === "audit_grid";
}

export function isKnowledgeQuizArtifact(kind: DpcImportableKind): boolean {
  return kind === "knowledge_quiz";
}

/** Deux natures d'évaluation strictement disjointes. */
export function areDistinctAssessmentKinds(a: DpcImportableKind, b: DpcImportableKind): boolean {
  return (
    (isAuditGridArtifact(a) && isKnowledgeQuizArtifact(b)) ||
    (isKnowledgeQuizArtifact(a) && isAuditGridArtifact(b))
  );
}

/* ------------------------------------------------------------------ */
/* 2. Version publiée et gel                                           */
/* ------------------------------------------------------------------ */

export type DpcVersionStatus = "draft" | "validated" | "published" | "archived";

export const DPC_VERSION_STATUS_LABELS_FR: Record<DpcVersionStatus, string> = {
  draft: "Brouillon",
  validated: "Validé",
  published: "Publié",
  archived: "Archivé",
};

export interface DpcPublishedVersion {
  readonly version: string;
  readonly status: DpcVersionStatus;
  readonly checksum?: string;
  readonly validatedAt?: IsoDateTime;
  readonly validatedBy?: PersonId;
  readonly publishedAt?: IsoDateTime;
  /** Une fois gelée, la version n'est plus modifiable structurellement. */
  readonly frozenAt?: IsoDateTime;
}

/**
 * Éléments pédagogiques STRUCTURANTS : leur modification invaliderait toute
 * comparaison avant/après déjà engagée.
 */
export type DpcConfigurableField =
  | "criteria"
  | "sections"
  | "answerModalities"
  | "recordsPerRound"
  | "inclusionCriteria"
  | "completenessRule"
  | "quizQuestions"
  | "title"
  | "description"
  | "administrativeNumber"
  | "faculty"
  | "bibliography"
  | "schedule"
  | "roundWindow";

const STRUCTURAL_FIELDS: readonly DpcConfigurableField[] = [
  "criteria",
  "sections",
  "answerModalities",
  "recordsPerRound",
  "inclusionCriteria",
  "completenessRule",
  "quizQuestions",
];

export function isStructuralField(field: DpcConfigurableField): boolean {
  return STRUCTURAL_FIELDS.includes(field);
}

export function isFrozen(version: DpcPublishedVersion): boolean {
  return version.frozenAt !== undefined;
}

/**
 * Une configuration publiée est-elle encore modifiable sur ce champ ?
 * Réponse NON pour tout élément pédagogique structurant d'une version gelée,
 * et NON pour tout champ structurant d'une version publiée.
 */
export function isFieldEditable(
  version: DpcPublishedVersion,
  field: DpcConfigurableField,
): boolean {
  if (isFrozen(version)) return false;
  if (version.status === "archived") return false;
  if (version.status === "published" && isStructuralField(field)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* 3. Configuration générique des audits                               */
/* ------------------------------------------------------------------ */

/** Règle de complétude d'un tour, paramétrable et non codée en dur. */
export interface DpcCompletenessRule {
  /** Tous les dossiers attendus doivent-ils être renseignés ? */
  readonly allRecordsRequired: boolean;
  /** Nombre minimal de dossiers complets acceptés à la soumission. */
  readonly minimumCompleteRecords?: number;
  /** Part minimale de critères renseignés par dossier (0–100). */
  readonly minimumAnsweredPercentPerRecord?: number;
  /** Les réponses « non applicable » comptent-elles comme renseignées ? */
  readonly notApplicableCountsAsAnswered: boolean;
}

export interface DpcGridConfig {
  readonly gridId: string;
  readonly title: string;
  readonly version: DpcPublishedVersion;
  /** Nombre de dossiers par tour par défaut, propre à la grille. */
  readonly defaultRecordsPerRound: number;
  /** Critères d'inclusion des dossiers à auditer (texte méthodologique). */
  readonly inclusionCriteria: readonly string[];
  readonly completenessRule: DpcCompletenessRule;
  readonly sourceDocumentId?: string;
}

export interface DpcRoundConfig {
  readonly roundId: string;
  readonly label: string;
  /** Ordre du tour dans la campagne (1, 2, 3…), sans nombre imposé. */
  readonly order: number;
  readonly gridId: string;
  /** Version de grille effectivement utilisée par ce tour. */
  readonly gridVersion: string;
  readonly cohortId?: CohortId;
  readonly opensOn?: IsoDateTime;
  readonly closesOn?: IsoDateTime;
  /** Surcharge locale du nombre X de dossiers ; sinon valeur de la grille. */
  readonly recordsPerRound?: number;
  readonly completenessRule?: DpcCompletenessRule;
}

/** Zéro, une ou plusieurs grilles ; zéro, un ou plusieurs tours. */
export interface DpcAuditModuleConfig {
  readonly grids: readonly DpcGridConfig[];
  readonly rounds: readonly DpcRoundConfig[];
}

export const EMPTY_DPC_AUDIT_CONFIG: DpcAuditModuleConfig = { grids: [], rounds: [] };

/** Nombre X de dossiers d'un tour : surcharge du tour, sinon défaut de grille. */
export function recordsExpectedForRound(
  config: DpcAuditModuleConfig,
  roundId: string,
): number | undefined {
  const round = config.rounds.find((r) => r.roundId === roundId);
  if (!round) return undefined;
  if (round.recordsPerRound !== undefined) return round.recordsPerRound;
  return config.grids.find((g) => g.gridId === round.gridId)?.defaultRecordsPerRound;
}

export function completenessRuleForRound(
  config: DpcAuditModuleConfig,
  roundId: string,
): DpcCompletenessRule | undefined {
  const round = config.rounds.find((r) => r.roundId === roundId);
  if (!round) return undefined;
  if (round.completenessRule) return round.completenessRule;
  return config.grids.find((g) => g.gridId === round.gridId)?.completenessRule;
}

export type DpcComparabilityReason =
  | "comparable"
  | "unknown_round"
  | "same_round"
  | "different_grid"
  | "different_grid_version"
  | "grid_version_not_published";

export interface DpcComparability {
  readonly comparable: boolean;
  readonly reason: DpcComparabilityReason;
}

/**
 * Comparaison autorisée uniquement entre deux tours utilisant la même version
 * PUBLIÉE de la même grille.
 */
export function canCompareRounds(
  config: DpcAuditModuleConfig,
  roundIdA: string,
  roundIdB: string,
): DpcComparability {
  const a = config.rounds.find((r) => r.roundId === roundIdA);
  const b = config.rounds.find((r) => r.roundId === roundIdB);
  if (!a || !b) return { comparable: false, reason: "unknown_round" };
  if (a.roundId === b.roundId) return { comparable: false, reason: "same_round" };
  if (a.gridId !== b.gridId) return { comparable: false, reason: "different_grid" };
  if (a.gridVersion !== b.gridVersion)
    return { comparable: false, reason: "different_grid_version" };
  const grid = config.grids.find((g) => g.gridId === a.gridId);
  const published =
    grid !== undefined &&
    grid.version.version === a.gridVersion &&
    (grid.version.status === "published" || grid.version.status === "archived") &&
    grid.version.publishedAt !== undefined;
  if (!published) return { comparable: false, reason: "grid_version_not_published" };
  return { comparable: true, reason: "comparable" };
}

/* ------------------------------------------------------------------ */
/* 4. Définition générique d'un programme DPC                          */
/* ------------------------------------------------------------------ */

/** Modules activables : un seul moteur, plusieurs configurations. */
export interface DpcModuleToggles {
  readonly clinicalAudit: boolean;
  readonly knowledgeTests: boolean;
  readonly training: boolean;
  readonly attendance: boolean;
  readonly improvementPlan: boolean;
  readonly certificate: boolean;
}

export interface DpcTeachingModality {
  readonly id: string;
  readonly label: string;
  readonly kind: "in_person" | "virtual_classroom" | "self_paced" | "audit" | "other";
  readonly durationMinutes?: number;
}

export interface DpcFacultyEntry {
  readonly personId?: PersonId;
  readonly fullName: string;
  readonly role: string;
  readonly interestsDeclared: boolean;
}

export interface DpcBibliographyEntry {
  readonly order: number;
  readonly citation: string;
  readonly identifier?: string;
}

export interface DpcResourceRef {
  readonly id: string;
  readonly label: string;
  readonly kind: DpcImportableKind;
}

export interface DpcScheduleEntry {
  readonly key: string;
  /** Fenêtre relative ou absolue, libre : aucun calendrier imposé. */
  readonly window: string;
  readonly description: string;
  readonly requirement?: string;
}

/** Règles d'achèvement du programme, paramétrables. */
export interface DpcCompletionRules {
  readonly requireAllRounds: boolean;
  readonly requiredRoundIds: readonly string[];
  readonly requirePreTest: boolean;
  readonly requirePostTest: boolean;
  readonly requireAttendance: boolean;
  readonly minimumProgressPoints?: number;
}

export interface DpcProgramDefinition {
  readonly id: string;
  readonly programId: ProgramId;
  readonly version: DpcPublishedVersion;
  readonly title: string;
  readonly administrativeNumber?: string;
  readonly orientations: readonly string[];
  readonly targetAudience: string;
  readonly objectives: readonly string[];
  readonly teachingModalities: readonly DpcTeachingModality[];
  readonly faculty: readonly DpcFacultyEntry[];
  readonly resources: readonly DpcResourceRef[];
  readonly bibliography: readonly DpcBibliographyEntry[];
  readonly modules: DpcModuleToggles;
  readonly completionRules: DpcCompletionRules;
  readonly schedule: readonly DpcScheduleEntry[];
  readonly audit: DpcAuditModuleConfig;
  /** Provenance des documents importés ayant produit cette configuration. */
  readonly sourceDocuments: readonly DpcSourceDocument[];
  readonly provenance: Provenance;
}

export interface DpcDefinitionIssue {
  readonly code:
    | "missing_title"
    | "missing_target_audience"
    | "round_without_grid"
    | "round_grid_version_mismatch"
    | "duplicate_round_order"
    | "invalid_records_per_round"
    | "required_round_unknown";
  readonly message: string;
  readonly ref?: string;
}

/**
 * Validation STRUCTURELLE seulement : un programme sans grille et sans tour est
 * valide (tout audit est optionnel).
 */
export function validateProgramDefinition(
  definition: DpcProgramDefinition,
): readonly DpcDefinitionIssue[] {
  const issues: DpcDefinitionIssue[] = [];
  if (definition.title.trim() === "")
    issues.push({ code: "missing_title", message: "Le titre du programme est requis." });
  if (definition.targetAudience.trim() === "")
    issues.push({
      code: "missing_target_audience",
      message: "Le public cible est requis.",
    });

  const seenOrders = new Set<number>();
  for (const round of definition.audit.rounds) {
    const grid = definition.audit.grids.find((g) => g.gridId === round.gridId);
    if (!grid) {
      issues.push({
        code: "round_without_grid",
        message: `Le tour « ${round.label} » référence une grille inconnue.`,
        ref: round.roundId,
      });
    } else if (grid.version.version !== round.gridVersion) {
      issues.push({
        code: "round_grid_version_mismatch",
        message: `Le tour « ${round.label} » référence une version de grille absente.`,
        ref: round.roundId,
      });
    }
    if (seenOrders.has(round.order))
      issues.push({
        code: "duplicate_round_order",
        message: `Deux tours partagent l'ordre ${round.order}.`,
        ref: round.roundId,
      });
    seenOrders.add(round.order);

    const expected = recordsExpectedForRound(definition.audit, round.roundId);
    if (expected === undefined || expected < 1 || !Number.isInteger(expected))
      issues.push({
        code: "invalid_records_per_round",
        message: `Le nombre de dossiers du tour « ${round.label} » est invalide.`,
        ref: round.roundId,
      });
  }

  for (const roundId of definition.completionRules.requiredRoundIds) {
    if (!definition.audit.rounds.some((r) => r.roundId === roundId))
      issues.push({
        code: "required_round_unknown",
        message: "Une règle d'achèvement référence un tour inexistant.",
        ref: roundId,
      });
  }
  return issues;
}

export function isProgramDefinitionValid(definition: DpcProgramDefinition): boolean {
  return validateProgramDefinition(definition).length === 0;
}

/** Tours triés par ordre déclaré, sans présupposer leur nombre. */
export function orderedRounds(config: DpcAuditModuleConfig): readonly DpcRoundConfig[] {
  return [...config.rounds].sort((a, b) => a.order - b.order);
}

export function criterionCountOf(sectionCounts: readonly number[]): number {
  return sectionCounts.reduce((total, count) => total + count, 0);
}
