/**
 * ANNUAIRE GÉNÉRIQUE : personnes, comptes, cohortes, inscriptions, rôles.
 *
 * Couche de domaine PURE (aucun réseau, aucun stockage, aucun e-mail) qui
 * sépare enfin quatre concepts jusqu'ici confondus dans les fixtures :
 *
 * - `DirectoryPerson`   : identité pédagogique (qui est la personne) ;
 * - `UserAccount`       : compte de connexion (e-mail normalisé + statut) ;
 * - `DirectoryCohort`   : promotion / groupe, avec cycle de vie active/archived ;
 * - `DirectoryEnrollment` : inscription d'une personne dans UN programme et UNE cohorte ;
 * - `RoleAssignment`    : rôle contextualisé (réutilisé de `types.ts`, non dupliqué).
 *
 * TRANSITION (important) : ce module n'écrase pas le modèle existant. Il
 * s'alimente des fixtures actuelles (`src/infrastructure/mock/directoryFixtures.ts`)
 * et vit à côté d'elles. Les écrans historiques continuent de lire les fixtures ;
 * seul l'écran « Personnes et inscriptions » lit l'annuaire. La bascule complète
 * se fera quand l'infrastructure de données réelle sera activée : les identifiants
 * et les statuts sont déjà alignés sur `Person`, `Cohort` et `Enrollment`.
 *
 * SIMULATION : toute mutation renvoie un NOUVEL état en mémoire. Rien n'est
 * envoyé, rien n'est persisté côté serveur, aucune invitation n'est expédiée.
 */
import type {
  CohortId,
  EnrollmentId,
  IsoDateTime,
  PersonId,
  ProgramId,
  RoleAssignment,
  RoleName,
} from "./types";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Statut d'un COMPTE (distinct du statut d'inscription). */
export type AccountStatus = "invited" | "active" | "suspended";

export const ACCOUNT_STATUS_LABELS_FR: Record<AccountStatus, string> = {
  invited: "invité (non activé)",
  active: "actif",
  suspended: "suspendu",
};

/** Statut d'une INSCRIPTION (distinct du statut de compte). */
export type EnrollmentStatus = "active" | "suspended" | "completed" | "withdrawn";

export const ENROLLMENT_STATUS_LABELS_FR: Record<EnrollmentStatus, string> = {
  active: "active",
  suspended: "suspendue",
  completed: "terminée",
  withdrawn: "retirée",
};

/** Cycle de vie d'une cohorte : une cohorte archivée n'accepte plus d'inscription. */
export type CohortLifecycle = "active" | "archived";

/** Origine de la donnée : saisie individuelle, import de fichier, ou jeu de démonstration. */
export type DirectoryOrigin = "individual" | "import" | "fixture";

export const ORIGIN_LABELS_FR: Record<DirectoryOrigin, string> = {
  individual: "ajout individuel",
  import: "import de fichier",
  fixture: "jeu de démonstration",
};

export interface DirectoryPerson {
  readonly id: PersonId;
  readonly firstName: string;
  readonly lastName: string;
  /** Identifiant institutionnel facultatif (n° étudiant, matricule, RPPS…). */
  readonly institutionalId?: string | undefined;
  readonly origin: DirectoryOrigin;
  readonly createdAt: IsoDateTime;
}

export interface UserAccount {
  readonly id: string;
  readonly personId: PersonId;
  /** E-mail de connexion, TOUJOURS stocké normalisé (minuscules, sans espaces). */
  readonly loginEmail: string;
  readonly status: AccountStatus;
  readonly invitedAt: IsoDateTime;
  readonly activatedAt?: IsoDateTime | undefined;
  /** Rappel explicite : aucune invitation réelle n'est envoyée dans la maquette. */
  readonly isSimulated: true;
}

export interface DirectoryCohort {
  readonly id: CohortId;
  readonly programId: ProgramId;
  readonly label: string;
  readonly academicYear: string;
  readonly lifecycle: CohortLifecycle;
}

export interface DirectoryEnrollment {
  readonly id: EnrollmentId;
  readonly personId: PersonId;
  readonly programId: ProgramId;
  readonly cohortId: CohortId;
  readonly status: EnrollmentStatus;
  readonly origin: DirectoryOrigin;
  /** Date d'inscription SIMULÉE (aucune horloge serveur). */
  readonly enrolledAt: IsoDateTime;
  readonly withdrawnAt?: IsoDateTime | undefined;
}

export interface DirectoryState {
  readonly people: readonly DirectoryPerson[];
  readonly accounts: readonly UserAccount[];
  readonly cohorts: readonly DirectoryCohort[];
  readonly enrollments: readonly DirectoryEnrollment[];
  readonly roleAssignments: readonly RoleAssignment[];
  /** Vrai tant que l'annuaire est local : jamais publié comme donnée réelle. */
  readonly isSimulated: true;
}

/* ------------------------------------------------------------------ */
/* Aides pures                                                         */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normalisation unique de l'e-mail : c'est la clé d'unicité de la plateforme. */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(normaliseEmail(value));
}

export function fullNameOf(person: DirectoryPerson): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

/** Recherche d'un COMPTE par e-mail normalisé, sur TOUTE la plateforme. */
export function findAccountByEmail(
  state: DirectoryState,
  email: string,
): UserAccount | undefined {
  const key = normaliseEmail(email);
  return state.accounts.find((a) => a.loginEmail === key);
}

/** Recherche de la PERSONNE derrière un e-mail (via son compte). */
export function findPersonByEmail(
  state: DirectoryState,
  email: string,
): DirectoryPerson | undefined {
  const account = findAccountByEmail(state, email);
  if (!account) return undefined;
  return state.people.find((p) => p.id === account.personId);
}

export function accountForPerson(
  state: DirectoryState,
  personId: PersonId,
): UserAccount | undefined {
  return state.accounts.find((a) => a.personId === personId);
}

export function personById(
  state: DirectoryState,
  personId: PersonId,
): DirectoryPerson | undefined {
  return state.people.find((p) => p.id === personId);
}

/**
 * Une seconde inscription ACTIVE dans le même programme ET la même cohorte est
 * interdite. Une inscription retirée ne bloque pas une réinscription.
 */
export function hasActiveEnrollment(
  state: DirectoryState,
  personId: PersonId,
  programId: ProgramId,
  cohortId: CohortId,
): boolean {
  return state.enrollments.some(
    (e) =>
      e.personId === personId &&
      e.programId === programId &&
      e.cohortId === cohortId &&
      e.status !== "withdrawn",
  );
}

/* ------------------------------------------------------------------ */
/* Sélection CONTEXTUALISÉE (jamais toute la plateforme)               */
/* ------------------------------------------------------------------ */

export interface DirectoryRow {
  readonly enrollment: DirectoryEnrollment;
  readonly person: DirectoryPerson;
  readonly fullName: string;
  readonly email: string;
  readonly accountStatus: AccountStatus;
  readonly cohortLabel: string;
  readonly cohortLifecycle: CohortLifecycle;
  readonly roles: readonly RoleName[];
}

export interface DirectoryScope {
  readonly programId: ProgramId;
  readonly cohorts: readonly DirectoryCohort[];
  readonly rows: readonly DirectoryRow[];
}

/**
 * Périmètre d'un programme : AUCUNE personne extérieure au programme n'est
 * exposée. C'est l'équivalent maquette de ce qui devra être imposé
 * **côté serveur** (RLS + filtrage requête) dans le produit réel : le filtrage
 * client ne vaut pas contrôle d'accès.
 */
export function selectProgramDirectory(
  state: DirectoryState,
  programId: ProgramId,
): DirectoryScope {
  const cohorts = state.cohorts.filter((c) => c.programId === programId);
  const rows: DirectoryRow[] = [];

  for (const enrollment of state.enrollments) {
    if (enrollment.programId !== programId) continue;
    const person = personById(state, enrollment.personId);
    if (!person) continue;
    const account = accountForPerson(state, person.id);
    const cohort = cohorts.find((c) => c.id === enrollment.cohortId);
    rows.push({
      enrollment,
      person,
      fullName: fullNameOf(person),
      email: account?.loginEmail ?? "—",
      accountStatus: account?.status ?? "invited",
      cohortLabel: cohort?.label ?? enrollment.cohortId,
      cohortLifecycle: cohort?.lifecycle ?? "active",
      roles: rolesForPersonInProgram(state, person.id, programId),
    });
  }

  return { programId, cohorts, rows };
}

/** Rôles d'une personne DANS ce programme uniquement (portée programme ou cohorte). */
export function rolesForPersonInProgram(
  state: DirectoryState,
  personId: PersonId,
  programId: ProgramId,
): readonly RoleName[] {
  const roles = state.roleAssignments
    .filter(
      (r) =>
        r.personId === personId && "programId" in r.scope && r.scope.programId === programId,
    )
    .map((r) => r.role);
  return [...new Set(roles)];
}

export interface DirectorySummary {
  readonly enrolledCount: number;
  readonly activeCount: number;
  readonly withdrawnCount: number;
  readonly withoutActivatedAccount: number;
  readonly duplicateEmailCount: number;
  readonly archivedCohortCount: number;
}

export function summariseDirectory(scope: DirectoryScope): DirectorySummary {
  const emails = scope.rows.map((r) => r.email).filter((e) => e !== "—");
  const seen = new Set<string>();
  let duplicates = 0;
  for (const email of emails) {
    if (seen.has(email)) duplicates += 1;
    seen.add(email);
  }
  return {
    enrolledCount: scope.rows.length,
    activeCount: scope.rows.filter((r) => r.enrollment.status === "active").length,
    withdrawnCount: scope.rows.filter((r) => r.enrollment.status === "withdrawn").length,
    withoutActivatedAccount: scope.rows.filter((r) => r.accountStatus !== "active").length,
    duplicateEmailCount: duplicates,
    archivedCohortCount: scope.cohorts.filter((c) => c.lifecycle === "archived").length,
  };
}

/* ------------------------------------------------------------------ */
/* Mutations locales (retournent un nouvel état)                       */
/* ------------------------------------------------------------------ */

export type DirectoryErrorCode =
  | "missing_first_name"
  | "missing_last_name"
  | "missing_email"
  | "invalid_email"
  | "unknown_cohort"
  | "archived_cohort"
  | "duplicate_active_enrollment"
  | "existing_person_requires_choice"
  | "unknown_enrollment";

export const DIRECTORY_ERROR_LABELS_FR: Record<DirectoryErrorCode, string> = {
  missing_first_name: "Prénom obligatoire.",
  missing_last_name: "Nom obligatoire.",
  missing_email: "E-mail obligatoire.",
  invalid_email: "E-mail invalide.",
  unknown_cohort: "Cohorte inconnue dans ce programme.",
  archived_cohort: "Cohorte archivée : aucune nouvelle inscription possible.",
  duplicate_active_enrollment:
    "Cette personne a déjà une inscription active dans ce programme et cette cohorte.",
  existing_person_requires_choice:
    "Un compte existe déjà avec cet e-mail : rattacher la personne existante ou corriger l'e-mail.",
  unknown_enrollment: "Inscription inconnue.",
};

export type DirectoryResult<T> =
  | ({ readonly ok: true; readonly state: DirectoryState } & T)
  | {
      readonly ok: false;
      readonly code: DirectoryErrorCode;
      readonly message: string;
      /** Personne existante proposée au rattachement, le cas échéant. */
      readonly existingPerson?: DirectoryPerson | undefined;
    };

function failure(
  code: DirectoryErrorCode,
  existingPerson?: DirectoryPerson,
): DirectoryResult<never> {
  return { ok: false, code, message: DIRECTORY_ERROR_LABELS_FR[code], existingPerson };
}

export interface AddIndividualInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly institutionalId?: string | undefined;
  readonly programId: ProgramId;
  readonly cohortId: CohortId;
  readonly role: RoleName;
  readonly enrollmentStatus: EnrollmentStatus;
  /**
   * Rattachement explicite d'une personne déjà connue de la plateforme.
   * Sans ce drapeau, un e-mail déjà connu déclenche une demande de décision
   * plutôt qu'une duplication silencieuse.
   */
  readonly attachExistingPerson?: boolean;
  readonly now: IsoDateTime;
  readonly origin?: DirectoryOrigin;
}

export interface AddIndividualOutcome {
  readonly personId: PersonId;
  readonly enrollmentId: EnrollmentId;
  /** Vrai si une personne existante a été réutilisée au lieu d'être dupliquée. */
  readonly attachedExistingPerson: boolean;
}

/** Ajout individuel : recherche globale par e-mail, puis inscription contextuelle. */
export function addIndividual(
  state: DirectoryState,
  input: AddIndividualInput,
): DirectoryResult<AddIndividualOutcome> {
  if (input.firstName.trim() === "") return failure("missing_first_name");
  if (input.lastName.trim() === "") return failure("missing_last_name");
  if (input.email.trim() === "") return failure("missing_email");
  if (!isValidEmail(input.email)) return failure("invalid_email");

  const cohort = state.cohorts.find(
    (c) => c.id === input.cohortId && c.programId === input.programId,
  );
  if (!cohort) return failure("unknown_cohort");
  if (cohort.lifecycle === "archived") return failure("archived_cohort");

  const email = normaliseEmail(input.email);
  const existing = findPersonByEmail(state, email);

  if (existing && !input.attachExistingPerson) {
    return failure("existing_person_requires_choice", existing);
  }
  if (existing && hasActiveEnrollment(state, existing.id, input.programId, input.cohortId)) {
    return failure("duplicate_active_enrollment", existing);
  }

  const origin: DirectoryOrigin = input.origin ?? "individual";
  const personId = existing?.id ?? (`per-local-${slug(email)}` as PersonId);

  const people = existing
    ? state.people
    : [
        ...state.people,
        {
          id: personId,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          institutionalId: input.institutionalId?.trim() || undefined,
          origin,
          createdAt: input.now,
        } satisfies DirectoryPerson,
      ];

  const accounts = existing
    ? state.accounts
    : [
        ...state.accounts,
        {
          id: `acc-local-${slug(email)}`,
          personId,
          loginEmail: email,
          status: "invited" as AccountStatus,
          invitedAt: input.now,
          isSimulated: true as const,
        },
      ];

  const enrollmentId = `enr-local-${slug(email)}-${input.programId}-${input.cohortId}` as EnrollmentId;
  const enrollments = [
    ...state.enrollments,
    {
      id: enrollmentId,
      personId,
      programId: input.programId,
      cohortId: input.cohortId,
      status: input.enrollmentStatus,
      origin,
      enrolledAt: input.now,
    } satisfies DirectoryEnrollment,
  ];

  const alreadyHasRole = state.roleAssignments.some(
    (r) =>
      r.personId === personId &&
      r.role === input.role &&
      "programId" in r.scope &&
      r.scope.programId === input.programId,
  );
  const roleAssignments = alreadyHasRole
    ? state.roleAssignments
    : [
        ...state.roleAssignments,
        {
          personId,
          role: input.role,
          scope:
            input.role === "learner"
              ? {
                  kind: "cohort" as const,
                  programId: input.programId,
                  cohortId: input.cohortId,
                }
              : { kind: "program" as const, programId: input.programId },
          grantedAt: input.now,
          provenance: { sourceSystem: "native" as const },
        } satisfies RoleAssignment,
      ];

  return {
    ok: true,
    state: { ...state, people, accounts, enrollments, roleAssignments },
    personId,
    enrollmentId,
    attachedExistingPerson: Boolean(existing),
  };
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

/**
 * Retrait d'une inscription : passage à `withdrawn`. La personne, son compte,
 * ses rôles et son historique sont CONSERVÉS — aucune suppression.
 */
export function withdrawEnrollment(
  state: DirectoryState,
  enrollmentId: EnrollmentId,
  now: IsoDateTime,
): DirectoryResult<{ readonly enrollmentId: EnrollmentId }> {
  const target = state.enrollments.find((e) => e.id === enrollmentId);
  if (!target) return failure("unknown_enrollment");
  const enrollments = state.enrollments.map((e) =>
    e.id === enrollmentId ? { ...e, status: "withdrawn" as EnrollmentStatus, withdrawnAt: now } : e,
  );
  return { ok: true, state: { ...state, enrollments }, enrollmentId };
}

/** Archivage d'une cohorte : elle reste consultable, mais n'accepte plus d'inscription. */
export function archiveCohort(
  state: DirectoryState,
  cohortId: CohortId,
): DirectoryResult<{ readonly cohortId: CohortId }> {
  if (!state.cohorts.some((c) => c.id === cohortId)) return failure("unknown_cohort");
  const cohorts = state.cohorts.map((c) =>
    c.id === cohortId ? { ...c, lifecycle: "archived" as CohortLifecycle } : c,
  );
  return { ok: true, state: { ...state, cohorts }, cohortId };
}

/* ------------------------------------------------------------------ */
/* Import groupé                                                       */
/* ------------------------------------------------------------------ */

/** Ligne prête à importer, telle que produite par `cohortRoster.ts`. */
export interface ImportableRow {
  readonly line: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly studentNumber?: string | undefined;
}

export type ExistingEmailStrategy = "attach" | "skip";

export interface ApplyImportInput {
  readonly programId: ProgramId;
  readonly cohortId: CohortId;
  readonly role: RoleName;
  readonly rows: readonly ImportableRow[];
  readonly existingEmailStrategy: ExistingEmailStrategy;
  readonly now: IsoDateTime;
}

export interface ImportLineOutcome {
  readonly line: number;
  readonly email: string;
  readonly result: "created" | "attached" | "skipped_existing" | "skipped_duplicate" | "rejected";
  readonly message?: string | undefined;
}

export interface ApplyImportReport {
  readonly created: number;
  readonly attached: number;
  readonly skipped: number;
  readonly rejected: number;
  readonly lines: readonly ImportLineOutcome[];
}

/** Application d'un import contrôlé à l'état local. Aucune écriture distante. */
export function applyRosterImport(
  state: DirectoryState,
  input: ApplyImportInput,
): { readonly state: DirectoryState; readonly report: ApplyImportReport } {
  let next = state;
  const lines: ImportLineOutcome[] = [];
  const seen = new Set<string>();

  for (const row of input.rows) {
    const email = normaliseEmail(row.email);
    if (seen.has(email)) {
      lines.push({
        line: row.line,
        email,
        result: "skipped_duplicate",
        message: "Doublon dans le fichier.",
      });
      continue;
    }
    seen.add(email);

    const existing = findPersonByEmail(next, email);
    if (existing && input.existingEmailStrategy === "skip") {
      lines.push({
        line: row.line,
        email,
        result: "skipped_existing",
        message: "Personne déjà connue : ligne ignorée.",
      });
      continue;
    }

    const outcome = addIndividual(next, {
      firstName: row.firstName,
      lastName: row.lastName,
      email,
      institutionalId: row.studentNumber,
      programId: input.programId,
      cohortId: input.cohortId,
      role: input.role,
      enrollmentStatus: "active",
      attachExistingPerson: true,
      origin: "import",
      now: input.now,
    });

    if (!outcome.ok) {
      lines.push({ line: row.line, email, result: "rejected", message: outcome.message });
      continue;
    }
    next = outcome.state;
    lines.push({
      line: row.line,
      email,
      result: outcome.attachedExistingPerson ? "attached" : "created",
    });
  }

  return {
    state: next,
    report: {
      created: lines.filter((l) => l.result === "created").length,
      attached: lines.filter((l) => l.result === "attached").length,
      skipped: lines.filter((l) => l.result.startsWith("skipped")).length,
      rejected: lines.filter((l) => l.result === "rejected").length,
      lines,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export interface DirectoryFilter {
  readonly search?: string;
  readonly cohortId?: CohortId | "all";
  readonly role?: RoleName | "all";
  readonly enrollmentStatus?: EnrollmentStatus | "all";
  readonly accountStatus?: AccountStatus | "all";
}

export function filterDirectoryRows(
  rows: readonly DirectoryRow[],
  filter: DirectoryFilter,
): readonly DirectoryRow[] {
  const search = (filter.search ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (
      search !== "" &&
      !row.fullName.toLowerCase().includes(search) &&
      !row.email.includes(search)
    )
      return false;
    if (filter.cohortId && filter.cohortId !== "all" && row.enrollment.cohortId !== filter.cohortId)
      return false;
    if (filter.role && filter.role !== "all" && !row.roles.includes(filter.role)) return false;
    if (
      filter.enrollmentStatus &&
      filter.enrollmentStatus !== "all" &&
      row.enrollment.status !== filter.enrollmentStatus
    )
      return false;
    if (
      filter.accountStatus &&
      filter.accountStatus !== "all" &&
      row.accountStatus !== filter.accountStatus
    )
      return false;
    return true;
  });
}
