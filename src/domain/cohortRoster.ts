/**
 * Import / export de promotions (listes d'étudiants) — logique de domaine pure.
 *
 * Aucun accès réseau, aucun stockage : ce module transforme un texte délimité
 * (CSV/TSV) en lignes candidates contrôlées, et sérialise une promotion
 * existante en CSV. La création effective des Cohort / Enrollment /
 * RoleAssignment est simulée dans l'interface tant que l'infrastructure de
 * données n'est pas activée.
 */

export const ROSTER_COLUMNS = [
  "lastName",
  "firstName",
  "email",
  "studentNumber",
  "group",
  "placementWish",
] as const;

export type RosterColumn = (typeof ROSTER_COLUMNS)[number];

export const ROSTER_COLUMN_LABELS_FR: Record<RosterColumn, string> = {
  lastName: "Nom",
  firstName: "Prénom",
  email: "Email",
  studentNumber: "N° étudiant",
  group: "Groupe",
  placementWish: "Terrain de stage souhaité",
};

/** Colonnes sans lesquelles une inscription ne peut pas être créée. */
export const ROSTER_REQUIRED_COLUMNS: readonly RosterColumn[] = ["lastName", "firstName", "email"];

/** En-têtes acceptés pour la reconnaissance automatique des colonnes. */
const HEADER_ALIASES: Record<RosterColumn, readonly string[]> = {
  lastName: ["nom", "nom de famille", "lastname", "last name", "name"],
  firstName: ["prenom", "prénom", "firstname", "first name"],
  email: ["email", "e-mail", "mail", "courriel", "adresse email"],
  studentNumber: [
    "n etudiant",
    "n° etudiant",
    "numero etudiant",
    "numéro étudiant",
    "no etudiant",
    "matricule",
    "ine",
    "student number",
  ],
  group: ["groupe", "group", "sous-groupe", "td", "classe"],
  placementWish: [
    "terrain de stage souhaite",
    "terrain de stage souhaité",
    "stage souhaite",
    "voeu de stage",
    "vœu de stage",
    "placement",
  ],
};

export type RosterColumnMapping = Partial<Record<RosterColumn, number>>;

export interface ParsedRosterFile {
  readonly delimiter: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export type RosterIssueLevel = "error" | "warning";

export interface RosterIssue {
  /** Numéro de ligne dans le fichier source (1 = en-tête). */
  readonly line: number;
  readonly column?: RosterColumn;
  readonly level: RosterIssueLevel;
  readonly message: string;
}

export interface RosterCandidate {
  readonly line: number;
  readonly lastName: string;
  readonly firstName: string;
  readonly email: string;
  readonly studentNumber?: string;
  readonly group?: string;
  readonly placementWish?: string;
  readonly status: "ready" | "duplicate_in_file" | "already_enrolled" | "invalid";
  readonly issues: readonly RosterIssue[];
}

export interface RosterImportPreview {
  readonly mapping: RosterColumnMapping;
  readonly missingRequiredColumns: readonly RosterColumn[];
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

function normaliseHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_.]/g, " ")
    .replace(/\s+/g, " ");
}

function detectDelimiter(headerLine: string): string {
  const candidates = [";", "\t", ",", "|"];
  let best = ";";
  let bestCount = -1;
  for (const c of candidates) {
    const count = headerLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return bestCount <= 0 ? ";" : best;
}

/** Découpe une ligne en respectant les guillemets doubles. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function parseDelimitedRoster(text: string): ParsedRosterFile {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { delimiter: ";", headers: [], rows: [] };

  const delimiter = detectDelimiter(lines[0]!);
  const headers = splitLine(lines[0]!, delimiter);
  const rows = lines.slice(1).map((l) => splitLine(l, delimiter));
  return { delimiter, headers, rows };
}

export function detectColumnMapping(headers: readonly string[]): RosterColumnMapping {
  const mapping: RosterColumnMapping = {};
  const normalised = headers.map(normaliseHeader);
  for (const column of ROSTER_COLUMNS) {
    const index = normalised.findIndex((h) => HEADER_ALIASES[column].includes(h));
    if (index >= 0) (mapping as Record<string, number>)[column] = index;
  }
  return mapping;
}

export interface BuildRosterPreviewInput {
  readonly text: string;
  /** Mapping manuel : prioritaire sur la détection automatique. */
  readonly mapping?: RosterColumnMapping;
  /** Emails déjà inscrits dans le programme, pour signaler les doublons. */
  readonly existingEmails?: readonly string[];
}

export function buildRosterPreview(input: BuildRosterPreviewInput): RosterImportPreview {
  const parsed = parseDelimitedRoster(input.text);
  const mapping = { ...detectColumnMapping(parsed.headers), ...(input.mapping ?? {}) };
  const missingRequiredColumns = ROSTER_REQUIRED_COLUMNS.filter((c) => mapping[c] === undefined);
  const existing = new Set((input.existingEmails ?? []).map((e) => e.trim().toLowerCase()));

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
    const lastName = cell("lastName");
    const firstName = cell("firstName");
    const email = cell("email");
    const emailKey = email.toLowerCase();

    for (const column of ROSTER_REQUIRED_COLUMNS) {
      if (mapping[column] !== undefined && cell(column) === "") {
        rowIssues.push({
          line,
          column,
          level: "error",
          message: `${ROSTER_COLUMN_LABELS_FR[column]} manquant.`,
        });
      }
    }
    if (email !== "" && !EMAIL_RE.test(email)) {
      rowIssues.push({ line, column: "email", level: "error", message: "Email invalide." });
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
      status,
      issues: rowIssues,
    });
  });

  const readyCount = candidates.filter((c) => c.status === "ready").length;

  return {
    mapping,
    missingRequiredColumns,
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
export const ROSTER_TEMPLATE_CSV = [
  ROSTER_COLUMNS.map((c) => ROSTER_COLUMN_LABELS_FR[c]).join(";"),
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
