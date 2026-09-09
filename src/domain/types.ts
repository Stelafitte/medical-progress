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
export type SupervisionGroupId = Id<"SupervisionGroup">;
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
  /**
   * L'apprenant peut-il DEPLACER SES PROPRES jalons ?
   *
   * Reglage de programme, decide par l'administrateur (Stef, 09/09 : « si
   * autorise par l'admin programme »). Absent = ferme, comme les autres
   * modules optionnels : une plateforme qui n'a rien decide n'ouvre pas.
   *
   * CE QUE CELA N'OUVRE PAS. Un decalage vaut pour UNE inscription et ne
   * touche ni `plan_milestones` — le retroplanning de la promotion — ni le
   * plan des autres inscrits. Les jalons marques officiels restent
   * indeplacables, et c'est une contrainte declarative de PostgreSQL, pas ce
   * drapeau, qui le garantit.
   */
  readonly learnerPlanShiftsEnabled?: boolean;
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
  /**
   * Etat en cours de conception (« Concepteur de programme »), avant
   * finalisation et passage au pilotage. Objet libre serialise en JSON ;
   * absent/null tant qu'aucun brouillon n'a ete enregistre.
   */
  readonly designDraft?: Record<string, unknown> | null;
}

export interface CurriculumVersion extends Entity<CurriculumVersionId> {
  readonly programId: ProgramId;
  readonly label: string;
  readonly effectiveFrom: IsoDateTime;
  readonly status: "draft" | "active" | "archived";
}

/**
 * Où en est une promotion. Miroir exact de l'enum `cohort_status`.
 *
 * `draft` = en conception : elle se modifie, et l'apprenant n'a rien à y voir.
 * `open` = ouverte, scellée par le concepteur — voir `open_cohort`.
 * Les trois autres sont la vie de la promotion après son ouverture ; aucun
 * écran ne les écrit encore.
 */
export type CohortStatus = "draft" | "open" | "in_progress" | "completed" | "archived";

export const COHORT_STATUS_LABELS_FR: Record<CohortStatus, string> = {
  draft: "En conception",
  open: "Ouverte",
  in_progress: "En cours",
  completed: "Terminée",
  archived: "Archivée",
};

export interface Cohort extends Entity<CohortId> {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  readonly label: string;
  readonly academicYear: string;
  readonly startsOn: IsoDateTime;
  readonly endsOn: IsoDateTime;
  readonly learnerCount: number;
  readonly status: CohortStatus;
  /**
   * Archivage réversible. Non nul = sortie des listes actives, sans perte :
   * inscriptions, jalons et carnets de stage restent rattachés. Absent sur les
   * classes lues avant cette colonne, d'où l'optionnalité.
   */
  readonly archivedAt?: string | null;
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

/**
 * Le rang de la reforme du deuxieme cycle (R2C), qui hierarchise LES
 * CONNAISSANCES — pas les competences.
 *
 * - `A` : indispensables a tout medecin (pratique courante et urgences), a
 *   maitriser a l'issue du deuxieme cycle ;
 * - `B` : devant etre acquises a l'entree dans le DES, plus approfondies ;
 * - `C` : de niveau troisieme cycle, retirees des referentiels de second cycle.
 *
 * A ne pas confondre avec `MasteryLevel` : le rang dit A QUEL PALIER DE
 * FORMATION la connaissance devient exigible, le niveau dit OU EN EST
 * l'etudiant. Les deux coexistent sur la meme ligne.
 */
export type KnowledgeRank = "A" | "B" | "C";

export const KNOWLEDGE_RANKS: readonly KnowledgeRank[] = ["A", "B", "C"];

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
  /**
   * Date a laquelle l'acquis a ete retenu pour le parcours du programme.
   * `null` : il reste dans le referentiel du programme, visible et
   * modifiable, mais n'est pas integre au parcours. A ne pas confondre avec
   * l'archivage, qui le sort des listes actives.
   */
  readonly retainedAt: string | null;
  /**
   * Chapitre auquel l'acquis appartient. Absent = non rangé, ce qui reste un
   * état valide : le référentiel d'un programme peut vivre à plat.
   */
  readonly themeId?: OutcomeThemeId;
  /** Ordre à l'intérieur du thème. Absent = non ordonné (un référentiel à plat). */
  readonly position?: number;
  /**
   * Rang R2C, pour les connaissances seulement. Absent = non hiérarchisé, ce
   * qui reste un état valide et durable : une compétence n'en aura jamais, et
   * un référentiel peut ne pas hiérarchiser. La base le fait respecter
   * (`check (knowledge_rank is null or nature = 'knowledge')`).
   */
  readonly knowledgeRank?: KnowledgeRank;
}

export type OutcomeThemeId = Id<"OutcomeTheme">;

/**
 * Un chapitre au-dessus des acquis.
 *
 * Ce n'est PAS un acquis : il ne porte ni nature ni niveau cible, et personne
 * n'y déclare un niveau. C'est un rangement, qui permet à l'étudiant de voir
 * sept titres plutôt que cinquante-sept lignes.
 */
export interface OutcomeTheme extends Entity<OutcomeThemeId> {
  readonly programId: ProgramId;
  readonly label: string;
  readonly description: string;
  readonly position: number;
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

/**
 * Groupe d'encadrement : le RÔLE dit ce qu'un senior a le droit de faire, le
 * GROUPE dit sur quels étudiants. Un groupe appartient à une cohorte ET à un
 * terrain ; il porte plusieurs encadrants, et un encadrant peut suivre
 * plusieurs groupes. Un étudiant n'appartient qu'à un seul groupe.
 */
export interface SupervisionGroup extends Entity<SupervisionGroupId> {
  readonly programId: ProgramId;
  readonly cohortId: CohortId;
  readonly placementId: PlacementId;
  readonly label: string;
  readonly memberEnrollmentIds: readonly EnrollmentId[];
  readonly supervisorPersonIds: readonly PersonId[];
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
