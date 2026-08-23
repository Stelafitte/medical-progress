/**
 * Création d'une CONNAISSANCE — logique de domaine PURE.
 *
 * Même philosophie que les compétences, les classes et les terrains de stage :
 * un seul outil de création, une seule liste. La nature est ici toujours
 * « connaissance » : les savoir-faire relèvent de l'onglet « Compétences ».
 */
import type {
  CurriculumVersionId,
  MasteryLevel,
  Outcome,
  OutcomeId,
  ProgramId,
} from "@/domain/types";

export interface NewKnowledgeInput {
  readonly code: string;
  readonly label: string;
  readonly domain: string;
  readonly targetMastery: MasteryLevel;
  readonly description: string;
}

export const EMPTY_NEW_KNOWLEDGE_INPUT: NewKnowledgeInput = {
  code: "",
  label: "",
  domain: "",
  targetMastery: "proficient",
  description: "",
};

export type NewKnowledgeIssue = "code-required" | "label-required" | "target-invalid";

export const NEW_KNOWLEDGE_ISSUE_LABELS_FR: Record<NewKnowledgeIssue, string> = {
  "code-required": "Le code de la connaissance est obligatoire.",
  "label-required": "L'intitulé de la connaissance est obligatoire.",
  "target-invalid": "Le niveau attendu doit être supérieur à « non commencée ».",
};

export function validateNewKnowledge(input: NewKnowledgeInput): readonly NewKnowledgeIssue[] {
  const issues: NewKnowledgeIssue[] = [];
  if (input.code.trim().length === 0) issues.push("code-required");
  if (input.label.trim().length === 0) issues.push("label-required");
  if (input.targetMastery === "not_started") issues.push("target-invalid");
  return issues;
}

export interface BuildKnowledgeContext {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  readonly now: string;
  readonly sequence: number;
}

/** Construit la connaissance à partir de la saisie validée. Déterministe. */
export function buildKnowledgeFromInput(
  input: NewKnowledgeInput,
  ctx: BuildKnowledgeContext,
): Outcome {
  return {
    id: `out-knowledge-local-${ctx.sequence}` as OutcomeId,
    createdAt: ctx.now,
    provenance: { sourceSystem: "native" },
    programId: ctx.programId,
    curriculumVersionId: ctx.curriculumVersionId,
    code: input.code.trim().toUpperCase(),
    label: input.label.trim(),
    description: input.description.trim(),
    nature: "knowledge",
    domain: input.domain.trim().length > 0 ? input.domain.trim() : "Non classé",
    targetMastery: input.targetMastery,
  };
}
