/**
 * Modèle métier universel de Campus Santé Augmenté.
 *
 * Ce module ne contient AUCUNE dépendance framework ni accès données :
 * uniquement des types et invariants de domaine, partageables entre
 * programmes (DIU d'Échocardiographie, DFASM Cardiologie, futurs programmes).
 */

/** Identifiants nominaux (évite de confondre deux ids de types différents). */
export type Id<Tag extends string> = string & { readonly __brand?: Tag };

export type ProgramId = Id<"Program">;
export type CurriculumVersionId = Id<"CurriculumVersion">;
export type CohortId = Id<"Cohort">;
export type PersonId = Id<"Person">;
export type EnrollmentId = Id<"Enrollment">;
export type OutcomeId = Id<"Outcome">;
export type PlacementId = Id<"Placement">;
export type PlacementAssignmentId = Id<"PlacementAssignment">;
export type EvidenceId = Id<"Evidence">;
export type LearningResourceId = Id<"LearningResource">;
export type AuditEventId = Id<"AuditEvent">;

/** ISO 8601 (UTC). */
export type IsoDateTime = string;

/**
 * Provenance : toute entité importée depuis un système historique
 * (ex. dfasm-learnhub) doit conserver son origine de façon explicite.
 */
export interface Provenance {
  /** "native" = créé dans ce socle. Sinon identifiant du système source. */
  readonly sourceSystem: "native" | (string & {});
  readonly sourceId?: string;
  readonly importedAt?: IsoDateTime;
  readonly importNote?: string;
}

export interface Entity<TId extends string> {
  readonly id: TId;
  readonly createdAt: IsoDateTime;
  readonly updatedAt?: IsoDateTime;
  readonly provenance: Provenance;
}

/* ------------------------------------------------------------------ */
/* Programmes et curricula */
/* ------------------------------------------------------------------ */

export type ProgramKind = "diu" | "dfasm" | "dpc" | "other";

/** Réglages activables par programme : un seul moteur, plusieurs configurations. */
export interface ProgramConfig {
  /** Le programme s'appuie-t-il sur des stages / terrains cliniques ? */
  readonly placementsEnabled: boolean;
  /** Simulation / ECOS activés (jamais l'identité du produit, juste un module). */
  readonly simulationEnabled: boolean;
  /** Validation humaine obligatoire pour toute compétence réelle. */
  readonly realCompetenceRequiresValidator: true;
  /** Niveau de maîtrise cible attendu en fin de cursus. */
  readonly targetMastery: MasteryLevel;
  /**
   * Modules OPTIONNELS activables par programme (absent = désactivé).
   * Ils n'introduisent aucune architecture parallèle : même socle, autre
   * configuration (typiquement un programme de DPC).
   */
  readonly auditsEnabled?: boolean;
  readonly prePostTestsEnabled?: boolean;
  readonly sessionsEnabled?: boolean;
  /**
   * Programme intégré de DPC (audit 1 → formation → audit 2, tests, attestation).
   * Activable pour n'importe quel programme : c'est une configuration, pas une
   * application séparée.
   */
  readonly dpcEnabled?: boolean;
  readonly locale: "fr-FR";
}

export interface Program extends Entity<ProgramId> {
  readonly code: string;
  readonly name: string;
  readonly kind: ProgramKind;
  readonly institution: string;
  readonly annualLearnerEstimate: number;
  readonly config: ProgramConfig;
}

export interface CurriculumVersion extends Entity<CurriculumVersionId> {
  readonly programId: ProgramId;
  readonly label: string;
  readonly effectiveFrom: IsoDateTime;
  readonly status: "draft" | "active" | "archived";
}

export interface Cohort extends Entity<CohortId> {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  readonly label: string;
  readonly academicYear: string;
  readonly startsOn: IsoDateTime;
  readonly endsOn: IsoDateTime;
  readonly learnerCount: number;
}

/* ------------------------------------------------------------------ */
/* Personnes, inscriptions, rôles contextualisés */
/* ------------------------------------------------------------------ */

export interface Person extends Entity<PersonId> {
  readonly fullName: string;
  readonly email: string;
}

export interface Enrollment extends Entity<EnrollmentId> {
  readonly personId: PersonId;
  readonly programId: ProgramId;
  readonly cohortId: CohortId;
  readonly status: "active" | "suspended" | "completed" | "withdrawn";
}

export type RoleName = "learner" | "placement_supervisor" | "teacher" | "administrator";

/**
 * Portée d'un rôle : un rôle n'est jamais purement global.
 * Un encadrant l'est pour un stage donné, un enseignant pour un programme, etc.
 */
export type RoleScope =
  | { readonly kind: "platform" }
  | { readonly kind: "program"; readonly programId: ProgramId }
  | { readonly kind: "cohort"; readonly programId: ProgramId; readonly cohortId: CohortId }
  | {
      readonly kind: "placement";
      readonly programId: ProgramId;
      readonly placementId: PlacementId;
    };

export interface RoleAssignment {
  readonly personId: PersonId;
  readonly role: RoleName;
  readonly scope: RoleScope;
  readonly grantedAt: IsoDateTime;
  readonly provenance: Provenance;
}

/* ------------------------------------------------------------------ */
/* Acquis d'apprentissage (compétences / connaissances) */
/* ------------------------------------------------------------------ */

/** Distinction structurante du socle. */
export type OutcomeNature =
  /** Savoir : évaluable par QCM / examen écrit. */
  | "knowledge"
  /** Savoir-faire démontré en environnement contrôlé (simulation, ECOS). */
  | "simulated_competence"
  /** Savoir-faire démontré en situation réelle authentique, validé par un tiers. */
  | "real_competence";

export type MasteryLevel = "not_started" | "novice" | "intermediate" | "proficient" | "autonomous";

export const MASTERY_ORDER: readonly MasteryLevel[] = [
  "not_started",
  "novice",
  "intermediate",
  "proficient",
  "autonomous",
];

export interface Outcome extends Entity<OutcomeId> {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly nature: OutcomeNature;
  readonly domain: string;
  readonly targetMastery: MasteryLevel;
}

export type OutcomeRelationKind = "prerequisite_of" | "part_of" | "aligned_with" | "migrated_from";

/** Graphe des acquis : permet de rattacher les 57 compétences historiques. */
export interface OutcomeRelation {
  readonly fromOutcomeId: OutcomeId;
  readonly toOutcomeId: OutcomeId;
  readonly kind: OutcomeRelationKind;
  readonly provenance: Provenance;
}

/* ------------------------------------------------------------------ */
/* Stages */
/* ------------------------------------------------------------------ */

export interface Placement extends Entity<PlacementId> {
  readonly programId: ProgramId;
  readonly name: string;
  readonly site: string;
  readonly department: string;
  readonly capacity: number;
}

export interface PlacementAssignment extends Entity<PlacementAssignmentId> {
  readonly placementId: PlacementId;
  readonly enrollmentId: EnrollmentId;
  readonly supervisorPersonId: PersonId;
  readonly startsOn: IsoDateTime;
  readonly endsOn: IsoDateTime;
  readonly status: "planned" | "in_progress" | "completed" | "cancelled";
}

/* ------------------------------------------------------------------ */
/* Preuves d'acquisition */
/* ------------------------------------------------------------------ */

export type EvidenceKind =
  "quiz" | "real_activity" | "simulation" | "placement" | "human_validation";

export type EvidenceStatus = "draft" | "submitted" | "validated" | "rejected" | "expired";

export interface EvidenceMetric {
  readonly label: string;
  readonly value: string;
}

export interface Evidence extends Entity<EvidenceId> {
  readonly enrollmentId: EnrollmentId;
  readonly outcomeId: OutcomeId;
  readonly kind: EvidenceKind;
  readonly status: EvidenceStatus;
  readonly title: string;
  readonly occurredAt: IsoDateTime;
  /** Déclaré par l'apprenant lui-même ? Insuffisant seul pour une compétence réelle. */
  readonly selfDeclared: boolean;
  readonly placementAssignmentId?: PlacementAssignmentId;
  readonly metrics?: readonly EvidenceMetric[];
  readonly validations: readonly EvidenceValidation[];
}

export interface EvidenceValidation {
  readonly evidenceId: EvidenceId;
  readonly validatorPersonId: PersonId;
  readonly validatorRole: Extract<RoleName, "placement_supervisor" | "teacher" | "administrator">;
  readonly decision: "validated" | "rejected" | "needs_revision";
  readonly decidedAt: IsoDateTime;
  readonly comment?: string;
  readonly provenance: Provenance;
}

/* ------------------------------------------------------------------ */
/* Ressources et audit */
/* ------------------------------------------------------------------ */

/**
 * Format d'un support pédagogique, aligné sur l'enum Postgres `resource_format`
 * (supabase/migrations/20260829090000_mediatheque_external_url_and_links.sql
 * et la table `learning_resources` pré-existante).
 */
export interface LearningResource extends Entity<LearningResourceId> {
  readonly programId: ProgramId;
  readonly title: string;
  readonly format: "html" | "pdf" | "video" | "narrated_slides" | "link" | "other";
  readonly outcomeIds: readonly OutcomeId[];
  readonly estimatedMinutes: number;
}

export interface AuditEvent extends Entity<AuditEventId> {
  readonly actorPersonId: PersonId | "system";
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly programId?: ProgramId;
  readonly detail?: string;
}
