/**
 * Socle DÉTERMINISTE de comparaison des audits de pratiques A1 / A2 (module DPC).
 *
 * Périmètre strict :
 * - audits de PRATIQUES sur dossiers anonymes (A1 avant enseignement, A2 après) ;
 * - AUCUN lien avec les QCM de connaissances (pré-test / post-test) ;
 * - AUCUNE génération de texte, AUCUN appel IA, AUCUNE invention de donnée ;
 * - AUCUN profil H1/H2 (hors périmètre à ce stade).
 *
 * Toute égalité Oui/Non ou absence de réponse interprétable est remontée telle
 * quelle (`indeterminate` / `missing`) : l'arbitrage est humain, jamais IA.
 *
 * Ce module est additif : il ne remplace aucun calcul existant de `dpc.ts`.
 */
import type { DpcAnswer, DpcAuditRecord } from "./dpc";

/* ------------------------------------------------------------------ */
/* Paramétrage médical d'un critère (à valider humainement)            */
/* ------------------------------------------------------------------ */

/**
 * Paramètres médicaux d'un critère. Ils ne peuvent PAS être devinés :
 * tant qu'un expert ne les a pas validés, laisser `expectedAnswer` absent
 * (le critère est alors classé `indeterminate`, jamais supposé conforme).
 */
export interface DpcCriterionParams {
  readonly criterionId: string;
  /** Modalité attendue pour être conforme. Absent = non validé par l'expert. */
  readonly expectedAnswer?: Extract<DpcAnswer, "yes" | "no">;
  /** Item fondamental (incontournable) selon l'expert. */
  readonly fundamental?: boolean;
  /** Priorité pédagogique 1 (max) → 4 (min). */
  readonly priorityRank?: 1 | 2 | 3 | 4;
  /** Critères liés analysés conjointement (items pivots). */
  readonly pivotWith?: readonly string[];
}

export type DpcCriterionParamMap = Readonly<Record<string, DpcCriterionParams>>;

export function buildCriterionParamMap(
  params: readonly DpcCriterionParams[],
): DpcCriterionParamMap {
  const map: Record<string, DpcCriterionParams> = {};
  for (const p of params) map[p.criterionId] = p;
  return map;
}

/** Critères dont le paramétrage médical reste à valider par un expert. */
export function unvalidatedCriterionParams(
  criterionIds: readonly string[],
  params: DpcCriterionParamMap,
): readonly string[] {
  return criterionIds.filter((id) => {
    const p = params[id];
    return !p || p.expectedAnswer === undefined || p.priorityRank === undefined;
  });
}

/* ------------------------------------------------------------------ */
/* 1. Modalité représentative d'un critère pour un audit               */
/* ------------------------------------------------------------------ */

export type DpcModality = "yes" | "no" | "missing" | "indeterminate";

export interface DpcCriterionModality {
  readonly criterionId: string;
  readonly yes: number;
  readonly no: number;
  readonly notApplicable: number;
  /** Dénominateur interprétable = yes + no (les N/A sont exclus). */
  readonly interpretable: number;
  readonly modality: DpcModality;
}

/** Modalité majoritaire d'un critère sur un ensemble de dossiers. */
export function criterionModality(
  criterionId: string,
  records: readonly DpcAuditRecord[],
): DpcCriterionModality {
  let yes = 0;
  let no = 0;
  let notApplicable = 0;
  for (const record of records) {
    const answer = record.answers[criterionId];
    if (answer === "yes") yes += 1;
    else if (answer === "no") no += 1;
    else if (answer === "na") notApplicable += 1;
  }
  const interpretable = yes + no;
  const modality: DpcModality =
    interpretable === 0 ? "missing" : yes === no ? "indeterminate" : yes > no ? "yes" : "no";
  return { criterionId, yes, no, notApplicable, interpretable, modality };
}

/* ------------------------------------------------------------------ */
/* 2. Conformité (dépend de expectedAnswer, jamais « oui = conforme ») */
/* ------------------------------------------------------------------ */

/** Statut COMPARATIF de conformité d'un critère (qualitatif). */
export type DpcCriterionConformityStatus = "conform" | "non_conform" | "missing" | "indeterminate";

export function conformityOf(
  modality: DpcModality,
  expectedAnswer: DpcCriterionParams["expectedAnswer"],
): DpcCriterionConformityStatus {
  if (modality === "missing") return "missing";
  if (modality === "indeterminate") return "indeterminate";
  // Paramétrage médical non validé : on ne conclut pas.
  if (expectedAnswer === undefined) return "indeterminate";
  return modality === expectedAnswer ? "conform" : "non_conform";
}

/* ------------------------------------------------------------------ */
/* 3. Classification comparative                                       */
/* ------------------------------------------------------------------ */

export type DpcComparisonStatus =
  | "maintained"
  | "improved"
  | "regressed"
  | "persistent_gap"
  | "missing_a1"
  | "missing_a2"
  | "indeterminate";

export const DPC_COMPARISON_STATUS_LABELS_FR: Record<DpcComparisonStatus, string> = {
  maintained: "Acquis maintenu",
  improved: "Amélioration",
  regressed: "Régression",
  persistent_gap: "Écart résiduel",
  missing_a1: "Audit 1 non interprétable",
  missing_a2: "Audit 2 non interprétable",
  indeterminate: "Indéterminé (arbitrage humain requis)",
};

export interface DpcCriterionComparison {
  readonly criterionId: string;
  readonly a1: DpcCriterionModality;
  readonly a2: DpcCriterionModality;
  readonly a1Conformity: DpcCriterionConformityStatus;
  readonly a2Conformity: DpcCriterionConformityStatus;
  readonly status: DpcComparisonStatus;
  readonly fundamental: boolean;
  readonly priorityRank: 1 | 2 | 3 | 4 | undefined;
  readonly pivotWith: readonly string[];
  /** Paramétrage médical encore à valider par un expert. */
  readonly parametersPending: boolean;
}

function classify(
  a1: DpcCriterionConformityStatus,
  a2: DpcCriterionConformityStatus,
): DpcComparisonStatus {
  if (a1 === "missing") return "missing_a1";
  if (a2 === "missing") return "missing_a2";
  if (a1 === "indeterminate" || a2 === "indeterminate") return "indeterminate";
  if (a1 === "conform") return a2 === "conform" ? "maintained" : "regressed";
  return a2 === "conform" ? "improved" : "persistent_gap";
}

export function compareCriterion(
  criterionId: string,
  a1Records: readonly DpcAuditRecord[],
  a2Records: readonly DpcAuditRecord[],
  params: DpcCriterionParamMap = {},
): DpcCriterionComparison {
  const p = params[criterionId];
  const a1 = criterionModality(criterionId, a1Records);
  const a2 = criterionModality(criterionId, a2Records);
  const a1Conformity = conformityOf(a1.modality, p?.expectedAnswer);
  const a2Conformity = conformityOf(a2.modality, p?.expectedAnswer);
  return {
    criterionId,
    a1,
    a2,
    a1Conformity,
    a2Conformity,
    status: classify(a1Conformity, a2Conformity),
    fundamental: p?.fundamental === true,
    priorityRank: p?.priorityRank,
    pivotWith: p?.pivotWith ?? [],
    parametersPending: !p || p.expectedAnswer === undefined || p.priorityRank === undefined,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Synthèse déterministe                                            */
/* ------------------------------------------------------------------ */

export interface DpcFundamentalStatus {
  readonly criterionId: string;
  readonly a2Conformity: DpcCriterionConformityStatus;
}

export interface DpcAuditComparisonSummary {
  readonly maintainedCount: number;
  readonly improvedCount: number;
  readonly regressedCount: number;
  readonly persistentGapCount: number;
  /** Critères manquants (A1 ou A2) OU indéterminés. */
  readonly missingOrIndeterminateCount: number;
  /** Conformité des items fondamentaux à A2 (aucune extrapolation). */
  readonly fundamentals: readonly DpcFundamentalStatus[];
  readonly fundamentalsConformAtA2: number;
  readonly fundamentalsTotal: number;
  readonly improvements: readonly DpcCriterionComparison[];
  readonly regressions: readonly DpcCriterionComparison[];
  readonly persistentGaps: readonly DpcCriterionComparison[];
  /** A2 incomplet : interdit toute conclusion sur l'efficacité de la formation. */
  readonly a2Incomplete: boolean;
  readonly efficacyConclusionAllowed: false | true;
  readonly criteriaPendingValidation: readonly string[];
}

/** Priorisation déterministe : rang 1→4 puis rang absent, puis id (stable). */
function prioritize(rows: readonly DpcCriterionComparison[]): readonly DpcCriterionComparison[] {
  return [...rows].sort((a, b) => {
    if (a.fundamental !== b.fundamental) return a.fundamental ? -1 : 1;
    const ra = a.priorityRank ?? 99;
    const rb = b.priorityRank ?? 99;
    if (ra !== rb) return ra - rb;
    return a.criterionId.localeCompare(b.criterionId);
  });
}

export interface DpcAuditComparison {
  readonly criteria: readonly DpcCriterionComparison[];
  readonly summary: DpcAuditComparisonSummary;
}

export function compareAudits(
  criterionIds: readonly string[],
  a1Records: readonly DpcAuditRecord[],
  a2Records: readonly DpcAuditRecord[],
  params: DpcCriterionParamMap = {},
): DpcAuditComparison {
  const criteria = criterionIds.map((id) => compareCriterion(id, a1Records, a2Records, params));
  const count = (status: DpcComparisonStatus) => criteria.filter((c) => c.status === status).length;
  const fundamentals = criteria
    .filter((c) => c.fundamental)
    .map((c) => ({ criterionId: c.criterionId, a2Conformity: c.a2Conformity }));
  const a2Incomplete = a2Records.length === 0 || criteria.some((c) => c.a2.interpretable === 0);
  return {
    criteria,
    summary: {
      maintainedCount: count("maintained"),
      improvedCount: count("improved"),
      regressedCount: count("regressed"),
      persistentGapCount: count("persistent_gap"),
      missingOrIndeterminateCount:
        count("missing_a1") + count("missing_a2") + count("indeterminate"),
      fundamentals,
      fundamentalsConformAtA2: fundamentals.filter((f) => f.a2Conformity === "conform").length,
      fundamentalsTotal: fundamentals.length,
      improvements: prioritize(criteria.filter((c) => c.status === "improved")),
      regressions: prioritize(criteria.filter((c) => c.status === "regressed")),
      persistentGaps: prioritize(criteria.filter((c) => c.status === "persistent_gap")),
      a2Incomplete,
      efficacyConclusionAllowed: !a2Incomplete,
      criteriaPendingValidation: unvalidatedCriterionParams(criterionIds, params),
    },
  };
}
