/**
 * Logique métier pure : calcul du niveau de maîtrise à partir des preuves.
 *
 * Invariant central du socle :
 *   une compétence RÉELLE ne peut jamais être acquise par auto-déclaration.
 */
import {
  MASTERY_ORDER,
  type Evidence,
  type MasteryLevel,
  type Outcome,
  type OutcomeNature,
} from "./types";

export function masteryRank(level: MasteryLevel): number {
  return MASTERY_ORDER.indexOf(level);
}

export function isAtLeast(level: MasteryLevel, target: MasteryLevel): boolean {
  return masteryRank(level) >= masteryRank(target);
}

/**
 * Un tiers autorisé (jamais l'apprenant) a-t-il explicitement validé la preuve ?
 * La portée du validateur est vérifiée séparément par `canValidateEvidence`.
 */
export function hasThirdPartyValidation(evidence: Evidence): boolean {
  return evidence.validations.some((v) => v.decision === "validated");
}

/**

 * Une preuve compte-t-elle pour l'acquis visé ?
 *
 * Compétence réelle : une auto-déclaration SEULE ne compte jamais, mais une
 * activité réelle ou un stage saisi par l'apprenant compte dès qu'un tiers
 * autorisé (encadrant, enseignant, administrateur) l'a explicitement validé.
 */
export function isCountableEvidence(evidence: Evidence, nature: OutcomeNature): boolean {
  if (evidence.status !== "validated") return false;

  if (nature === "real_competence") {
    const authenticContext = evidence.kind === "real_activity" || evidence.kind === "placement";
    return authenticContext && hasThirdPartyValidation(evidence);
  }

  if (nature === "simulated_competence") {
    return evidence.kind === "simulation" || evidence.kind === "human_validation";
  }

  return evidence.kind === "quiz" || evidence.kind === "human_validation";
}

export interface OutcomeProgress {
  readonly outcome: Outcome;
  readonly mastery: MasteryLevel;
  readonly countedEvidence: readonly Evidence[];
  readonly pendingEvidence: readonly Evidence[];
  readonly blockedBySelfDeclaration: boolean;
  readonly meetsTarget: boolean;
}

/**
 * Progression déterministe (aucune IA) : le niveau croît avec le nombre de
 * preuves recevables, plafonné pour les compétences réelles sans validateur.
 */
export function computeOutcomeProgress(
  outcome: Outcome,
  evidence: readonly Evidence[],
): OutcomeProgress {
  const related = evidence.filter((e) => e.outcomeId === outcome.id);
  const counted = related.filter((e) => isCountableEvidence(e, outcome.nature));
  const pending = related.filter((e) => e.status === "submitted" || e.status === "draft");

  // Auto-déclaration en attente d'un tiers : signalée, jamais comptée.
  const blockedBySelfDeclaration =
    outcome.nature === "real_competence" &&
    related.some((e) => e.selfDeclared && !hasThirdPartyValidation(e));

  let mastery: MasteryLevel = "not_started";
  if (counted.length >= 1) mastery = "novice";
  if (counted.length >= 2) mastery = "intermediate";
  if (counted.length >= 3) mastery = "proficient";
  if (counted.length >= 4) mastery = "autonomous";

  return {
    outcome,
    mastery,
    countedEvidence: counted,
    pendingEvidence: pending,
    blockedBySelfDeclaration,
    meetsTarget: isAtLeast(mastery, outcome.targetMastery),
  };
}

export interface ProgressSummary {
  readonly total: number;
  readonly atTarget: number;
  readonly inProgress: number;
  readonly notStarted: number;
  readonly percentAtTarget: number;
}

export function summarizeProgress(items: readonly OutcomeProgress[]): ProgressSummary {
  const total = items.length;
  const atTarget = items.filter((i) => i.meetsTarget).length;
  const notStarted = items.filter((i) => i.mastery === "not_started").length;
  return {
    total,
    atTarget,
    inProgress: total - atTarget - notStarted,
    notStarted,
    percentAtTarget: total === 0 ? 0 : Math.round((atTarget / total) * 100),
  };
}

export const MASTERY_LABELS_FR: Record<MasteryLevel, string> = {
  not_started: "Non commencé",
  novice: "Découverte",
  intermediate: "Intermédiaire",
  proficient: "Maîtrise",
  autonomous: "Autonome",
};

export const NATURE_LABELS_FR: Record<OutcomeNature, string> = {
  knowledge: "Connaissance",
  simulated_competence: "Compétence simulée",
  real_competence: "Compétence réelle",
};
