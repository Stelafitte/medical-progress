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

/** Le profil de compte est accessible à tout utilisateur authentifié. */
export function canAccessOwnProfile(assignments: readonly RoleAssignment[]): boolean {
  return assignments.length > 0;
}
