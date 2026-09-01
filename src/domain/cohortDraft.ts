/**
 * Création d'une classe (promotion) — logique de domaine PURE.
 *
 * Une classe est le même objet quel que soit l'endroit où elle est créée :
 * dans le « Concepteur de programme » (au fil de la conception, associée
 * d'emblée au programme en cours) ou dans l'onglet « Classes d'apprenants »
 * (classe créée indépendamment, sur information reçue par ailleurs).
 * Il n'existe donc qu'un seul outil de création et une seule liste de classes.
 *
 * La création effective (insertion en base, vérification d'unicité et
 * d'autorisation) est déléguée au port `createCohort` — voir
 * `src/application/ports/repositories.ts`. Ce module ne fait que valider la
 * saisie et déduire l'année universitaire par défaut.
 */

/** Saisie brute du formulaire unique de création de classe. */
export interface NewCohortInput {
  readonly label: string;
  readonly academicYear: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

export const EMPTY_NEW_COHORT_INPUT: NewCohortInput = {
  label: "",
  academicYear: "",
  startsOn: "",
  endsOn: "",
};

/**
 * Les valeurs initiales du formulaire quand on REPREND une classe existante.
 *
 * Le piège que cette fonction existe pour éviter : `Cohort.startsOn` est
 * normalisée en date-heure ISO (« 2026-09-01T00:00:00.000Z ») par l'adaptateur,
 * alors qu'un `<input type="date">` n'accepte que « 2026-09-01 ». Passer la
 * valeur telle quelle affiche un champ VIDE — sans erreur, sans message — et
 * l'utilisateur croit que la classe n'a pas de dates.
 */
export function cohortFormInputFrom(cohort: {
  readonly label: string;
  readonly academicYear: string;
  readonly startsOn: string;
  readonly endsOn: string;
}): NewCohortInput {
  return {
    label: cohort.label,
    academicYear: cohort.academicYear,
    startsOn: toDateInputValue(cohort.startsOn),
    endsOn: toDateInputValue(cohort.endsOn),
  };
}

/** « 2026-09-01T00:00:00.000Z » ou « 2026-09-01 » → « 2026-09-01 ». */
export function toDateInputValue(value: string): string {
  return value.slice(0, 10);
}

export type NewCohortIssue = "label-required" | "dates-required" | "dates-order";

/** Vérifie la saisie : mêmes règles dans le concepteur et dans l'onglet Classes. */
export function validateNewCohort(input: NewCohortInput): readonly NewCohortIssue[] {
  const issues: NewCohortIssue[] = [];
  if (input.label.trim().length === 0) issues.push("label-required");
  if (input.startsOn.length === 0 || input.endsOn.length === 0) issues.push("dates-required");
  else if (input.endsOn < input.startsOn) issues.push("dates-order");
  return issues;
}

export const NEW_COHORT_ISSUE_LABELS_FR: Record<NewCohortIssue, string> = {
  "label-required": "Le nom de la classe est obligatoire.",
  "dates-required": "Indiquez une date de début et une date de fin.",
  "dates-order": "La date de fin doit suivre la date de début.",
};

/** Année universitaire déduite d'une date de début (septembre = bascule). */
export function academicYearFor(startsOn: string): string {
  const year = Number(startsOn.slice(0, 4));
  const month = Number(startsOn.slice(5, 7));
  if (!Number.isFinite(year) || year === 0) return "";
  const first = month >= 9 ? year : year - 1;
  return `${first}-${first + 1}`;
}
