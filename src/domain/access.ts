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
 * Espace d'encadrement : au moins une portée terrain dans le programme
 * sélectionné.
 *
 * DEUX ROLES Y ENTRENT depuis le 10/09 (décision de Stef) : l'ENCADRANT, dont
 * le périmètre est celui de ses groupes, et le RESPONSABLE DE STAGE, qui
 * répond du terrain entier. Le second fait tout ce que fait le premier — la
 * différence de périmètre est portée par `supervises_enrollment()` en base,
 * pas par cet écran.
 */
export function canAccessSupervision(
  assignments: readonly RoleAssignment[],
  programId: ProgramId,
): boolean {
  return assignments.some(
    (a) =>
      (a.role === "placement_supervisor" || a.role === "placement_manager") &&
      a.scope.kind === "placement" &&
      a.scope.programId === programId,
  );
}

/**
 * POSER LE CALENDRIER D'UN STAGE — les semaines « en service » et « chez soi ».
 *
 * DEUX ROLES, décision de Stef du 11/09 : l'administrateur du programme, et le
 * RESPONSABLE DE STAGE, parce que c'est lui qui connaît les dates réelles du
 * service, les fériés et les semaines de congrès. Un encadrant simple, non :
 * il lit le calendrier, il ne le pose pas.
 *
 * ⚠️ CETTE FONCTION DOIT DIRE EXACTEMENT CE QUE DIT LA BASE. Son pendant
 * serveur est `can_set_placement_calendar` (migration `20260911090000`). Un
 * écran plus permissif que la base offrirait des boutons qui échouent ; un
 * écran plus strict cacherait un droit réellement accordé.
 */
export function canManagePlacementCalendar(
  assignments: readonly RoleAssignment[],
  programId: ProgramId,
): boolean {
  if (canAccessProgramAdministration(assignments, programId)) return true;
  return assignments.some(
    (a) =>
      a.role === "placement_manager" &&
      a.scope.kind === "placement" &&
      a.scope.programId === programId,
  );
}

/**
 * PRONONCER LA VALIDATION D'UN STAGE — l'acte propre au responsable de stage.
 *
 * DECISION DE STEF, 11/09 : l'encadrant valide la présence semaine par semaine
 * et confirme les compétences ; le PRONONCE FINAL — le stage est acquis —
 * revient au responsable de stage, à l'administrateur du programme et à
 * l'administrateur de plateforme.
 *
 * ⚠️ MEME POPULATION QUE `canManagePlacementCalendar` AUJOURD'HUI, ET POURTANT
 * DEUX FONCTIONS. Ce sont deux droits distincts qui coïncident : poser un
 * calendrier et prononcer un stage n'ont aucune raison d'évoluer ensemble. Les
 * fondre ferait qu'ouvrir l'un ouvrirait l'autre sans que personne ne l'ait
 * décidé.
 *
 * ⚠️ LA BASE L'IMPOSE DEPUIS LE 11/09 (migration `20260911140000`) :
 * `validate_stage_log_block` refuse à l'encadrant le bloc qui couvre le stage
 * ENTIER — le prononcé — et continue de lui accepter les blocs plus courts,
 * une semaine ou deux. L'écran et la base disent donc la même chose.
 */
export function canValidatePlacement(
  assignments: readonly RoleAssignment[],
  programId: ProgramId,
): boolean {
  if (canAccessProgramAdministration(assignments, programId)) return true;
  return assignments.some(
    (a) =>
      a.role === "placement_manager" &&
      a.scope.kind === "placement" &&
      a.scope.programId === programId,
  );
}

/**
 * LIRE ET ECRIRE LA COMMUNICATION INTERNE DU PROGRAMME.
 *
 * DECISION DE STEF, 11/09 : l'onglet « Communication interne » n'est pas
 * réservé à l'administration. L'encadrant et le responsable de stage y ont
 * leur place — ils écrivent aux mêmes personnes, sur le même stage.
 *
 * ⚠️ CETTE FONCTION EST LE MIROIR EXACT DE `is_program_staff` EN BASE, qui
 * garde les politiques de `communication_campaigns` : administrateur du
 * programme ou de la plateforme, enseignant, encadrant, responsable de stage.
 * Mesuré le 11/09 : la base l'autorisait déjà, seule la garde de l'écran
 * fermait la porte. Si l'une des deux bouge un jour, l'autre doit bouger le
 * même jour — un écran plus large offrirait des boutons qui échouent, un écran
 * plus strict cacherait un droit réellement accordé.
 */
export function canAccessInternalCommunication(
  assignments: readonly RoleAssignment[],
  programId: ProgramId,
): boolean {
  if (canAccessProgramAdministration(assignments, programId)) return true;
  return assignments.some(
    (a) =>
      (a.role === "teacher" ||
        a.role === "placement_supervisor" ||
        a.role === "placement_manager") &&
      (a.scope.kind === "platform" || a.scope.programId === programId),
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
