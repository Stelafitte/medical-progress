/**
 * Le sceau d'une promotion : ce qui autorise à l'ouvrir, et ce qu'on en dit.
 *
 * POURQUOI UN SCEAU. Vérifié le 02/09 : rien dans l'application ne modifiait
 * jamais `cohorts.status`. Les cinq valeurs de l'enum existaient depuis le
 * 21/08 sans que personne les écrive — toutes les promotions étaient en
 * brouillon, et « valider mon programme » ne voulait rien dire.
 *
 * CE QU'IL N'EST PAS : un verrou. Ouvrir ne ferme aucun écran de conception —
 * Stef, le 02/09 : « il faudrait que oui à n'importe quel moment ». Ce qui
 * change, c'est que la promotion cesse d'être un brouillon pour le reste du
 * produit, et que son modèle de curriculum se fige.
 *
 * CE QUI LUI DONNE SA VALEUR : ses refus. Un sceau qu'on peut apposer sur
 * n'importe quoi ne certifie rien. Les règles ci-dessous sont les mêmes que
 * celles de `open_cohort` en base — ici pour être DITES avant l'aller-retour,
 * là-bas pour être vraies. Le serveur reste l'autorité.
 */
import type { CohortStatus } from "@/domain/types";

export type CohortOpeningIssue =
  "promotion_pas_en_conception" | "aucun_jalon" | "aucun_acquis" | "jalon_hors_promotion";

export const COHORT_OPENING_ISSUE_LABELS_FR: Record<CohortOpeningIssue, string> = {
  promotion_pas_en_conception: "Cette promotion n'est plus en conception : elle est déjà ouverte.",
  aucun_jalon:
    "Aucun jalon sur cette promotion : le passeport des apprenants serait vide le jour de l'ouverture.",
  aucun_acquis: "Aucun acquis n'est rattaché aux jalons : les échéances seraient des dates vides.",
  jalon_hors_promotion:
    "Un jalon est posé après le dernier jour du stage : corrigez-le avant d'ouvrir.",
};

/** Ce que l'ouverture a fait, ou ferait. Rendu par `open_cohort`. */
export interface CohortOpeningReport {
  readonly milestones: number;
  readonly outcomes: number;
  /** Jalons dont plus aucun acquis n'est retenu. Ils n'empêchent pas d'ouvrir. */
  readonly emptyMilestones: number;
  /** La version de curriculum est passée de brouillon à active. */
  readonly versionActivated: boolean;
}

/**
 * Ce qui empêche d'ouvrir. Liste vide = ouvrable.
 *
 * `promotionLastWeek` absent (dates inconnues) ne fabrique pas un refus : on ne
 * bloque pas sur une donnée qu'on n'a pas, le serveur tranchera.
 */
export function cohortOpeningIssues(input: {
  readonly status: CohortStatus;
  readonly milestoneCount: number;
  readonly outcomeCount: number;
  /** Semaine de fin du jalon le plus tardif. Absente s'il n'y a aucun jalon. */
  readonly lastMilestoneWeek?: number;
  readonly promotionLastWeek?: number;
}): readonly CohortOpeningIssue[] {
  const issues: CohortOpeningIssue[] = [];

  if (input.status !== "draft") issues.push("promotion_pas_en_conception");

  // Un seul des deux : « aucun acquis » sur une promotion sans jalon serait un
  // second reproche pour un seul manque, et le concepteur corrigerait deux fois.
  if (input.milestoneCount === 0) issues.push("aucun_jalon");
  else if (input.outcomeCount === 0) issues.push("aucun_acquis");

  if (
    input.lastMilestoneWeek !== undefined &&
    input.promotionLastWeek !== undefined &&
    input.lastMilestoneWeek > input.promotionLastWeek
  ) {
    issues.push("jalon_hors_promotion");
  }

  return issues;
}

/** Le sceau ne se retire que depuis « ouverte » : au-delà, la promotion a une histoire. */
export function canRevertToDraft(status: CohortStatus): boolean {
  return status === "open";
}

export function describeOpeningReport(
  report: CohortOpeningReport,
  options: { readonly dryRun?: boolean } = {},
): string {
  const head =
    options.dryRun === true
      ? `Ouvrirait la promotion sur ${report.milestones} jalon(s) et ${report.outcomes} acquis.`
      : `Promotion ouverte : ${report.milestones} jalon(s), ${report.outcomes} acquis.`;
  const parts = [head];

  if (report.emptyMilestones > 0) {
    // Signalé, jamais bloquant : un chapitre daté dont les acquis sont sortis du
    // parcours reste une intention lisible. C'est au concepteur de trancher.
    parts.push(
      `${report.emptyMilestones} jalon(s) ne portent aucun acquis retenu — daté sans contenu.`,
    );
  }
  if (report.versionActivated) {
    parts.push(
      options.dryRun === true
        ? "Le modèle de curriculum passerait de brouillon à actif : son nom et ses objectifs se figeraient."
        : "Le modèle de curriculum est passé de brouillon à actif : son nom et ses objectifs sont figés.",
    );
  }

  return parts.join(" ");
}
