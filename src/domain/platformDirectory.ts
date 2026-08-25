/**
 * Domaine PLATEFORME : annuaire par groupe de rôle, édition de fiche et
 * audience « non-apprenants ».
 *
 * Règles non négociables :
 * - un rôle reste contextualisé : un groupe n'est qu'une lecture d'agrégation ;
 * - l'administration plateforme ne voit jamais un dossier pédagogique (preuves,
 *   carnets, progression) : seules identité, rôles et statut de compte sont
 *   manipulables ;
 * - toute modification de fiche exige un motif tracé (AuditEvent).
 */
import type { Person, PersonId, ProgramId, RoleAssignment } from "./types";

export type PlatformRoleGroup =
  | "platform_admin"
  | "program_admin"
  | "placement_supervisor"
  | "teacher"
  | "learner";

export const PLATFORM_ROLE_GROUP_LABELS_FR: Record<PlatformRoleGroup, string> = {
  platform_admin: "Administrateurs plateforme",
  program_admin: "Administrateurs de programme",
  placement_supervisor: "Responsables de stage",
  teacher: "Enseignants",
  learner: "Apprenants",
};

/** Ordre d'affichage imposé : du plus large périmètre au plus restreint. */
export const PLATFORM_ROLE_GROUP_ORDER: readonly PlatformRoleGroup[] = [
  "platform_admin",
  "program_admin",
  "placement_supervisor",
  "teacher",
  "learner",
];

/** Un apprenant n'appartient jamais à l'audience « non-apprenants ». */
export const NON_LEARNER_GROUPS: readonly PlatformRoleGroup[] = [
  "platform_admin",
  "program_admin",
  "placement_supervisor",
  "teacher",
];

export const PLATFORM_NO_PEDAGOGY_FR =
  "L'administration plateforme ne peut ouvrir ni preuve, ni carnet, ni progression : la fiche se limite à l'identité, aux rôles et au statut du compte.";

/** Groupe déduit d'une assignation contextualisée. */
export function roleGroupOf(assignment: RoleAssignment): PlatformRoleGroup {
  switch (assignment.role) {
    case "administrator":
      return assignment.scope.kind === "platform" ? "platform_admin" : "program_admin";
    case "placement_supervisor":
      return "placement_supervisor";
    case "teacher":
      return "teacher";
    default:
      return "learner";
  }
}

export interface PlatformDirectoryRow {
  readonly personId: PersonId;
  readonly fullName: string;
  readonly email: string;
  readonly groups: readonly PlatformRoleGroup[];
  readonly programIds: readonly ProgramId[];
  /** Nombre d'assignations, utile pour repérer les cumuls de périmètre. */
  readonly assignmentCount: number;
}

/** Annuaire plateforme : une ligne par personne ayant au moins un rôle. */
export function buildPlatformDirectory(
  people: readonly Person[],
  assignments: readonly RoleAssignment[],
): readonly PlatformDirectoryRow[] {
  const rows: PlatformDirectoryRow[] = [];
  for (const person of people) {
    const own = assignments.filter((a) => a.personId === person.id);
    if (own.length === 0) continue;
    const groups = [...new Set(own.map(roleGroupOf))].sort(
      (a, b) => PLATFORM_ROLE_GROUP_ORDER.indexOf(a) - PLATFORM_ROLE_GROUP_ORDER.indexOf(b),
    );
    const programIds = [
      ...new Set(
        own.flatMap((a) => ("programId" in a.scope ? [a.scope.programId as ProgramId] : [])),
      ),
    ];
    rows.push({
      personId: person.id,
      fullName: person.fullName,
      email: person.email,
      groups,
      programIds,
      assignmentCount: own.length,
    });
  }
  return rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));
}

/** Répartition par groupe : une personne cumulant des rôles apparaît plusieurs fois. */
export function groupPlatformDirectory(
  rows: readonly PlatformDirectoryRow[],
): Record<PlatformRoleGroup, readonly PlatformDirectoryRow[]> {
  const out = {} as Record<PlatformRoleGroup, PlatformDirectoryRow[]>;
  for (const group of PLATFORM_ROLE_GROUP_ORDER) out[group] = [];
  for (const row of rows) for (const group of row.groups) out[group].push(row);
  return out;
}

/** Destinataires « non-apprenants » : intervenants uniquement. */
export function resolveNonLearnerRecipients(
  rows: readonly PlatformDirectoryRow[],
): readonly PlatformDirectoryRow[] {
  return rows.filter((row) => row.groups.some((g) => NON_LEARNER_GROUPS.includes(g)));
}

/* ------------------------------------------------------------------ */
/* Édition d'une fiche                                                 */
/* ------------------------------------------------------------------ */

export type AccountStatus = "active" | "suspended";

export const ACCOUNT_STATUS_LABELS_FR: Record<AccountStatus, string> = {
  active: "compte actif",
  suspended: "compte suspendu",
};

export interface PersonEditInput {
  readonly fullName: string;
  readonly email: string;
  readonly status: AccountStatus;
  readonly notifyByEmail: boolean;
  /** Motif obligatoire : toute modification est tracée. */
  readonly reason: string;
}

/** Validation PURE de l'édition d'une fiche par l'administration plateforme. */
export function validatePersonEdit(input: PersonEditInput): readonly string[] {
  const errors: string[] = [];
  if (input.fullName.trim().length < 3) errors.push("Le nom complet est requis (3 caractères).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email.trim()))
    errors.push("L'adresse e-mail n'est pas valide.");
  if (input.reason.trim().length < 5)
    errors.push("Un motif de modification d'au moins 5 caractères est obligatoire.");
  return errors;
}

/** Libellé d'audit produit par une modification de fiche. */
export function personEditAuditLabel(row: PlatformDirectoryRow, input: PersonEditInput): string {
  return `Fiche ${row.fullName} modifiée par l'administration plateforme — motif : ${input.reason.trim()}`;
}
