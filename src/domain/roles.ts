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
  placement_manager: "Responsable de terrain de stage",
  teacher: "Enseignant",
  administrator: "Administrateur",
};

/**
 * Clé stable identifiant une assignation de rôle par sa nature (rôle + portée),
 * pas par un identifiant de ligne technique. Sert à permettre à une personne
 * cumulant plusieurs rôles réels de choisir laquelle de ses portées est active
 * ("voir en tant que"), sans dépendre d'un id de base de données.
 */
export function roleAssignmentKey(assignment: RoleAssignment): string {
  const scope = assignment.scope;
  const scopeId =
    scope.kind === "platform"
      ? ""
      : scope.kind === "program"
        ? scope.programId
        : scope.kind === "cohort"
          ? scope.cohortId
          : scope.placementId;
  return `${assignment.role}:${scope.kind}:${scopeId}`;
}

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

/**
 * ORDRE DE PRÉFÉRENCE DES RÔLES — utilisé tant que personne n'a choisi son
 * rôle actif (« Voir en tant que »).
 *
 * ⚠️ `roles[0]` NE VEUT RIEN DIRE : `listRoleAssignments` ne trie pas, donc le
 * rôle actif par défaut dépendait de l'ordre rendu par PostgreSQL. C'est ce qui
 * faisait retomber un compte multi-rôles sur « encadrant » à chaque
 * rechargement, et affichait « Accès restreint » sur des écrans
 * d'administration auxquels la personne a pourtant droit.
 */
const ROLE_PREFERENCE: readonly RoleName[] = [
  "administrator",
  "placement_manager",
  "placement_supervisor",
  "teacher",
  "learner",
];

/**
 * Rôles triés : d'abord ceux qui couvrent le contexte demandé (le programme
 * ouvert), puis du plus large au plus étroit. Tri stable — à rang égal l'ordre
 * d'origine est conservé.
 */
export function rolesByPreference(
  assignments: readonly RoleAssignment[],
  context: RoleContext = {},
): readonly RoleAssignment[] {
  /*
   * ⚠️ PAS `scopeCovers` ICI. Une portée STAGE n'est couverte par `scopeCovers`
   * que si le contexte porte un `placementId` : un contexte de simple programme
   * rend donc `false` pour un encadrant, qui exerce pourtant bien dans ce
   * programme. `scopeCovers` a raison pour ce qu'elle décide (un droit sur un
   * stage précis) ; ici la question est seulement « ce rôle s'exerce-t-il dans
   * le programme ouvert ? ».
   */
  const covers = (a: RoleAssignment) =>
    !context.programId ||
    a.scope.kind === "platform" ||
    ("programId" in a.scope && a.scope.programId === context.programId);
  const rank = (a: RoleAssignment) => {
    const index = ROLE_PREFERENCE.indexOf(a.role);
    return index < 0 ? ROLE_PREFERENCE.length : index;
  };
  return [...assignments].sort((a, b) => {
    if (covers(a) !== covers(b)) return covers(a) ? -1 : 1;
    return rank(a) - rank(b);
  });
}

/** Rôle à activer par défaut dans ce contexte, ou null si la personne n'en a aucun. */
export function preferredRoleAssignment(
  assignments: readonly RoleAssignment[],
  context: RoleContext = {},
): RoleAssignment | null {
  return rolesByPreference(assignments, context)[0] ?? null;
}
