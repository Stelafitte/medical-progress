/**
 * Création d'une classe (promotion) — logique de domaine PURE.
 *
 * Une classe est le même objet quel que soit l'endroit où elle est créée :
 * dans le « Concepteur de programme » (au fil de la conception, associée
 * d'emblée au programme en cours) ou dans l'onglet « Classes d'apprenants »
 * (classe créée indépendamment, sur information reçue par ailleurs).
 * Il n'existe donc qu'un seul outil de création et une seule liste de classes.
 */
import type { Cohort, CohortId, CurriculumVersionId, ProgramId } from "@/domain/types";

/** Saisie brute du formulaire unique de création de classe. */
export interface NewCohortInput {
  readonly label: string;
  readonly academicYear: string;
  readonly startsOn: string;
  readonly endsOn: string;
  /** Effectif attendu, saisi en texte libre dans le formulaire. */
  readonly learners: string;
}

export const EMPTY_NEW_COHORT_INPUT: NewCohortInput = {
  label: "",
  academicYear: "",
  startsOn: "",
  endsOn: "",
  learners: "",
};

export type NewCohortIssue =
  | "label-required"
  | "dates-required"
  | "dates-order"
  | "learners-invalid";

/** Vérifie la saisie : mêmes règles dans le concepteur et dans l'onglet Classes. */
export function validateNewCohort(input: NewCohortInput): readonly NewCohortIssue[] {
  const issues: NewCohortIssue[] = [];
  if (input.label.trim().length === 0) issues.push("label-required");
  if (input.startsOn.length === 0 || input.endsOn.length === 0) issues.push("dates-required");
  else if (input.endsOn < input.startsOn) issues.push("dates-order");

  const learners = input.learners.trim();
  if (learners.length > 0 && !/^\d{1,5}$/.test(learners)) issues.push("learners-invalid");
  return issues;
}

export const NEW_COHORT_ISSUE_LABELS_FR: Record<NewCohortIssue, string> = {
  "label-required": "Le nom de la classe est obligatoire.",
  "dates-required": "Indiquez une date de début et une date de fin.",
  "dates-order": "La date de fin doit suivre la date de début.",
  "learners-invalid": "L'effectif attendu doit être un nombre entier.",
};

/** Année universitaire déduite d'une date de début (septembre = bascule). */
export function academicYearFor(startsOn: string): string {
  const year = Number(startsOn.slice(0, 4));
  const month = Number(startsOn.slice(5, 7));
  if (!Number.isFinite(year) || year === 0) return "";
  const first = month >= 9 ? year : year - 1;
  return `${first}-${first + 1}`;
}

export interface BuildCohortContext {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  readonly now: string;
  /** Rang de la classe créée localement, pour un identifiant déterministe. */
  readonly sequence: number;
}

/**
 * Construit la classe à partir de la saisie validée. Déterministe : aucun
 * appel à Date.now() ni à un générateur aléatoire.
 */
export function buildCohortFromInput(input: NewCohortInput, ctx: BuildCohortContext): Cohort {
  const startsOn = input.startsOn.length > 0 ? `${input.startsOn}T00:00:00.000Z` : ctx.now;
  const endsOn = input.endsOn.length > 0 ? `${input.endsOn}T00:00:00.000Z` : ctx.now;
  const learners = Number(input.learners.trim());
  return {
    id: `coh-local-${ctx.sequence}` as CohortId,
    createdAt: ctx.now,
    provenance: { sourceSystem: "native" },
    programId: ctx.programId,
    curriculumVersionId: ctx.curriculumVersionId,
    label: input.label.trim(),
    academicYear:
      input.academicYear.trim().length > 0
        ? input.academicYear.trim()
        : academicYearFor(input.startsOn),
    startsOn,
    endsOn,
    learnerCount: Number.isFinite(learners) && learners > 0 ? learners : 0,
  };
}

/** Fusionne les classes du dépôt et celles créées localement, sans doublon d'identifiant. */
export function mergeCohorts(
  stored: readonly Cohort[],
  local: readonly Cohort[],
): readonly Cohort[] {
  const seen = new Set(stored.map((cohort) => cohort.id));
  return [...stored, ...local.filter((cohort) => !seen.has(cohort.id))];
}
