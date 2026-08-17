/**
 * Plan d'acquisition : logique métier pure (aucun framework, aucun accès données).
 *
 * Le plan n'est PAS une seconde vérité métier : il dérive des acquis
 * (`Outcome`), des preuves (`Evidence`) et d'un calendrier de référence
 * (`PlanScheduleEntry`). Les quatre vues du Passeport (Liste, Kanban, Gantt,
 * Calendrier) consomment ce même modèle.
 */
import type { IsoDateTime, OutcomeId, OutcomeNature } from "./types";
import type { MasteryLevel } from "./types";
import { masteryRank, type OutcomeProgress } from "./mastery";

/** Deux plans distincts demandés : connaissances vs compétences. */
export type AcquisitionTrack = "knowledge" | "competence";

/** Colonnes Kanban. */
export type PlanItemStage = "to_plan" | "in_progress" | "to_validate" | "acquired";

/** Calendrier de référence d'un acquis (donnée de démonstration isolée). */
export interface PlanScheduleEntry {
  readonly outcomeId: OutcomeId;
  readonly startsOn: IsoDateTime;
  readonly dueOn: IsoDateTime;
  readonly milestoneLabel: string;
  /** Échéance institutionnelle (non déplaçable sans validation). */
  readonly official: boolean;
}

export interface AcquisitionPlanItem {
  readonly id: OutcomeId;
  readonly code: string;
  readonly label: string;
  readonly nature: OutcomeNature;
  readonly track: AcquisitionTrack;
  readonly stage: PlanItemStage;
  readonly mastery: MasteryLevel;
  readonly targetMastery: MasteryLevel;
  readonly progressPercent: number;
  readonly startsOn: IsoDateTime;
  readonly dueOn: IsoDateTime;
  readonly milestoneLabel: string;
  readonly officialDeadline: boolean;
  readonly requiresThirdPartyValidation: boolean;
  readonly countedEvidence: number;
  readonly pendingEvidence: number;
  /** Prérequis (ids d'acquis) — utilisé par la vue Gantt. */
  readonly dependsOn: readonly OutcomeId[];
}

export interface AcquisitionPlanTrack {
  readonly track: AcquisitionTrack;
  readonly label: string;
  readonly description: string;
  readonly items: readonly AcquisitionPlanItem[];
}

export const TRACK_LABELS_FR: Record<AcquisitionTrack, string> = {
  knowledge: "Plan d'acquisition des connaissances",
  competence: "Plan d'acquisition des compétences",
};

export const STAGE_LABELS_FR: Record<PlanItemStage, string> = {
  to_plan: "À planifier",
  in_progress: "En cours",
  to_validate: "À valider",
  acquired: "Acquis",
};

export const PLAN_STAGES: readonly PlanItemStage[] = [
  "to_plan",
  "in_progress",
  "to_validate",
  "acquired",
];

export function trackForNature(nature: OutcomeNature): AcquisitionTrack {
  return nature === "knowledge" ? "knowledge" : "competence";
}

/** Classement déterministe d'un acquis dans une colonne Kanban. */
export function stageForProgress(progress: OutcomeProgress): PlanItemStage {
  if (progress.meetsTarget) return "acquired";
  if (progress.pendingEvidence.length > 0 || progress.blockedBySelfDeclaration) {
    return "to_validate";
  }
  if (progress.countedEvidence.length > 0) return "in_progress";
  return "to_plan";
}

/** Avancement relatif au niveau cible (0–100, déterministe). */
export function progressPercent(mastery: MasteryLevel, target: MasteryLevel): number {
  const targetRank = masteryRank(target);
  if (targetRank <= 0) return 100;
  const ratio = Math.min(masteryRank(mastery) / targetRank, 1);
  return Math.round(ratio * 100);
}

/* ------------------------------------------------------------------ */
/* Demande de modification du plan                                     */
/* ------------------------------------------------------------------ */

/**
 * Nature de l'impact d'une demande, qui détermine seule la règle de validation.
 */
export type PlanChangeImpact = "personal_pace" | "official_deadline" | "clinical_competence";

export type PlanApprovalRule = "auto_accept" | "teacher_or_admin" | "placement_supervisor";

export type PlanChangeStatus = "draft" | "pending" | "accepted" | "rejected";

export const IMPACT_LABELS_FR: Record<PlanChangeImpact, string> = {
  personal_pace: "Organisation personnelle, sans impact institutionnel",
  official_deadline: "Échéance officielle, prérequis ou objectif obligatoire",
  clinical_competence: "Stage ou compétence clinique",
};

export const APPROVAL_RULE_LABELS_FR: Record<PlanApprovalRule, string> = {
  auto_accept: "Acceptation automatique (règle prévue, non active)",
  teacher_or_admin: "Validation enseignant ou administrateur",
  placement_supervisor: "Validation encadrant de stage",
};

export const PLAN_CHANGE_STATUS_LABELS_FR: Record<PlanChangeStatus, string> = {
  draft: "Brouillon",
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
};

/** Règle d'approbation dérivée de l'impact déclaré. */
export function approvalRuleForImpact(impact: PlanChangeImpact): PlanApprovalRule {
  switch (impact) {
    case "personal_pace":
      return "auto_accept";
    case "clinical_competence":
      return "placement_supervisor";
    case "official_deadline":
    default:
      return "teacher_or_admin";
  }
}

export interface PlanChangeRequestDraft {
  readonly itemId: OutcomeId;
  /** Nouvelle date souhaitée (ISO court, optionnelle si seul le rythme change). */
  readonly requestedDate?: string;
  /** Nouvel ordre / rythme souhaité, en texte libre. */
  readonly requestedPace?: string;
  readonly justification: string;
  readonly impact: PlanChangeImpact;
}

export interface PlanChangeRequest extends PlanChangeRequestDraft {
  readonly id: string;
  readonly approvalRule: PlanApprovalRule;
  readonly status: PlanChangeStatus;
  readonly createdAt: IsoDateTime;
  /** Prototype uniquement : aucune persistance, aucun envoi. */
  readonly simulated: true;
}

export type PlanChangeField = "justification" | "requestedDate";

/** Validation locale du formulaire : la justification est obligatoire. */
export function validatePlanChangeDraft(
  draft: PlanChangeRequestDraft,
): readonly { field: PlanChangeField; message: string }[] {
  const errors: { field: PlanChangeField; message: string }[] = [];
  if (draft.justification.trim().length === 0) {
    errors.push({ field: "justification", message: "La justification est obligatoire." });
  }
  if (!draft.requestedDate && !draft.requestedPace?.trim()) {
    errors.push({
      field: "requestedDate",
      message: "Indiquez une nouvelle date ou un nouveau rythme.",
    });
  }
  return errors;
}

/** Crée une demande locale (état React), jamais transmise à un backend. */
export function createPlanChangeRequest(
  draft: PlanChangeRequestDraft,
  now: IsoDateTime,
  id: string,
): PlanChangeRequest {
  return {
    ...draft,
    id,
    approvalRule: approvalRuleForImpact(draft.impact),
    // Une demande sans impact institutionnel resterait un brouillon accepté
    // automatiquement à l'avenir ; ici rien n'est envoyé, donc "draft".
    status: draft.impact === "personal_pace" ? "draft" : "pending",
    createdAt: now,
    simulated: true,
  };
}
