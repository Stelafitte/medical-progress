/**
 * Suivi nominatif d'acquisition des compétences (MAQUETTE DÉTERMINISTE).
 *
 * Aucune donnée réelle : les états sont dérivés d'un hachage stable
 * (inscription × compétence) afin que la démonstration soit reproductible.
 * La règle métier est respectée dans l'affichage : une compétence réelle
 * déclarée par l'apprenant n'est jamais comptée comme acquise sans validation
 * humaine.
 */
import type { Enrollment, Outcome, OutcomeNature } from "@/domain/types";

export type CompetenceState = "not_started" | "declared" | "validated";

export const COMPETENCE_STATE_LABELS_FR: Record<CompetenceState, string> = {
  not_started: "non commencée",
  declared: "déclarée, en attente de validation",
  validated: "validée par un tiers",
};

/** Hachage stable, sans dépendance externe. */
function stableHash(seed: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash);
}

export function simulatedCompetenceState(enrollmentId: string, outcomeId: string): CompetenceState {
  const bucket = stableHash(`${enrollmentId}::${outcomeId}`) % 10;
  if (bucket < 5) return "validated";
  if (bucket < 8) return "declared";
  return "not_started";
}

export interface LearnerCompetenceRow {
  readonly enrollmentId: string;
  readonly cohortId: string;
  readonly validated: number;
  readonly declared: number;
  readonly notStarted: number;
  readonly total: number;
  readonly percent: number;
}

export const COMPETENCE_NATURES: readonly OutcomeNature[] = [
  "simulated_competence",
  "real_competence",
];

export function competenceOutcomes(outcomes: readonly Outcome[]): readonly Outcome[] {
  return outcomes.filter((o) => COMPETENCE_NATURES.includes(o.nature));
}

/** Une ligne par apprenant de la cohorte pilotée. */
export function buildLearnerCompetenceRows(
  enrollments: readonly Enrollment[],
  outcomes: readonly Outcome[],
): readonly LearnerCompetenceRow[] {
  const scoped = competenceOutcomes(outcomes);
  return enrollments.map((enrollment) => {
    let validated = 0;
    let declared = 0;
    for (const outcome of scoped) {
      const state = simulatedCompetenceState(enrollment.id, outcome.id);
      if (state === "validated") validated += 1;
      else if (state === "declared") declared += 1;
    }
    const total = scoped.length;
    return {
      enrollmentId: enrollment.id,
      cohortId: enrollment.cohortId,
      validated,
      declared,
      notStarted: total - validated - declared,
      total,
      percent: total === 0 ? 0 : Math.round((validated / total) * 100),
    };
  });
}

export interface CompetenceCoverageRow {
  readonly outcomeId: string;
  readonly code: string;
  readonly label: string;
  readonly nature: OutcomeNature;
  readonly validatedLearners: number;
  readonly declaredLearners: number;
  readonly percent: number;
}

/** Une ligne par compétence : couverture dans la cohorte pilotée. */
export function buildCompetenceCoverage(
  enrollments: readonly Enrollment[],
  outcomes: readonly Outcome[],
): readonly CompetenceCoverageRow[] {
  return competenceOutcomes(outcomes).map((outcome) => {
    let validatedLearners = 0;
    let declaredLearners = 0;
    for (const enrollment of enrollments) {
      const state = simulatedCompetenceState(enrollment.id, outcome.id);
      if (state === "validated") validatedLearners += 1;
      else if (state === "declared") declaredLearners += 1;
    }
    return {
      outcomeId: outcome.id,
      code: outcome.code,
      label: outcome.label,
      nature: outcome.nature,
      validatedLearners,
      declaredLearners,
      percent:
        enrollments.length === 0 ? 0 : Math.round((validatedLearners / enrollments.length) * 100),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Import d'un référentiel de compétences (analyse locale uniquement)   */
/* ------------------------------------------------------------------ */

export interface ParsedReferentialRow {
  readonly code: string;
  readonly label: string;
  readonly nature: OutcomeNature | "unknown";
}

const NATURE_ALIASES: Record<string, OutcomeNature> = {
  connaissance: "knowledge",
  knowledge: "knowledge",
  simulation: "simulated_competence",
  simulee: "simulated_competence",
  simulée: "simulated_competence",
  reelle: "real_competence",
  réelle: "real_competence",
  stage: "real_competence",
};

/**
 * Analyse locale d'un référentiel collé ou déposé (CSV/TSV).
 * Aucun appel réseau, aucun enregistrement : uniquement une prévisualisation.
 */
export function parseReferentialText(text: string): readonly ParsedReferentialRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/[\t;,]/).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 2 && cells[0]?.toLowerCase() !== "code")
    .map((cells) => {
      const rawNature = (cells[2] ?? "").toLowerCase();
      return {
        code: cells[0] ?? "",
        label: cells[1] ?? "",
        nature: NATURE_ALIASES[rawNature] ?? ("unknown" as const),
      };
    });
}

/* ------------------------------------------------------------------ */
/* Diff d'import : nouveaux / modifiés / inchangés                     */
/* ------------------------------------------------------------------ */

export type ReferentialDiffKind = "new" | "changed" | "unchanged" | "ignored";

export interface ReferentialDiffRow extends ParsedReferentialRow {
  readonly kind: ReferentialDiffKind;
  /** Intitulé actuellement enregistré, si le code existe déjà. */
  readonly existingLabel: string | null;
}

export interface ReferentialDiff {
  readonly rows: readonly ReferentialDiffRow[];
  readonly newCount: number;
  readonly changedCount: number;
  readonly unchangedCount: number;
  readonly ignoredCount: number;
}

/**
 * Compare des lignes importées au référentiel existant.
 * « ignored » : nature absente ou de type connaissance — hors périmètre de cet
 * onglet, la ligne relève de la base de connaissances.
 */
export function diffReferentialRows(
  parsed: readonly ParsedReferentialRow[],
  outcomes: readonly Outcome[],
): ReferentialDiff {
  const byCode = new Map(competenceOutcomes(outcomes).map((o) => [o.code.toLowerCase(), o]));
  const rows = parsed.map<ReferentialDiffRow>((row) => {
    const isCompetence = row.nature === "simulated_competence" || row.nature === "real_competence";
    const existing = byCode.get(row.code.toLowerCase()) ?? null;
    if (!isCompetence) {
      return { ...row, kind: "ignored", existingLabel: existing?.label ?? null };
    }
    if (!existing) return { ...row, kind: "new", existingLabel: null };
    const changed = existing.label.trim() !== row.label.trim() || existing.nature !== row.nature;
    return { ...row, kind: changed ? "changed" : "unchanged", existingLabel: existing.label };
  });
  return {
    rows,
    newCount: rows.filter((r) => r.kind === "new").length,
    changedCount: rows.filter((r) => r.kind === "changed").length,
    unchangedCount: rows.filter((r) => r.kind === "unchanged").length,
    ignoredCount: rows.filter((r) => r.kind === "ignored").length,
  };
}

export const REFERENTIAL_DIFF_LABELS_FR: Record<ReferentialDiffKind, string> = {
  new: "nouvelle",
  changed: "modifiée (code déjà présent)",
  unchanged: "inchangée",
  ignored: "ignorée (hors compétences)",
};
