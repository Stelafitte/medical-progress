/**
 * Pièces ADMINISTRATIVES EXIGÉES par un programme — logique de domaine PURE.
 *
 * Même philosophie que les classes, les terrains de stage, les compétences, les
 * connaissances et les évaluations : un seul modèle, un seul outil de création,
 * une seule liste, partagée entre l'onglet « Documents et certificats » et le
 * « Concepteur de programme ».
 *
 * Le MODÈLE décrit ce que le programme exige (intitulé, obligation, échéance,
 * qui fournit, qui valide). L'EXPLOITATION — qui a rendu quoi — reste rattachée
 * à une promotion et se lit dans le suivi, jamais ici.
 */
import type { ProgramId } from "@/domain/types";

/** Qui dépose la pièce. */
export type DocumentProvider = "learner" | "supervisor" | "administration";

export const DOCUMENT_PROVIDER_LABELS_FR: Record<DocumentProvider, string> = {
  learner: "l'apprenant",
  supervisor: "le responsable de stage",
  administration: "l'administration",
};

/** Qui contrôle et accepte la pièce. */
export type DocumentValidator = "supervisor" | "administration";

export const DOCUMENT_VALIDATOR_LABELS_FR: Record<DocumentValidator, string> = {
  supervisor: "le responsable de stage",
  administration: "l'administration",
};

/** Moment attendu du dépôt, indépendant d'une promotion précise. */
export type DocumentDueMoment = "enrollment" | "before_placement" | "end_of_placement" | "end_of_program";

export const DOCUMENT_DUE_LABELS_FR: Record<DocumentDueMoment, string> = {
  enrollment: "à l'inscription",
  before_placement: "avant le début du stage",
  end_of_placement: "à la fin du stage",
  end_of_program: "à la fin du programme",
};

/** Saisie brute du formulaire unique. */
export interface NewDocumentRequirementInput {
  readonly code: string;
  readonly label: string;
  readonly mandatory: boolean;
  readonly provider: DocumentProvider;
  readonly validator: DocumentValidator;
  readonly due: DocumentDueMoment;
  readonly notes: string;
}

export const EMPTY_NEW_DOCUMENT_REQUIREMENT_INPUT: NewDocumentRequirementInput = {
  code: "",
  label: "",
  mandatory: true,
  provider: "learner",
  validator: "administration",
  due: "enrollment",
  notes: "",
};

export type NewDocumentRequirementIssue =
  | "code-required"
  | "label-required"
  | "supervisor-validates-supervisor-piece";

export const NEW_DOCUMENT_REQUIREMENT_ISSUE_LABELS_FR: Record<
  NewDocumentRequirementIssue,
  string
> = {
  "code-required": "Le code de la pièce est obligatoire.",
  "label-required": "L'intitulé de la pièce est obligatoire.",
  "supervisor-validates-supervisor-piece":
    "Une pièce fournie par le responsable de stage ne peut pas être validée par lui-même : la validation revient à l'administration.",
};

export function validateNewDocumentRequirement(
  input: NewDocumentRequirementInput,
): readonly NewDocumentRequirementIssue[] {
  const issues: NewDocumentRequirementIssue[] = [];
  if (input.code.trim().length === 0) issues.push("code-required");
  if (input.label.trim().length === 0) issues.push("label-required");
  if (input.provider === "supervisor" && input.validator === "supervisor")
    issues.push("supervisor-validates-supervisor-piece");
  return issues;
}

/** Pièce exigée par le programme (modèle). */
export interface DocumentRequirement {
  readonly id: string;
  readonly programId: ProgramId;
  readonly code: string;
  readonly label: string;
  readonly mandatory: boolean;
  readonly provider: DocumentProvider;
  readonly validator: DocumentValidator;
  readonly due: DocumentDueMoment;
  readonly notes: string;
  readonly createdAt: string;
}

export interface BuildDocumentRequirementContext {
  readonly programId: ProgramId;
  readonly now: string;
  readonly sequence: number;
}

/** Construit la pièce exigée à partir d'une saisie validée. Déterministe. */
export function buildDocumentRequirementFromInput(
  input: NewDocumentRequirementInput,
  ctx: BuildDocumentRequirementContext,
): DocumentRequirement {
  return {
    id: `docreq-local-${ctx.sequence}`,
    programId: ctx.programId,
    code: input.code.trim().toUpperCase(),
    label: input.label.trim(),
    mandatory: input.mandatory,
    provider: input.provider,
    validator: input.validator,
    due: input.due,
    notes: input.notes.trim(),
    createdAt: ctx.now,
  };
}

/* ------------------------------------------------------------------ */
/* Import rapide : lecture d'un tableau collé, puis diff              */
/* ------------------------------------------------------------------ */

export interface ParsedDocumentRow {
  readonly code: string;
  readonly label: string;
  readonly mandatory: boolean;
}

const MANDATORY_WORDS = ["obligatoire", "obligatoires", "oui", "requis", "required", "mandatory"];

/** Lit un tableau CSV/TSV/point-virgule : code, intitulé, obligation. */
export function parseDocumentRequirementText(text: string): readonly ParsedDocumentRow[] {
  const rows: ParsedDocumentRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const cells = line
      .split(/[;\t,]/)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    if (cells.length < 2) continue;
    const [code, label, third] = cells;
    if (!code || !label) continue;
    const flag = (third ?? "").toLowerCase();
    rows.push({
      code: code.toUpperCase(),
      label,
      mandatory: flag.length === 0 ? true : MANDATORY_WORDS.includes(flag),
    });
  }
  return rows;
}

export type DocumentDiffKind = "new" | "changed" | "unchanged" | "ignored";

export const DOCUMENT_DIFF_LABELS_FR: Record<DocumentDiffKind, string> = {
  new: "nouvelle",
  changed: "déjà présente",
  unchanged: "inchangée",
  ignored: "ignorée",
};

export interface DocumentDiffRow extends ParsedDocumentRow {
  readonly kind: DocumentDiffKind;
}

export interface DocumentDiff {
  readonly rows: readonly DocumentDiffRow[];
  readonly newCount: number;
  readonly changedCount: number;
  readonly unchangedCount: number;
  readonly ignoredCount: number;
}

/**
 * Compare les lignes collées au référentiel en place. Un code déjà présent
 * n'écrase jamais la pièce existante : il est signalé, pas appliqué.
 */
export function diffDocumentRequirementRows(
  rows: readonly ParsedDocumentRow[],
  existing: readonly DocumentRequirement[],
): DocumentDiff {
  const byCode = new Map(existing.map((item) => [item.code.toUpperCase(), item]));
  const seen = new Set<string>();
  const diffRows: DocumentDiffRow[] = [];

  for (const row of rows) {
    const code = row.code.toUpperCase();
    if (seen.has(code)) {
      diffRows.push({ ...row, kind: "ignored" });
      continue;
    }
    seen.add(code);
    const match = byCode.get(code);
    if (!match) {
      diffRows.push({ ...row, kind: "new" });
      continue;
    }
    const same = match.label === row.label && match.mandatory === row.mandatory;
    diffRows.push({ ...row, kind: same ? "unchanged" : "changed" });
  }

  const count = (kind: DocumentDiffKind) => diffRows.filter((row) => row.kind === kind).length;
  return {
    rows: diffRows,
    newCount: count("new"),
    changedCount: count("changed"),
    unchangedCount: count("unchanged"),
    ignoredCount: count("ignored"),
  };
}

/** Liste unique : pièces du dépôt puis pièces créées dans la session. */
export function mergeDocumentRequirements(
  base: readonly DocumentRequirement[],
  local: readonly DocumentRequirement[],
): readonly DocumentRequirement[] {
  const codes = new Set(base.map((item) => item.code.toUpperCase()));
  return [...base, ...local.filter((item) => !codes.has(item.code.toUpperCase()))];
}
