/**
 * Comptabilité des crédits IA PAR ENSEIGNEMENT — MODÈLE DE DOMAINE (maquette).
 *
 * Objectif : rendre chaque usage IA imputable à un enseignement (programme,
 * version de cursus, promotion) avant toute activation réelle. Aucun appel IA
 * n'est émis dans cette itération : toutes les consommations ci-dessous sont
 * des écritures de démonstration. La comptabilité réelle sera alimentée par le
 * gateway propriétaire (quotas, journalisation, coûts) et non par le client.
 */
import type { CohortId, CurriculumVersionId, IsoDateTime, ProgramId } from "@/domain/types";
import type { AiTier, ContentAiMode } from "@/domain/contentAi";
import { AI_TIER_LABELS_FR, plannedTierForMode } from "@/domain/contentAi";

export type AiCreditEntryId = string;

/** Qui a déclenché l'usage : la comptabilité reste contextualisée par rôle. */
export type AiCreditActorRole = "learner" | "supervisor" | "teacher" | "admin";

export const AI_CREDIT_ACTOR_LABELS_FR: Record<AiCreditActorRole, string> = {
  learner: "Apprenant",
  supervisor: "Encadrant de stage",
  teacher: "Enseignant",
  admin: "Administrateur",
};

/**
 * Coût indicatif en crédits d'une unité d'usage par palier.
 * Valeurs de conception, à recalibrer sur les mesures réelles du gateway.
 */
export const CREDIT_UNIT_COST_BY_TIER: Record<AiTier, number> = {
  none: 0,
  light_model: 1,
  advanced_model: 4,
  realtime_voice: 12,
};

/** Écriture de consommation : immuable, toujours rattachée à un enseignement. */
export interface AiCreditEntry {
  readonly id: AiCreditEntryId;
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  readonly cohortId: CohortId;
  readonly mode: ContentAiMode;
  readonly tier: AiTier;
  readonly actorRole: AiCreditActorRole;
  readonly occurredAt: IsoDateTime;
  /** Nombre d'unités facturables (questions, minutes de vocal, etc.). */
  readonly units: number;
  readonly credits: number;
  /** Support pédagogique à l'origine de l'usage, quand il est connu. */
  readonly mediaId?: string;
  /** Invariant de maquette : aucune mesure réelle. */
  readonly meteringActivated: false;
}

/** Enveloppe budgétaire déclarée par enseignement et par période. */
export interface AiCreditBudget {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  /** Libellé de période comptable, ex. « Année 2026-2027 ». */
  readonly periodLabel: string;
  readonly allocatedCredits: number;
  /** Seuil d'alerte (0-1) déclenchant un avertissement administrateur. */
  readonly warningRatio: number;
  /** Plafond dur : au-delà, les usages sont refusés par le gateway. */
  readonly hardCapCredits: number;
  /** Vocal temps réel autorisé pour cet enseignement. */
  readonly voiceAllowed: boolean;
  readonly note?: string;
}

export type AiCreditBudgetState = "ok" | "warning" | "exceeded" | "capped";

export const AI_CREDIT_BUDGET_STATE_LABELS_FR: Record<AiCreditBudgetState, string> = {
  ok: "Dans l'enveloppe",
  warning: "Seuil d'alerte atteint",
  exceeded: "Enveloppe dépassée",
  capped: "Plafond dur atteint",
};

export interface AiCreditBreakdownRow<TKey extends string> {
  readonly key: TKey;
  readonly label: string;
  readonly credits: number;
  readonly units: number;
  readonly share: number;
}

export interface AiCreditAccount {
  readonly programId: ProgramId;
  readonly budget: AiCreditBudget | undefined;
  readonly totalCredits: number;
  readonly totalUnits: number;
  readonly entryCount: number;
  readonly consumedRatio: number;
  readonly remainingCredits: number;
  readonly state: AiCreditBudgetState;
  readonly byTier: readonly AiCreditBreakdownRow<AiTier>[];
  readonly byMode: readonly AiCreditBreakdownRow<ContentAiMode>[];
  readonly byCohort: readonly AiCreditBreakdownRow<CohortId>[];
  readonly byActorRole: readonly AiCreditBreakdownRow<AiCreditActorRole>[];
  readonly byMonth: readonly AiCreditBreakdownRow<string>[];
  /** Invariant de maquette. */
  readonly meteringActivated: false;
}

/** Coût attendu d'un usage : palier déduit du mode, jamais saisi librement. */
export function expectedCreditsFor(mode: ContentAiMode, units: number): number {
  return CREDIT_UNIT_COST_BY_TIER[plannedTierForMode(mode)] * Math.max(0, units);
}

/** Vrai si l'écriture respecte le palier attendu et le barème du palier. */
export function isEntryConsistent(entry: AiCreditEntry): boolean {
  if (entry.units <= 0 || entry.credits < 0) return false;
  if (entry.tier !== plannedTierForMode(entry.mode)) return false;
  return entry.credits === CREDIT_UNIT_COST_BY_TIER[entry.tier] * entry.units;
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

function group<TKey extends string>(
  entries: readonly AiCreditEntry[],
  keyOf: (entry: AiCreditEntry) => TKey,
  labelOf: (key: TKey) => string,
  total: number,
): readonly AiCreditBreakdownRow<TKey>[] {
  const map = new Map<TKey, { credits: number; units: number }>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const current = map.get(key) ?? { credits: 0, units: 0 };
    map.set(key, { credits: current.credits + entry.credits, units: current.units + entry.units });
  }
  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      label: labelOf(key),
      credits: value.credits,
      units: value.units,
      share: ratio(value.credits, total),
    }))
    .sort((a, b) => b.credits - a.credits || a.key.localeCompare(b.key));
}

export function budgetStateFor(
  budget: AiCreditBudget | undefined,
  totalCredits: number,
): AiCreditBudgetState {
  if (!budget) return "ok";
  if (totalCredits >= budget.hardCapCredits) return "capped";
  if (totalCredits > budget.allocatedCredits) return "exceeded";
  if (totalCredits >= budget.allocatedCredits * budget.warningRatio) return "warning";
  return "ok";
}

/** Agrégation comptable d'un enseignement (programme + version de cursus). */
export function buildAiCreditAccount(
  programId: ProgramId,
  entries: readonly AiCreditEntry[],
  budget: AiCreditBudget | undefined,
  labels: {
    readonly cohort: (cohortId: CohortId) => string;
    readonly mode: (mode: ContentAiMode) => string;
  },
): AiCreditAccount {
  const scoped = entries.filter((e) => e.programId === programId);
  const totalCredits = scoped.reduce((sum, e) => sum + e.credits, 0);
  const totalUnits = scoped.reduce((sum, e) => sum + e.units, 0);

  return {
    programId,
    budget,
    totalCredits,
    totalUnits,
    entryCount: scoped.length,
    consumedRatio: ratio(totalCredits, budget?.allocatedCredits ?? 0),
    remainingCredits: Math.max(0, (budget?.allocatedCredits ?? 0) - totalCredits),
    state: budgetStateFor(budget, totalCredits),
    byTier: group(scoped, (e) => e.tier, (k) => AI_TIER_LABELS_FR[k], totalCredits),
    byMode: group(scoped, (e) => e.mode, labels.mode, totalCredits),
    byCohort: group(scoped, (e) => e.cohortId, labels.cohort, totalCredits),
    byActorRole: group(
      scoped,
      (e) => e.actorRole,
      (k) => AI_CREDIT_ACTOR_LABELS_FR[k],
      totalCredits,
    ),
    byMonth: group(scoped, (e) => e.occurredAt.slice(0, 7), (k) => k, totalCredits),
    meteringActivated: false,
  };
}

/** Projection linéaire simple de fin de période (aide à la décision, non normative). */
export function projectPeriodCredits(
  account: AiCreditAccount,
  monthsElapsed: number,
  monthsInPeriod: number,
): number {
  if (monthsElapsed <= 0 || monthsInPeriod <= 0) return account.totalCredits;
  return Math.round((account.totalCredits / monthsElapsed) * monthsInPeriod);
}

export const AI_CREDITS_MOCK_NOTICE_FR =
  "Comptabilité de démonstration : aucun appel IA n'est émis, aucune consommation réelle n'est mesurée";

export const AI_CREDITS_GOVERNANCE_NOTICE_FR =
  "À l'activation, seuls le gateway propriétaire et le serveur écrivent ces écritures ; le client ne peut ni créer ni modifier une consommation";
