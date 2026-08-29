/**
 * Modalités d'évaluation — logique de domaine PURE.
 *
 * Une modalité d'évaluation décrit COMMENT on évalue (présentiel ou en ligne,
 * sous-type, usage prévu). Elle est rattachée à un programme et sert ensuite
 * aux sessions passées ou à venir de chaque cohorte.
 */
import type { IsoDateTime, ProgramId } from "./types";

export type AssessmentMode = "in_person" | "online";

export type AssessmentSubtype =
  | "oral"
  | "written"
  | "practical"
  | "qcm"
  | "simulation"
  | "ai_oral"
  | "case_study";

export type AssessmentUsage =
  | "self_assessment"
  | "formative"
  | "validation_exam"
  | "certification";

export const ASSESSMENT_MODE_LABELS_FR: Record<AssessmentMode, string> = {
  in_person: "En présentiel",
  online: "En ligne",
};

export const ASSESSMENT_SUBTYPE_LABELS_FR: Record<AssessmentSubtype, string> = {
  oral: "Épreuve orale",
  written: "Épreuve écrite",
  practical: "Épreuve pratique",
  qcm: "QCM",
  simulation: "Simulation",
  ai_oral: "Évaluation orale par IA",
  case_study: "Cas clinique commenté",
};

export const ASSESSMENT_USAGE_LABELS_FR: Record<AssessmentUsage, string> = {
  self_assessment: "Auto-évaluation",
  formative: "Évaluation formative",
  validation_exam: "Examen de validation",
  certification: "Examen certifiant",
};

/** Sous-types autorisés pour chaque mode : la cohérence est vérifiée ici. */
export const SUBTYPES_BY_MODE: Record<AssessmentMode, readonly AssessmentSubtype[]> = {
  in_person: ["oral", "written", "practical"],
  online: ["qcm", "simulation", "ai_oral", "case_study"],
};

export interface AssessmentModality {
  readonly id: string;
  readonly programId: ProgramId;
  readonly name: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly mode: AssessmentMode;
  readonly subtype: AssessmentSubtype;
  readonly usage: AssessmentUsage;
  readonly notes?: string;
}

/** Saisie brute du formulaire unique de création de modalité. */
export interface NewAssessmentModalityInput {
  readonly name: string;
  readonly mode: AssessmentMode;
  readonly subtype: AssessmentSubtype;
  readonly usage: AssessmentUsage;
  readonly notes: string;
}

export const EMPTY_NEW_MODALITY_INPUT: NewAssessmentModalityInput = {
  name: "",
  mode: "in_person",
  subtype: "written",
  usage: "validation_exam",
  notes: "",
};

export type NewModalityIssue = "name-required" | "subtype-mismatch";

export const NEW_MODALITY_ISSUE_LABELS_FR: Record<NewModalityIssue, string> = {
  "name-required": "Le nom de la modalité d'évaluation est obligatoire.",
  "subtype-mismatch": "Le sous-type choisi n'appartient pas au type sélectionné.",
};

export function validateNewModality(
  input: NewAssessmentModalityInput,
): readonly NewModalityIssue[] {
  const issues: NewModalityIssue[] = [];
  if (input.name.trim().length === 0) issues.push("name-required");
  if (!SUBTYPES_BY_MODE[input.mode].includes(input.subtype)) issues.push("subtype-mismatch");
  return issues;
}

/* ------------------------------------------------------------------ */
/* Sessions d'évaluation par cohorte                                   */
/* ------------------------------------------------------------------ */

export type AssessmentSessionState = "completed" | "upcoming";

export interface AssessmentSession {
  readonly id: string;
  readonly modalityId: string;
  readonly cohortId: string;
  readonly scheduledFor: IsoDateTime;
  readonly participants: number;
  /** Renseigné uniquement pour une session terminée. */
  readonly averageScore?: number;
  readonly maximumScore?: number;
  readonly passRatePercent?: number;
}

export function sessionState(session: AssessmentSession, now: Date): AssessmentSessionState {
  return new Date(session.scheduledFor).getTime() <= now.getTime() ? "completed" : "upcoming";
}

export function splitSessions(
  sessions: readonly AssessmentSession[],
  now: Date,
): {
  readonly completed: readonly AssessmentSession[];
  readonly upcoming: readonly AssessmentSession[];
} {
  const byDate = [...sessions].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  return {
    completed: byDate.filter((s) => sessionState(s, now) === "completed"),
    upcoming: byDate.filter((s) => sessionState(s, now) === "upcoming"),
  };
}

export const ASSESSMENT_RESULT_IMPORT_COLUMNS = [
  "learner_identifier",
  "modality",
  "score",
  "maximum_score",
  "result_status",
] as const;
