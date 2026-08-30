/**
 * Création d'une compétence — logique de domaine PURE.
 *
 * Même philosophie que les classes et les terrains de stage : une compétence
 * est le même objet qu'elle soit créée dans l'onglet « Compétences » ou au fil
 * de la conception dans le « Concepteur de programme ». Un seul outil, une
 * seule liste.
 */
import type {
  CurriculumVersionId,
  MasteryLevel,
  Outcome,
  OutcomeId,
  OutcomeNature,
  ProgramId,
} from "@/domain/types";

/** Natures de compétence créables ici (la connaissance relève de l'onglet dédié). */
export type CompetenceNature = "simulated_competence" | "real_competence";

export const COMPETENCE_NATURE_LABELS_FR: Record<CompetenceNature, string> = {
  simulated_competence: "Compétence simulée",
  real_competence: "Compétence en situation réelle",
};

export const COMPETENCE_MASTERY_LABELS_FR: Record<MasteryLevel, string> = {
  not_started: "Non commencée",
  novice: "Découverte",
  intermediate: "Intermédiaire",
  proficient: "Maîtrisée",
  autonomous: "Autonome",
};

/** Saisie brute du formulaire unique de création de compétence. */
export interface NewCompetenceInput {
  readonly code: string;
  readonly label: string;
  readonly domain: string;
  readonly nature: CompetenceNature;
  readonly targetMastery: MasteryLevel;
  readonly description: string;
}

export const EMPTY_NEW_COMPETENCE_INPUT: NewCompetenceInput = {
  code: "",
  label: "",
  domain: "",
  nature: "simulated_competence",
  targetMastery: "proficient",
  description: "",
};

export type NewCompetenceIssue = "code-required" | "label-required" | "target-invalid";

/** Vérifie la saisie : mêmes règles dans les deux espaces. */
export function validateNewCompetence(input: NewCompetenceInput): readonly NewCompetenceIssue[] {
  const issues: NewCompetenceIssue[] = [];
  if (input.code.trim().length === 0) issues.push("code-required");
  if (input.label.trim().length === 0) issues.push("label-required");
  if (input.targetMastery === "not_started") issues.push("target-invalid");
  return issues;
}

export const NEW_COMPETENCE_ISSUE_LABELS_FR: Record<NewCompetenceIssue, string> = {
  "code-required": "Le code de la compétence est obligatoire.",
  "label-required": "L'intitulé de la compétence est obligatoire.",
  "target-invalid": "Le niveau attendu doit être supérieur à « non commencée ».",
};

export interface BuildCompetenceContext {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  readonly now: string;
  /** Rang de la compétence créée localement, pour un identifiant déterministe. */
  readonly sequence: number;
}

/** Construit la compétence à partir de la saisie validée. Déterministe. */
export function buildCompetenceFromInput(
  input: NewCompetenceInput,
  ctx: BuildCompetenceContext,
): Outcome {
  return {
    id: `out-local-${ctx.sequence}` as OutcomeId,
    createdAt: ctx.now,
    provenance: { sourceSystem: "native" },
    programId: ctx.programId,
    curriculumVersionId: ctx.curriculumVersionId,
    code: input.code.trim().toUpperCase(),
    label: input.label.trim(),
    description: input.description.trim(),
    nature: input.nature satisfies OutcomeNature,
    domain: input.domain.trim().length > 0 ? input.domain.trim() : "Non classé",
    targetMastery: input.targetMastery,
    retainedAt: ctx.now,
  };
}

/** Fusionne les compétences du dépôt et celles créées localement, sans doublon. */
export function mergeOutcomes(
  stored: readonly Outcome[],
  local: readonly Outcome[],
): readonly Outcome[] {
  const seenIds = new Set(stored.map((outcome) => outcome.id));
  const seenCodes = new Set(stored.map((outcome) => outcome.code.toUpperCase()));
  return [
    ...stored,
    ...local.filter(
      (outcome) => !seenIds.has(outcome.id) && !seenCodes.has(outcome.code.toUpperCase()),
    ),
  ];
}
