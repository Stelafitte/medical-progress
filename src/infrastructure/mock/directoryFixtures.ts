/**
 * Amorçage de l'ANNUAIRE local à partir des fixtures existantes.
 *
 * TRANSITION documentée : les fixtures historiques ne portent qu'un `fullName`
 * et un `email` sur `Person`. On en dérive ici, sans les modifier :
 * - un prénom / nom séparés (découpage sur le premier espace) ;
 * - un `UserAccount` distinct portant l'e-mail de connexion normalisé ;
 * - un cycle de vie de cohorte (`active` par défaut).
 *
 * Aucune fixture n'est réécrite : cette dérivation disparaîtra quand le modèle
 * réel exposera Person et UserAccount séparément.
 */
import * as fx from "@/infrastructure/mock/fixtures";
import {
  normaliseEmail,
  type AccountStatus,
  type DirectoryCohort,
  type DirectoryEnrollment,
  type DirectoryPerson,
  type DirectoryState,
  type UserAccount,
} from "@/domain/directory";

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: "", lastName: parts[0] ?? "" };
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

/**
 * Statut de compte simulé : les deux premières personnes de démonstration sont
 * « actives », les suivantes restent « invitées » pour illustrer l'écart entre
 * inscription et activation de compte.
 */
function seededAccountStatus(index: number): AccountStatus {
  return index < 4 ? "active" : "invited";
}

export function buildInitialDirectoryState(): DirectoryState {
  const people: DirectoryPerson[] = fx.people.map((p) => {
    const { firstName, lastName } = splitName(p.fullName);
    return {
      id: p.id,
      firstName,
      lastName,
      origin: "fixture",
      createdAt: p.createdAt,
    };
  });

  const accounts: UserAccount[] = fx.people.map((p, index) => ({
    id: `acc-${p.id}`,
    personId: p.id,
    loginEmail: normaliseEmail(p.email),
    status: seededAccountStatus(index),
    invitedAt: p.createdAt,
    ...(seededAccountStatus(index) === "active" ? { activatedAt: p.createdAt } : {}),
    isSimulated: true as const,
  }));

  const cohorts: DirectoryCohort[] = fx.cohorts.map((c) => ({
    id: c.id,
    programId: c.programId,
    label: c.label,
    academicYear: c.academicYear,
    lifecycle: "active",
  }));

  const enrollments: DirectoryEnrollment[] = fx.enrollments.map((e) => ({
    id: e.id,
    personId: e.personId,
    programId: e.programId,
    cohortId: e.cohortId,
    status: e.status,
    origin: "fixture",
    enrolledAt: e.createdAt,
  }));

  return {
    people,
    accounts,
    cohorts,
    enrollments,
    roleAssignments: fx.roleAssignments,
    isSimulated: true,
  };
}
