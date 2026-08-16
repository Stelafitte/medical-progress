/**
 * Règles de rôles CONTEXTUALISÉS.
 *
 * Un rôle n'est jamais global par défaut : il s'exerce dans une portée
 * (plateforme, programme, cohorte, stage). Un encadrant de stage ne peut
 * valider que les preuves des stages dont il est responsable.
 */
import type { CohortId, PlacementId, ProgramId, RoleAssignment, RoleName } from "./types";

export interface RoleContext {
  readonly programId?: ProgramId;
  readonly cohortId?: CohortId;
  readonly placementId?: PlacementId;
}

/** La portée d'une assignation couvre-t-elle le contexte demandé ? */
export function scopeCovers(assignment: RoleAssignment, context: RoleContext): boolean {
  const scope = assignment.scope;
  switch (scope.kind) {
    case "platform":
      return true;
    case "program":
      return !!context.programId && scope.programId === context.programId;
    case "cohort":
      return (
        (!!context.cohortId && scope.cohortId === context.cohortId) ||
        (!context.cohortId && !!context.programId && scope.programId === context.programId)
      );
    case "placement":
      return !!context.placementId && scope.placementId === context.placementId;
    default:
      return false;
  }
}

export function hasRole(
  assignments: readonly RoleAssignment[],
  role: RoleName,
  context: RoleContext,
): boolean {
  return assignments.some((a) => a.role === role && scopeCovers(a, context));
}

export function rolesInContext(
  assignments: readonly RoleAssignment[],
  context: RoleContext,
): readonly RoleName[] {
  return [...new Set(assignments.filter((a) => scopeCovers(a, context)).map((a) => a.role))];
}

/** Seuls ces rôles peuvent valider une preuve, et uniquement dans leur portée. */
export function canValidateEvidence(
  assignments: readonly RoleAssignment[],
  context: RoleContext,
): boolean {
  return (
    hasRole(assignments, "placement_supervisor", context) ||
    hasRole(assignments, "teacher", context) ||
    hasRole(assignments, "administrator", context)
  );
}

export const ROLE_LABELS_FR: Record<RoleName, string> = {
  learner: "Apprenant",
  placement_supervisor: "Encadrant de stage",
  teacher: "Enseignant",
  administrator: "Administrateur",
};

/**
 * Règle PURE de cohérence entre un rôle et sa portée.
 * - `placement_supervisor` : exige une portée stage ;
 * - `teacher` / `learner` : exigent un programme ou une cohorte ;
 * - `administrator` : plateforme ou programme.
 */
export function isRoleScopeConsistent(assignment: RoleAssignment): boolean {
  const kind = assignment.scope.kind;
  switch (assignment.role) {
    case "placement_supervisor":
      return kind === "placement";
    case "teacher":
    case "learner":
      return kind === "program" || kind === "cohort";
    case "administrator":
      return kind === "platform" || kind === "program";
    default:
      return false;
  }
}
