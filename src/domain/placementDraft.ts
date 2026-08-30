/**
 * Création d'un terrain de stage — logique de domaine PURE.
 *
 * Même philosophie que les classes d'apprenants : un terrain de stage est le
 * même objet qu'il soit créé dans l'onglet « Gestion des stages » ou au fil de
 * la conception dans le « Concepteur de programme ». Un seul outil, une seule
 * liste.
 */
import type { Placement, PlacementId, ProgramId } from "@/domain/types";

/** Modes de validation possibles d'un stage (indépendants d'une promotion). */
export type StageValidationMode = "logbook" | "supervisor_report" | "human_validation";

export const STAGE_VALIDATION_LABELS_FR: Record<StageValidationMode, string> = {
  logbook: "Carnet de stage",
  supervisor_report: "Bilan d'encadrement",
  human_validation: "Validation de compétence réelle",
};

/** Saisie brute du formulaire unique de création de terrain de stage. */
export interface NewPlacementInput {
  readonly name: string;
  readonly site: string;
  readonly department: string;
  /** Capacité d'accueil, saisie en texte libre. */
  readonly capacity: string;
  /** Encadrant rattaché au terrain (nom libre dans la maquette). */
  readonly supervisor: string;
  readonly validationMode: StageValidationMode;
}

export const EMPTY_NEW_PLACEMENT_INPUT: NewPlacementInput = {
  name: "",
  site: "",
  department: "",
  capacity: "",
  supervisor: "",
  validationMode: "logbook",
};

export type NewPlacementIssue =
  "name-required" | "site-required" | "department-required" | "capacity-invalid";

/** Vérifie la saisie : mêmes règles dans les deux onglets. */
export function validateNewPlacement(input: NewPlacementInput): readonly NewPlacementIssue[] {
  const issues: NewPlacementIssue[] = [];
  if (input.name.trim().length === 0) issues.push("name-required");
  if (input.site.trim().length === 0) issues.push("site-required");
  if (input.department.trim().length === 0) issues.push("department-required");

  const capacity = input.capacity.trim();
  if (capacity.length > 0 && !/^\d{1,4}$/.test(capacity)) issues.push("capacity-invalid");
  return issues;
}

export const NEW_PLACEMENT_ISSUE_LABELS_FR: Record<NewPlacementIssue, string> = {
  "name-required": "Le nom du terrain de stage est obligatoire.",
  "site-required": "Indiquez l'établissement ou le lieu.",
  "department-required": "Indiquez le service.",
  "capacity-invalid": "La capacité d'accueil doit être un nombre entier.",
};

/** Terrain de stage créé localement, avec ses attributs d'exploitation. */
export interface LocalPlacement {
  readonly placement: Placement;
  readonly supervisor: string;
  readonly validationMode: StageValidationMode;
}

export interface BuildPlacementContext {
  readonly programId: ProgramId;
  readonly now: string;
  /** Rang du terrain créé localement, pour un identifiant déterministe. */
  readonly sequence: number;
}

/** Construit le terrain de stage à partir de la saisie validée. Déterministe. */
export function buildPlacementFromInput(
  input: NewPlacementInput,
  ctx: BuildPlacementContext,
): LocalPlacement {
  const capacity = Number(input.capacity.trim());
  return {
    placement: {
      id: `plc-local-${ctx.sequence}` as PlacementId,
      createdAt: ctx.now,
      provenance: { sourceSystem: "native" },
      programId: ctx.programId,
      name: input.name.trim(),
      site: input.site.trim(),
      department: input.department.trim(),
      capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 0,
    },
    supervisor: input.supervisor.trim(),
    validationMode: input.validationMode,
  };
}

/** Fusionne les terrains du dépôt et ceux créés localement, sans doublon d'identifiant. */
export function mergePlacements(
  stored: readonly Placement[],
  local: readonly LocalPlacement[],
): readonly Placement[] {
  const seen = new Set(stored.map((placement) => placement.id));
  return [...stored, ...local.map((l) => l.placement).filter((p) => !seen.has(p.id))];
}
