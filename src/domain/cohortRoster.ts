/**
 * Import / export de promotions (listes d'étudiants) — logique de domaine pure.
 *
 * Aucun accès réseau, aucun stockage : ce module transforme un texte délimité
 * (CSV/TSV) en lignes candidates contrôlées, et sérialise une promotion
 * existante en CSV. La création effective des Cohort / Enrollment /
 * RoleAssignment est simulée dans l'interface tant que l'infrastructure de
 * données n'est pas activée.
 */

import {
  detectMapping,
  parseDelimitedTable,
  type ColumnMapping,
  type HeaderAliases,
  type ParsedTable,
} from "./delimitedTable";

export const ROSTER_COLUMNS = [
  "lastName",
  "firstName",
  /**
   * Nom et prénom réunis dans une seule colonne — cas très fréquent des
   * exports de scolarité (« DUPONT Jean », « Dupont, Jean »). Reconnue à la
   * lecture et découpée ; jamais proposée dans le modèle de fichier, où l'on
   * préfère deux colonnes distinctes.
   */
  "fullName",
  "email",
  "studentNumber",
  "group",
  "placementWish",
] as const;

export type RosterColumn = (typeof ROSTER_COLUMNS)[number];

export const ROSTER_COLUMN_LABELS_FR: Record<RosterColumn, string> = {
  lastName: "Nom",
  firstName: "Prénom",
  fullName: "Nom complet (nom et prénom réunis)",
  email: "Email",
  studentNumber: "N° étudiant",
  group: "Groupe",
  placementWish: "Terrain de stage souhaité",
};

/** Colonnes sans lesquelles une inscription ne peut pas être créée. */
export const ROSTER_REQUIRED_COLUMNS: readonly RosterColumn[] = ["lastName", "firstName", "email"];

/** En-têtes acceptés pour la reconnaissance automatique des colonnes. */
const HEADER_ALIASES: HeaderAliases<RosterColumn> = {
  lastName: ["nom", "nom de famille", "lastname", "last name", "nom usuel"],
  firstName: ["prenom", "prénom", "firstname", "first name"],
  fullName: [
    "nom complet",
    "nom et prenom",
    "nom prenom",
    "prenom nom",
    "etudiant",
    "nom de l etudiant",
    "identite",
    "full name",
    "name",
  ],
  email: [
    "email",
    "e-mail",
    "mail",
    "courriel",
    "adresse email",
    "adresse electronique",
    "adresse mail",
    "mail institutionnel",
    "email institutionnel",
    "login",
    "identifiant",
  ],
  studentNumber: [
    "numero d etudiant",
    "numero d etudiant ine",
    "n° d'etudiant",
    "n etudiant",
    "n° etudiant",
    "numero etudiant",
    "numéro étudiant",
    "no etudiant",
    "matricule",
    "ine",
    "student number",
  ],
  group: ["groupe", "group", "sous groupe", "sous-groupe", "td", "classe", "brigade"],
  placementWish: [
    "terrain",
    "terrain de stage",
    "lieu de stage",
    "service",
    "affectation",
    "terrain de stage souhaite",
    "terrain de stage souhaité",
    "stage souhaite",
    "voeu de stage",
    "vœu de stage",
    "placement",
  ],
};

export type RosterColumnMapping = ColumnMapping<RosterColumn>;

export type ParsedRosterFile = ParsedTable;

export type RosterIssueLevel = "error" | "warning";

export interface RosterIssue {
  /** Numéro de ligne dans le fichier source (1 = en-tête). */
  readonly line: number;
  readonly column?: RosterColumn | undefined;
  readonly level: RosterIssueLevel;
  readonly message: string;
}

export interface RosterCandidate {
  readonly line: number;
  readonly lastName: string;
  readonly firstName: string;
  readonly email: string;
  /** Adresse composée par le motif, absente du fichier : à faire vérifier. */
  readonly emailDerived?: boolean;
  /** Nom et prénom déduits d'une colonne unique, sans signal d'ordre sûr. */
  readonly nameOrderAssumed?: boolean;
  readonly studentNumber?: string | undefined;
  readonly group?: string | undefined;
  readonly placementWish?: string | undefined;
  readonly status: "ready" | "duplicate_in_file" | "already_enrolled" | "invalid";
  readonly issues: readonly RosterIssue[];
}

export interface RosterImportPreview {
  readonly mapping: RosterColumnMapping;
  readonly missingRequiredColumns: readonly RosterColumn[];
  /** Ce que la lecture a décidé toute seule, à montrer pour qu'on puisse la corriger. */
  readonly delimiter: string;
  readonly headerLine: number;
  /** Adresses fabriquées par le motif : l'import doit les faire confirmer. */
  readonly derivedEmailCount: number;
  /** Au moins une ligne dont l'ordre nom/prénom a été supposé. */
  readonly nameOrderAssumed: boolean;
  readonly candidates: readonly RosterCandidate[];
  readonly readyCount: number;
  readonly duplicateCount: number;
  readonly alreadyEnrolledCount: number;
  readonly invalidCount: number;
  readonly issues: readonly RosterIssue[];
  /** Un import n'est proposé que si au moins une ligne est prête et sans erreur bloquante. */
  readonly canImport: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface SplitName {
  readonly lastName: string;
  readonly firstName: string;
  /** Vrai quand l'ordre nom/prénom a été supposé faute de signal. */
  readonly assumed: boolean;
}

/**
 * Sépare « nom » et « prénom » d'une colonne unique.
 *
 * Trois signaux, du plus sûr au plus faible :
 *   1. une virgule — « Dupont, Jean » : avant = nom, après = prénom ;
 *   2. des CAPITALES — « DUPONT Jean » ou « Jean DUPONT » : le bloc en
 *      capitales est le nom, où qu'il soit ;
 *   3. rien de tout cela — on suppose l'ordre administratif français
 *      « NOM Prénom » et on le SIGNALE, plutôt que de deviner en silence.
 *
 * Les particules (de, du, van, le…) restent collées au nom qui suit.
 */
export function splitFullName(value: string): SplitName {
  const raw = value.trim().replace(/\s+/g, " ");
  if (raw === "") return { lastName: "", firstName: "", assumed: false };

  const comma = raw.indexOf(",");
  if (comma >= 0) {
    return {
      lastName: raw.slice(0, comma).trim(),
      firstName: raw.slice(comma + 1).trim(),
      assumed: false,
    };
  }

  const tokens = raw.split(" ");
  if (tokens.length === 1) return { lastName: raw, firstName: "", assumed: false };

  const isUpper = (t: string) =>
    t.length > 1 && t === t.toLocaleUpperCase("fr-FR") && /\p{L}/u.test(t);
  const upper = tokens.filter(isUpper);
  if (upper.length > 0 && upper.length < tokens.length) {
    return {
      lastName: tokens.filter(isUpper).join(" "),
      firstName: tokens.filter((t) => !isUpper(t)).join(" "),
      assumed: false,
    };
  }

  // Aucun signal : ordre administratif français, et on le dit.
  const PARTICLES = new Set(["de", "du", "des", "le", "la", "van", "von", "d", "di", "el"]);
  let cut = 1;
  while (cut < tokens.length && PARTICLES.has(tokens[cut - 1]!.toLowerCase().replace(/'$/, ""))) {
    cut += 1;
  }
  return {
    lastName: tokens.slice(0, cut).join(" "),
    firstName: tokens.slice(cut).join(" "),
    assumed: true,
  };
}

/** Réduit un nom à ce qui peut entrer dans une adresse e-mail. */
function emailSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Compose une adresse à partir d'un motif, quand le fichier n'en porte pas.
 * Jetons reconnus : {prenom} {nom} {p} (initiale du prénom) {numero}.
 *
 * Une adresse ainsi fabriquée n'est JAMAIS une adresse vérifiée : elle est
 * marquée comme déduite pour que l'interface la fasse valider avant l'import.
 */
export function applyEmailPattern(
  pattern: string,
  parts: { firstName: string; lastName: string; studentNumber?: string | undefined },
): string {
  const first = emailSlug(parts.firstName);
  const last = emailSlug(parts.lastName);
  return pattern
    .trim()
    .replace(/\{prenom\}/gi, first)
    .replace(/\{nom\}/gi, last)
    .replace(/\{p\}/gi, first.slice(0, 1))
    .replace(/\{numero\}/gi, emailSlug(parts.studentNumber ?? ""))
    .toLowerCase();
}

export const EMAIL_PATTERN_PLACEHOLDER = "{prenom}.{nom}@etu.u-bordeaux.fr";

export function detectColumnMapping(headers: readonly string[]): RosterColumnMapping {
  return detectMapping(headers, HEADER_ALIASES);
}

/** Lecture d'une liste de promotion : le tableau générique, avec nos alias. */
export function parseDelimitedRoster(text: string): ParsedRosterFile {
  return parseDelimitedTable(text, HEADER_ALIASES);
}

export interface BuildRosterPreviewInput {
  readonly text: string;
  /** Mapping manuel : prioritaire sur la détection automatique. */
  readonly mapping?: RosterColumnMapping;
  /** Emails déjà inscrits dans le programme, pour signaler les doublons. */
  readonly existingEmails?: readonly string[];
  /**
   * Motif de composition des adresses, utilisé UNIQUEMENT quand le fichier
   * n'en fournit pas. Exemple : « {prenom}.{nom}@etu.u-bordeaux.fr ».
   */
  readonly emailPattern?: string;
}

export function buildRosterPreview(input: BuildRosterPreviewInput): RosterImportPreview {
  const parsed = parseDelimitedRoster(input.text);
  const mapping = { ...detectColumnMapping(parsed.headers), ...(input.mapping ?? {}) };
  const emailPattern = (input.emailPattern ?? "").trim();
  const existing = new Set((input.existingEmails ?? []).map((e) => e.trim().toLowerCase()));

  // Deux assouplissements par rapport à la règle « ces trois colonnes ou rien » :
  //   * une colonne « nom complet » remplace nom + prénom ;
  //   * un motif d'adresse remplace la colonne e-mail.
  const hasName =
    mapping.fullName !== undefined ||
    (mapping.lastName !== undefined && mapping.firstName !== undefined);
  const hasEmail = mapping.email !== undefined || emailPattern !== "";
  const missingRequiredColumns = ROSTER_REQUIRED_COLUMNS.filter((c) => {
    if (c === "email") return !hasEmail;
    return !hasName;
  });

  const issues: RosterIssue[] = [];
  if (parsed.headers.length === 0) {
    issues.push({ line: 1, level: "error", message: "Fichier vide : aucune ligne d'en-tête." });
  }
  for (const column of missingRequiredColumns) {
    issues.push({
      line: 1,
      column,
      level: "error",
      message: `Colonne obligatoire absente : ${ROSTER_COLUMN_LABELS_FR[column]}.`,
    });
  }

  const seenEmails = new Set<string>();
  const candidates: RosterCandidate[] = [];

  parsed.rows.forEach((row, index) => {
    const line = index + 2;
    const cell = (column: RosterColumn): string => {
      const at = mapping[column];
      return at === undefined ? "" : (row[at] ?? "").trim();
    };

    const rowIssues: RosterIssue[] = [];

    // Nom et prénom : deux colonnes si elles existent, sinon découpage de la
    // colonne unique.
    let lastName = cell("lastName");
    let firstName = cell("firstName");
    let nameOrderAssumed = false;
    if (mapping.fullName !== undefined && (lastName === "" || firstName === "")) {
      const split = splitFullName(cell("fullName"));
      if (lastName === "") lastName = split.lastName;
      if (firstName === "") firstName = split.firstName;
      nameOrderAssumed = split.assumed;
    }

    // Adresse : celle du fichier si elle existe, sinon celle que compose le
    // motif. Une adresse composée est marquée, jamais confondue avec une vraie.
    let email = cell("email");
    let emailDerived = false;
    if (email === "" && emailPattern !== "") {
      email = applyEmailPattern(emailPattern, {
        firstName,
        lastName,
        studentNumber: cell("studentNumber") || undefined,
      });
      emailDerived = email !== "";
      if (emailDerived) {
        rowIssues.push({
          line,
          column: "email",
          level: "warning",
          message: "Adresse composée par le motif : à vérifier avant l'import.",
        });
      }
    }
    const emailKey = email.toLowerCase();

    if (lastName === "") {
      rowIssues.push({ line, column: "lastName", level: "error", message: "Nom manquant." });
    }
    if (firstName === "") {
      rowIssues.push({ line, column: "firstName", level: "error", message: "Prénom manquant." });
    }
    if (email === "") {
      rowIssues.push({ line, column: "email", level: "error", message: "Email manquant." });
    } else if (!EMAIL_RE.test(email)) {
      rowIssues.push({
        line,
        column: "email",
        level: "error",
        message: emailDerived
          ? "Adresse composée invalide : vérifiez le motif."
          : "Email invalide.",
      });
    }

    let status: RosterCandidate["status"] = "ready";
    if (rowIssues.some((i) => i.level === "error") || missingRequiredColumns.length > 0) {
      status = "invalid";
    } else if (seenEmails.has(emailKey)) {
      status = "duplicate_in_file";
      rowIssues.push({
        line,
        column: "email",
        level: "warning",
        message: "Doublon dans le fichier : la ligne sera ignorée.",
      });
    } else if (existing.has(emailKey)) {
      status = "already_enrolled";
      rowIssues.push({
        line,
        column: "email",
        level: "warning",
        message: "Déjà inscrit dans ce programme : la ligne sera ignorée.",
      });
    }
    if (emailKey !== "") seenEmails.add(emailKey);

    issues.push(...rowIssues);
    candidates.push({
      line,
      lastName,
      firstName,
      email,
      studentNumber: cell("studentNumber") || undefined,
      group: cell("group") || undefined,
      placementWish: cell("placementWish") || undefined,
      ...(emailDerived ? { emailDerived: true } : {}),
      ...(nameOrderAssumed ? { nameOrderAssumed: true } : {}),
      status,
      issues: rowIssues,
    });
  });

  const readyCount = candidates.filter((c) => c.status === "ready").length;

  if (candidates.some((c) => c.nameOrderAssumed)) {
    issues.push({
      line: parsed.headerLine,
      level: "warning",
      message:
        "Nom et prénom lus dans une seule colonne, sans majuscules ni virgule pour trancher : " +
        "l'ordre « NOM Prénom » a été supposé. Vérifiez la prévisualisation.",
    });
  }

  return {
    mapping,
    missingRequiredColumns,
    delimiter: parsed.delimiter,
    headerLine: parsed.headerLine,
    derivedEmailCount: candidates.filter((c) => c.emailDerived).length,
    nameOrderAssumed: candidates.some((c) => c.nameOrderAssumed),
    candidates,
    readyCount,
    duplicateCount: candidates.filter((c) => c.status === "duplicate_in_file").length,
    alreadyEnrolledCount: candidates.filter((c) => c.status === "already_enrolled").length,
    invalidCount: candidates.filter((c) => c.status === "invalid").length,
    issues,
    canImport: readyCount > 0 && missingRequiredColumns.length === 0,
  };
}

/** Modèle de fichier proposé au téléchargement dans l'interface. */
const TEMPLATE_COLUMNS: readonly RosterColumn[] = [
  "lastName",
  "firstName",
  "email",
  "studentNumber",
  "group",
  "placementWish",
];

export const ROSTER_TEMPLATE_CSV = [
  TEMPLATE_COLUMNS.map((c) => ROSTER_COLUMN_LABELS_FR[c]).join(";"),
  "Benali;Karim;karim.benali@example.org;20250114;Groupe A;CHU Nord — Cardiologie",
  "Duval;Léa;lea.duval@example.org;20250115;Groupe B;CHU Sud — Échocardiographie",
].join("\n");

function csvCell(value: string | number | undefined): string {
  const raw = value === undefined ? "" : String(value);
  return /[";\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | undefined)[])[],
): string {
  return [headers.join(";"), ...rows.map((r) => r.map(csvCell).join(";"))].join("\n");
}

export interface CohortExportRow {
  readonly fullName: string;
  readonly email: string;
  readonly cohortLabel: string;
  readonly academicYear: string;
  readonly enrollmentStatus: string;
}

/** Export d'une promotion : identités et état d'inscription, sans dossier pédagogique. */
export function buildCohortExportCsv(rows: readonly CohortExportRow[]): string {
  return toCsv(
    ["Nom complet", "Email", "Promotion", "Année universitaire", "Statut d'inscription"],
    rows.map((r) => [r.fullName, r.email, r.cohortLabel, r.academicYear, r.enrollmentStatus]),
  );
}
