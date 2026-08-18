/**
 * Statistiques pédagogiques longitudinales.
 *
 * Principe de conservation : chaque promotion produit un instantané agrégé
 * (`CohortStatisticsSnapshot`) qui n'est jamais supprimé ni écrasé. Les données
 * restent donc exploitables d'une année universitaire à l'autre et d'une
 * promotion à l'autre, même après la clôture de la cohorte.
 *
 * Ce module est purement fonctionnel : aucune donnée nominative, aucun accès
 * infrastructure. Les agrégats sont anonymes par construction.
 */
import type { CohortId, ProgramId } from "./types";

/** Instantané agrégé et immuable d'une promotion, conservé sans limite de durée. */
export interface CohortStatisticsSnapshot {
  readonly id: string;
  readonly programId: ProgramId;
  readonly cohortId: CohortId;
  /** Année universitaire au format "2025-2026". */
  readonly academicYear: string;
  readonly cohortLabel: string;
  readonly status: "closed" | "in_progress";
  readonly learnerCount: number;
  /** Part des apprenants ayant atteint la cible du programme (0 à 1). */
  readonly completionRate: number;
  /** Taux d'acquisition par nature d'acquis (0 à 1). */
  readonly knowledgeRate: number;
  readonly simulatedRate: number;
  readonly realRate: number;
  readonly validatedEvidenceCount: number;
  readonly pendingValidationCount: number;
  /** Part des stages terminés dans les délais (0 à 1). */
  readonly placementCompletionRate: number;
  /** Délai médian, en jours, avant la première compétence réelle validée. */
  readonly medianDaysToFirstRealCompetence: number;
  /** Placements rattachés : sert au filtrage du périmètre d'un encadrant. */
  readonly placementIds: readonly string[];
}

export const ACADEMIC_YEAR_SORT = (a: string, b: string) => a.localeCompare(b);

/** Tri chronologique croissant par année universitaire. */
export function sortByAcademicYear(
  snapshots: readonly CohortStatisticsSnapshot[],
): readonly CohortStatisticsSnapshot[] {
  return [...snapshots].sort((a, b) => ACADEMIC_YEAR_SORT(a.academicYear, b.academicYear));
}

/** Périmètre d'un responsable de stage : uniquement ses stages, agrégats anonymes. */
export function scopedToPlacements(
  snapshots: readonly CohortStatisticsSnapshot[],
  placementIds: readonly string[],
): readonly CohortStatisticsSnapshot[] {
  if (placementIds.length === 0) return [];
  return snapshots.filter((s) => s.placementIds.some((id) => placementIds.includes(id)));
}

export interface TrendPoint {
  readonly academicYear: string;
  readonly cohortLabel: string;
  readonly learnerCount: number;
  readonly completionRate: number;
  readonly realRate: number;
  /** Écart de taux de réussite avec l'année précédente (null pour la première). */
  readonly completionDelta: number | null;
}

/** Série longitudinale : une entrée par année, avec l'écart année sur année. */
export function buildTrend(snapshots: readonly CohortStatisticsSnapshot[]): readonly TrendPoint[] {
  const ordered = sortByAcademicYear(snapshots);
  return ordered.map((s, index) => {
    const previous = index > 0 ? ordered[index - 1] : undefined;
    return {
      academicYear: s.academicYear,
      cohortLabel: s.cohortLabel,
      learnerCount: s.learnerCount,
      completionRate: s.completionRate,
      realRate: s.realRate,
      completionDelta: previous ? round(s.completionRate - previous.completionRate) : null,
    };
  });
}

export interface HistorySummary {
  readonly yearsCovered: number;
  readonly cumulativeLearnerCount: number;
  readonly meanCompletionRate: number;
  readonly bestYear: string | null;
  readonly currentYear: string | null;
  /** Écart entre l'année en cours (ou la plus récente) et la moyenne historique. */
  readonly deltaToHistoricalMean: number | null;
}

/** Synthèse pluriannuelle exploitable pour le pilotage. */
export function summarizeHistory(
  snapshots: readonly CohortStatisticsSnapshot[],
): HistorySummary {
  const ordered = sortByAcademicYear(snapshots);
  if (ordered.length === 0) {
    return {
      yearsCovered: 0,
      cumulativeLearnerCount: 0,
      meanCompletionRate: 0,
      bestYear: null,
      currentYear: null,
      deltaToHistoricalMean: null,
    };
  }

  const closed = ordered.filter((s) => s.status === "closed");
  const reference = closed.length > 0 ? closed : ordered;
  const mean = round(
    reference.reduce((sum, s) => sum + s.completionRate, 0) / reference.length,
  );
  const best = reference.reduce((a, b) => (b.completionRate > a.completionRate ? b : a));
  const current = ordered[ordered.length - 1]!;

  return {
    yearsCovered: new Set(ordered.map((s) => s.academicYear)).size,
    cumulativeLearnerCount: ordered.reduce((sum, s) => sum + s.learnerCount, 0),
    meanCompletionRate: mean,
    bestYear: best.academicYear,
    currentYear: current.academicYear,
    deltaToHistoricalMean: round(current.completionRate - mean),
  };
}

/** Comparaison de deux promotions sur les indicateurs conservés. */
export interface CohortComparisonRow {
  readonly label: string;
  readonly left: number;
  readonly right: number;
  readonly delta: number;
}

export function compareCohorts(
  left: CohortStatisticsSnapshot,
  right: CohortStatisticsSnapshot,
): readonly CohortComparisonRow[] {
  const rows: readonly [string, number, number][] = [
    ["Apprenants", left.learnerCount, right.learnerCount],
    ["Taux de réussite", left.completionRate, right.completionRate],
    ["Connaissances", left.knowledgeRate, right.knowledgeRate],
    ["Compétences simulées", left.simulatedRate, right.simulatedRate],
    ["Compétences réelles", left.realRate, right.realRate],
    ["Stages menés à terme", left.placementCompletionRate, right.placementCompletionRate],
    [
      "Délai médian 1re compétence réelle (j)",
      left.medianDaysToFirstRealCompetence,
      right.medianDaysToFirstRealCompetence,
    ],
  ];
  return rows.map(([label, l, r]) => ({ label, left: l, right: r, delta: round(r - l) }));
}

export const formatRate = (value: number) => `${Math.round(value * 100)} %`;

export const formatDelta = (value: number | null) =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${Math.round(value * 100)} pts`;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
