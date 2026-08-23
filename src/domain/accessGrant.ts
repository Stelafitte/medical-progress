/**
 * DROITS ACCORDÉS dans un programme — logique de domaine PURE.
 *
 * Même philosophie que les classes, les terrains de stage, les compétences,
 * les connaissances, les évaluations et les pièces exigées : un seul modèle,
 * un seul outil de création, une seule liste.
 *
 * Règles structurantes du socle :
 * - aucun rôle global : la portée est toujours explicite ;
 * - le rôle apprenant ne s'accorde pas ici (il découle d'une inscription) ;
 * - la portée plateforme ne s'accorde jamais depuis un programme ;
 * - un encadrant de stage n'existe que rattaché à un terrain précis.
 */
import { isRoleScopeConsistent } from "@/domain/roles";
import type { CohortId, PlacementId, ProgramId, RoleAssignment, RoleName } from "@/domain/types";

/** Rôles que l'administration d'un programme peut accorder. */
export type GrantableRole = Exclude<RoleName, "learner">;

export const GRANTABLE_ROLES: readonly GrantableRole[] = [
  "teacher",
  "placement_supervisor",
  "administrator",
];

/** Portées accordables depuis un programme (jamais « plateforme »). */
export type GrantScopeKind = "program" | "cohort" | "placement";

export const GRANT_SCOPE_LABELS_FR: Record<GrantScopeKind, string> = {
  program: "tout le programme",
  cohort: "une promotion précise",
  placement: "un terrain de stage précis",
};

/** Saisie brute du formulaire unique. */
export interface NewAccessGrantInput {
  readonly personId: string;
  readonly role: GrantableRole;
  readonly scopeKind: GrantScopeKind;
  readonly cohortId: string;
  readonly placementId: string;
  readonly justification: string;
}

export const EMPTY_NEW_ACCESS_GRANT_INPUT: NewAccessGrantInput = {
  personId: "",
  role: "teacher",
  scopeKind: "program",
  cohortId: "",
  placementId: "",
  justification: "",
};

export type NewAccessGrantIssue =
  | "person-required"
  | "cohort-required"
  | "placement-required"
  | "justification-required"
  | "role-scope-inconsistent"
  | "duplicate-grant";

export const NEW_ACCESS_GRANT_ISSUE_LABELS_FR: Record<NewAccessGrantIssue, string> = {
  "person-required": "Sélectionnez la personne qui reçoit le droit.",
  "cohort-required": "Une portée « promotion » exige de choisir la promotion concernée.",
  "placement-required": "Une portée « terrain de stage » exige de choisir le terrain concerné.",
  "justification-required": "Indiquez le motif de l'attribution : il est journalisé.",
  "role-scope-inconsistent":
    "Ce rôle ne peut pas s'exercer dans cette portée : un encadrant de stage se rattache à un terrain, un enseignant à un programme ou une promotion, un administrateur au programme.",
  "duplicate-grant": "Ce droit existe déjà pour cette personne dans cette portée.",
};

export interface ValidateAccessGrantContext {
  readonly programId: ProgramId;
  readonly existing: readonly RoleAssignment[];
}

/** Construit la portée décrite par la saisie. */
export function buildScopeFromInput(
  input: NewAccessGrantInput,
  programId: ProgramId,
): RoleAssignment["scope"] {
  switch (input.scopeKind) {
    case "cohort":
      return { kind: "cohort", programId, cohortId: input.cohortId as CohortId };
    case "placement":
      return { kind: "placement", programId, placementId: input.placementId as PlacementId };
    default:
      return { kind: "program", programId };
  }
}

export function validateNewAccessGrant(
  input: NewAccessGrantInput,
  ctx: ValidateAccessGrantContext,
): readonly NewAccessGrantIssue[] {
  const issues: NewAccessGrantIssue[] = [];
  if (input.personId.trim().length === 0) issues.push("person-required");
  if (input.scopeKind === "cohort" && input.cohortId.trim().length === 0)
    issues.push("cohort-required");
  if (input.scopeKind === "placement" && input.placementId.trim().length === 0)
    issues.push("placement-required");
  if (input.justification.trim().length === 0) issues.push("justification-required");

  const candidate: RoleAssignment = {
    personId: input.personId as RoleAssignment["personId"],
    role: input.role,
    scope: buildScopeFromInput(input, ctx.programId),
    grantedAt: "1970-01-01T00:00:00.000Z",
    provenance: { sourceSystem: "native" },
  };
  if (!isRoleScopeConsistent(candidate)) issues.push("role-scope-inconsistent");

  const already = ctx.existing.some(
    (item) =>
      item.personId === candidate.personId &&
      item.role === candidate.role &&
      sameScope(item.scope, candidate.scope),
  );
  if (already) issues.push("duplicate-grant");

  return issues;
}

/** Égalité structurelle de deux portées. */
export function sameScope(a: RoleAssignment["scope"], b: RoleAssignment["scope"]): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "platform" || b.kind === "platform") return true;
  if (a.kind === "cohort" && b.kind === "cohort") return a.cohortId === b.cohortId;
  if (a.kind === "placement" && b.kind === "placement") return a.placementId === b.placementId;
  if (a.kind === "program" && b.kind === "program") return a.programId === b.programId;
  return false;
}

export interface BuildAccessGrantContext {
  readonly programId: ProgramId;
  readonly now: string;
}

/** Droit accordé localement (maquette) : jamais un rôle global. */
export interface LocalAccessGrant extends RoleAssignment {
  readonly justification: string;
}

export function buildAccessGrantFromInput(
  input: NewAccessGrantInput,
  ctx: BuildAccessGrantContext,
): LocalAccessGrant {
  return {
    personId: input.personId as RoleAssignment["personId"],
    role: input.role,
    scope: buildScopeFromInput(input, ctx.programId),
    grantedAt: ctx.now,
    provenance: { sourceSystem: "native" },
    justification: input.justification.trim(),
  };
}

/** Ne conserve que les droits qui touchent le programme observé. */
export function grantsForProgram(
  assignments: readonly RoleAssignment[],
  programId: ProgramId,
): readonly RoleAssignment[] {
  return assignments.filter(
    (item) => item.scope.kind !== "platform" && item.scope.programId === programId,
  );
}
