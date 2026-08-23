/**
 * Décisions d'accès dérivées des RoleAssignment contextualisés.
 * Aucune décision d'accès ne doit être prise à partir d'un booléen local d'un composant.
 */
import { hasRole } from "./roles";
import type { ProgramId, RoleAssignment } from "./types";

/**
 * L'administration institutionnelle est réservée :
 * - à un administrateur de la plateforme ;
 * - à un administrateur du programme sélectionné.
 * Un apprenant (même inscrit dans plusieurs programmes) n'y a jamais accès.
 */
export function canAccessAdministration(
  assignments: readonly RoleAssignment[],
  programId: ProgramId,
): boolean {
  return hasRole(assignments, "administrator", { programId });
}

/**
 * Administration DU PROGRAMME : ouverte à un administrateur rattaché au
 * programme sélectionné, ainsi qu'à un administrateur de plateforme — ce rôle
 * est un sur-ensemble : il voit et fait tout ce que fait un administrateur de
 * programme, sur chaque programme.
 */
export function canAccessProgramAdministration(
  assignments: readonly RoleAssignment[],
  programId: ProgramId,
): boolean {
  if (canAccessPlatformAdministration(assignments)) return true;
  return assignments.some(
    (a) =>
      a.role === "administrator" && a.scope.kind === "program" && a.scope.programId === programId,
  );
}

/** Administration PLATEFORME : uniquement une portée plateforme. */
export function canAccessPlatformAdministration(assignments: readonly RoleAssignment[]): boolean {
  return assignments.some((a) => a.role === "administrator" && a.scope.kind === "platform");
}

/**
 * Espace responsable de stage : au moins une portée stage dans le programme
 * sélectionné. Le périmètre reste limité aux affectations de cet encadrant.
 */
export function canAccessSupervision(
  assignments: readonly RoleAssignment[],
  programId: ProgramId,
): boolean {
  return assignments.some(
    (a) =>
      a.role === "placement_supervisor" &&
      a.scope.kind === "placement" &&
      a.scope.programId === programId,
  );
}

/** Espace apprenant : réservé à qui possède un rôle apprenant dans le programme. */
export function canAccessLearnerSpace(
  assignments: readonly RoleAssignment[],
  programId: ProgramId,
): boolean {
  return hasRole(assignments, "learner", { programId });
}

/**
 * Outil statistique : responsables de stage, enseignants, administrateurs du
 * programme et administrateurs plateforme. Jamais un apprenant seul.
 * Le périmètre affiché reste ensuite restreint aux stages de l'encadrant.
 */
export function canAccessStatistics(
  assignments: readonly RoleAssignment[],
  programId: ProgramId,
): boolean {
  return (
    canAccessSupervision(assignments, programId) ||
    canAccessProgramAdministration(assignments, programId) ||
    canAccessPlatformAdministration(assignments) ||
    hasRole(assignments, "teacher", { programId })
  );
}

/** Le profil de compte est accessible à tout utilisateur authentifié, quels que soient ses rôles. */
export function canAccessOwnProfile(isAuthenticated: boolean): boolean {
  return isAuthenticated;
}
