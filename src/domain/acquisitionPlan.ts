/**
 * Plan d'acquisition : logique métier pure (aucun framework, aucun accès données).
 *
 * Le plan n'est PAS une seconde vérité métier : il dérive des acquis
 * (`Outcome`), des preuves (`Evidence`) et d'un calendrier de référence
 * (`PlanScheduleEntry`). Les quatre vues du Passeport (Liste, Kanban, Gantt,
 * Calendrier) consomment ce même modèle.
 */
import type { CohortId, IsoDateTime, OutcomeId, OutcomeNature, ProgramId } from "./types";
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

/* ------------------------------------------------------------------ */
/* Rétroplanning réel d'une promotion                                  */
/* ------------------------------------------------------------------ */

export type PlanMilestoneId = string & { readonly __brand?: "PlanMilestone" };

/**
 * Un jalon du rétroplanning d'une PROMOTION.
 *
 * Trois choses à ne pas perdre de vue, toutes portées par la table :
 *
 * 1. **Des rangs de semaine, jamais des dates.** `weekOffset` compte les
 *    semaines depuis le début du stage (0 = semaine d'accueil). Rejouer le même
 *    rétroplanning l'année suivante ne demande donc que de changer la date de la
 *    promotion, pas de ressaisir six échéances.
 * 2. **Une période est facultative.** `weekOffsetEnd` absent = jalon ponctuel
 *    (« semaine 4 ») ; présent = jalon étalé (« semaines 4 à 6 »).
 * 3. **`official` n'est pas décoratif.** Il décide si l'étudiant peut déplacer
 *    ce jalon : c'est exactement `approvalRuleForImpact` — `official_deadline`
 *    exige un enseignant, `personal_pace` est accepté d'office.
 *
 * Un jalon appartient à une cohorte, pas à un programme : « semaine 4 » n'a de
 * sens que pour un stage donné.
 */
export interface PlanMilestone {
  readonly id: PlanMilestoneId;
  readonly cohortId: CohortId;
  readonly programId: ProgramId;
  readonly label: string;
  readonly weekOffset: number;
  readonly weekOffsetEnd?: number;
  readonly official: boolean;
  readonly position: number;
  /** Acquis attendus à ce jalon. Ils héritent de sa date. */
  readonly outcomeIds: readonly OutcomeId[];
}

/**
 * Bornes acceptées par la base (`check (week_offset between 0 and 104)`).
 * Reprises ici pour que l'écran refuse AVANT l'aller-retour, sans pour autant
 * être la seule barrière : la contrainte SQL reste l'autorité.
 */
export const PLAN_MILESTONE_MIN_WEEK = 0;
export const PLAN_MILESTONE_MAX_WEEK = 104;

export type PlanMilestoneIssue =
  "label_manquant" | "semaine_hors_bornes" | "fin_hors_bornes" | "fin_avant_debut";

export const PLAN_MILESTONE_ISSUE_LABELS_FR: Record<PlanMilestoneIssue, string> = {
  label_manquant: "Le jalon doit porter un intitulé.",
  semaine_hors_bornes: `La semaine de début doit être comprise entre ${PLAN_MILESTONE_MIN_WEEK} et ${PLAN_MILESTONE_MAX_WEEK}.`,
  fin_hors_bornes: `La semaine de fin doit être comprise entre ${PLAN_MILESTONE_MIN_WEEK} et ${PLAN_MILESTONE_MAX_WEEK}.`,
  fin_avant_debut: "La fin de la période précède son début.",
};

/**
 * Ce qui empêche d'enregistrer un jalon. Liste vide = enregistrable.
 *
 * Même règle que partout ailleurs dans ce projet : l'écran vérifie pour
 * expliquer, la base vérifie pour garantir. On ne remplace pas l'une par
 * l'autre.
 */
export function validatePlanMilestone(input: {
  readonly label: string;
  readonly weekOffset: number;
  readonly weekOffsetEnd?: number;
}): readonly PlanMilestoneIssue[] {
  const issues: PlanMilestoneIssue[] = [];
  if (input.label.trim() === "") issues.push("label_manquant");
  if (
    !Number.isInteger(input.weekOffset) ||
    input.weekOffset < PLAN_MILESTONE_MIN_WEEK ||
    input.weekOffset > PLAN_MILESTONE_MAX_WEEK
  ) {
    issues.push("semaine_hors_bornes");
  }
  if (input.weekOffsetEnd !== undefined) {
    if (
      !Number.isInteger(input.weekOffsetEnd) ||
      input.weekOffsetEnd < PLAN_MILESTONE_MIN_WEEK ||
      input.weekOffsetEnd > PLAN_MILESTONE_MAX_WEEK
    ) {
      issues.push("fin_hors_bornes");
    } else if (input.weekOffsetEnd < input.weekOffset) {
      issues.push("fin_avant_debut");
    }
  }
  return issues;
}

/**
 * La date réelle d'un rang de semaine, pour une promotion donnée.
 *
 * C'est la seule fonction qui transforme un rang en date, et elle est ici —
 * dans le domaine — plutôt que dans un écran : le passeport de l'étudiant, le
 * pilotage et le Concepteur doivent tous les trois lire la même date.
 */
export function milestoneDateFor(cohortStartsOn: IsoDateTime, weekOffset: number): IsoDateTime {
  const start = new Date(cohortStartsOn);
  start.setUTCDate(start.getUTCDate() + weekOffset * 7);
  return start.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Ce qu'un enregistrement de rétroplanning va faire                   */
/* ------------------------------------------------------------------ */

/**
 * Ce que le concepteur a décidé pour un chapitre, tel qu'il est saisi.
 *
 * Les semaines sont des CHAÎNES parce qu'elles viennent d'un champ de saisie :
 * « » (vide) et « 4 » ne sont pas la même chose, et convertir trop tôt ferait
 * passer un champ vide pour la semaine 0 — soit la semaine d'accueil, ce qui
 * est une vraie valeur.
 */
export type MilestoneTiming =
  | { readonly kind: "undated" }
  | { readonly kind: "week"; readonly from: string }
  | { readonly kind: "period"; readonly from: string; readonly to: string };

export interface MilestoneWrite {
  readonly themeId: string;
  readonly label: string;
  readonly weekOffset: number;
  readonly weekOffsetEnd?: number;
  /** Jalon déjà enregistré à reprendre. Absent = création. */
  readonly milestoneId?: PlanMilestoneId;
}

export interface MilestonePlanIntent {
  /** Jalons à créer ou à reprendre, dans l'ordre des chapitres. */
  readonly toWrite: readonly MilestoneWrite[];
  /** Jalons enregistrés que le concepteur vient de repasser en « non daté ». */
  readonly toDelete: readonly PlanMilestone[];
  /** Jalons enregistrés qu'aucun chapitre ne réclame — un chapitre renommé. */
  readonly orphans: readonly PlanMilestone[];
}

function parsedWeek(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/**
 * Ce qu'un clic sur « Enregistrer » va réellement faire.
 *
 * Cette fonction est ici, et pas dans l'écran, pour une raison précise : elle
 * décide de SUPPRESSIONS. Un chapitre repassé en « non daté » doit voir son
 * jalon disparaître — sinon « non daté » mentirait, l'échéance resterait dans
 * le passeport de l'étudiant, et rien à l'écran ne le dirait. Mais une
 * suppression qu'on ne peut pas rejouer dans un test est une suppression qu'on
 * ne peut pas garantir.
 *
 * Ce qu'elle ne fait JAMAIS : supprimer un jalon orphelin. Un chapitre renommé
 * laisse derrière lui un jalon que plus aucun libellé ne réclame ; l'effacer
 * d'office ferait perdre un travail de planification sur un simple renommage.
 * Il est rendu à part, pour que l'écran le montre et laisse décider.
 */
export function planMilestoneIntent(
  themes: readonly { readonly id: string; readonly label: string }[],
  timings: Readonly<Record<string, MilestoneTiming>>,
  existing: readonly PlanMilestone[],
): MilestonePlanIntent {
  const toWrite: MilestoneWrite[] = [];
  const toDelete: PlanMilestone[] = [];

  for (const theme of themes) {
    const timing = timings[theme.id] ?? { kind: "undated" };
    const saved = existing.find((milestone) => milestone.label === theme.label);
    const from = timing.kind === "undated" ? undefined : parsedWeek(timing.from);

    if (from === undefined) {
      // « Non daté », ou une semaine pas encore saisie : dans les deux cas le
      // chapitre ne porte pas d'échéance. S'il en avait une, elle s'en va.
      if (saved) toDelete.push(saved);
      continue;
    }

    const to = timing.kind === "period" ? parsedWeek(timing.to) : undefined;
    toWrite.push({
      themeId: theme.id,
      label: theme.label,
      weekOffset: from,
      ...(to === undefined ? {} : { weekOffsetEnd: to }),
      ...(saved ? { milestoneId: saved.id } : {}),
    });
  }

  const orphans = existing.filter(
    (milestone) => !themes.some((theme) => theme.label === milestone.label),
  );

  return { toWrite, toDelete, orphans };
}

/**
 * L'ordre dans lequel l'écran présente les chapitres : chronologique.
 *
 * Il se calcule sur les jalons ENREGISTRÉS, jamais sur la saisie en cours.
 * C'est la raison d'être de cette fonction : trier au fil de la frappe ferait
 * sauter les lignes sous le doigt — on tape « 9 » dans un chapitre, il part
 * douze lignes plus bas, et le champ suivant n'est plus là où on le cherchait.
 * L'ordre ne bouge donc qu'au chargement et après un enregistrement, ce qui
 * est exactement ce que demande Stef le 02/09.
 *
 * Les chapitres SANS jalon enregistré vont à la fin, dans l'ordre du
 * référentiel : ils n'ont pas de place dans une chronologie, et les
 * intercaler à l'ordre du référentiel mêlerait deux logiques de tri dans une
 * même liste.
 */
export function chronologicalThemeOrder<
  T extends { readonly id: string; readonly label: string; readonly position: number },
>(themes: readonly T[], existing: readonly PlanMilestone[]): readonly T[] {
  const weekOf = new Map<string, number>();
  for (const milestone of existing) weekOf.set(milestone.label, milestone.weekOffset);

  return [...themes].sort((a, b) => {
    const wa = weekOf.get(a.label);
    const wb = weekOf.get(b.label);
    if (wa === undefined && wb === undefined) return a.position - b.position;
    if (wa === undefined) return 1;
    if (wb === undefined) return -1;
    if (wa !== wb) return wa - wb;
    return a.position - b.position;
  });
}

export interface MilestoneGanttBar {
  readonly id: PlanMilestoneId;
  readonly label: string;
  readonly weekStart: number;
  /** Égale `weekStart` pour un jalon ponctuel : une barre a toujours une fin. */
  readonly weekEnd: number;
  readonly startsOn: IsoDateTime;
  readonly endsOn: IsoDateTime;
  readonly official: boolean;
  readonly outcomeCount: number;
}

export interface MilestoneGantt {
  /** Dernière semaine de l'échelle. L'échelle part toujours de la semaine 0. */
  readonly lastWeek: number;
  readonly bars: readonly MilestoneGanttBar[];
}

/**
 * Le rétroplanning vu comme des barres sur une échelle de semaines.
 *
 * L'échelle part de la semaine 0 — le début du stage — et non de la première
 * semaine occupée : un rétroplanning qui ne commence qu'en semaine 3 doit se
 * VOIR comme tel, et une échelle qui se recale sur son contenu effacerait
 * précisément ce qu'on cherche à lire.
 *
 * Elle s'arrête au dernier jalon. Ce sera la fin réelle de la promotion quand
 * le nombre de semaines d'apprentissage sera calculé (point 1 du 02/09) ;
 * aujourd'hui rien en base ne dit où le stage s'arrête, donc l'échelle ne
 * peut pas le prétendre.
 */
export function milestoneGantt(
  milestones: readonly PlanMilestone[],
  cohortStartsOn: IsoDateTime,
): MilestoneGantt {
  const bars = [...milestones]
    .map((milestone) => {
      const weekEnd = milestone.weekOffsetEnd ?? milestone.weekOffset;
      return {
        id: milestone.id,
        label: milestone.label,
        weekStart: milestone.weekOffset,
        weekEnd,
        startsOn: milestoneDateFor(cohortStartsOn, milestone.weekOffset),
        endsOn: milestoneDateFor(cohortStartsOn, weekEnd),
        official: milestone.official,
        outcomeCount: milestone.outcomeIds.length,
      };
    })
    .sort((a, b) => {
      if (a.weekStart !== b.weekStart) return a.weekStart - b.weekStart;
      if (a.weekEnd !== b.weekEnd) return a.weekEnd - b.weekEnd;
      return a.label.localeCompare(b.label, "fr");
    });

  // Une échelle de largeur nulle rendrait des barres invisibles : au moins une
  // semaine, même quand tout est posé en semaine 0.
  const lastWeek = Math.max(1, ...bars.map((bar) => bar.weekEnd));
  return { lastWeek, bars };
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

/**
 * Contexte minimal nécessaire pour dériver la règle sans ambiguïté.
 * Par défaut, un impact clinique est supposé rattaché à un stage : le
 * comportement existant de l'interface reste inchangé.
 */
export interface PlanChangeApprovalContext {
  readonly hasPlacementAssignment?: boolean;
}

/**
 * Règle d'approbation dérivée de l'impact déclaré.
 *
 * Miroir de `derive_plan_change_request_impact()` (docs/database/draft §7) :
 * un impact clinique SANS stage assigné ne peut pas exiger un encadrant, sinon
 * la demande serait indécidable. Dans ce cas, enseignant/administrateur statue
 * provisoirement sur le calendrier — jamais sur l'acquisition.
 */
export function approvalRuleForImpact(
  impact: PlanChangeImpact,
  context: PlanChangeApprovalContext = {},
): PlanApprovalRule {
  switch (impact) {
    case "personal_pace":
      return "auto_accept";
    case "clinical_competence":
      return context.hasPlacementAssignment === false ? "teacher_or_admin" : "placement_supervisor";
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
