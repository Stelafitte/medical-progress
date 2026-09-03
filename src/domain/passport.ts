import type { EnrollmentId, IsoDateTime, MasteryLevel, OutcomeId, PersonId } from "@/domain/types";

/**
 * Ce que l'apprenant DÉCLARE sur un acquis de son parcours.
 *
 * POURQUOI CE N'EST PAS UNE `Evidence`. Une preuve atteste d'un fait — un
 * geste réalisé, une évaluation passée, un stage validé. Une déclaration
 * n'atteste de rien : elle dit où l'apprenant estime en être. Les confondre
 * reviendrait à faire reposer l'invariant « une compétence réelle ne
 * s'auto-déclare pas » sur du code d'affichage, alors qu'il doit tenir dans le
 * modèle. La table `outcome_self_reports` porte d'ailleurs
 * `unique (enrollment_id, outcome_id)` : UNE déclaration par acquis, révisable
 * — là où les preuves s'accumulent.
 *
 * La validation par un senior est OPTIONNELLE et vit sur la même ligne : c'est
 * l'état « à valider » du passeport tant qu'elle est absente. Elle est annulée
 * automatiquement en base dès que l'apprenant change sa déclaration — sinon un
 * niveau validé pourrait se voir relevé après coup sans que personne ne l'ait
 * revu.
 */
export interface OutcomeSelfReport {
  readonly enrollmentId: EnrollmentId;
  readonly outcomeId: OutcomeId;
  readonly declaredLevel: MasteryLevel;
  readonly declaredAt: IsoDateTime;
  readonly note: string;
  readonly validatedBy?: PersonId;
  readonly validatedAt?: IsoDateTime;
}

/** Une déclaration confirmée par un tiers habilité. */
export function isValidated(report: OutcomeSelfReport): boolean {
  return report.validatedAt !== undefined;
}
