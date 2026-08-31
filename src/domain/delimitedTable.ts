/**
 * Lecture d'un tableau délimité, quel que soit son contenu — logique pure.
 *
 * Extrait de `cohortRoster` le 31/08 : la détection du séparateur, la recherche
 * de la ligne d'en-tête et le respect des guillemets n'ont rien à voir avec des
 * étudiants. Le même code sert désormais à lire une liste de promotion et un
 * référentiel de compétences.
 *
 * Ce module ne connaît aucune colonne métier : on lui donne un dictionnaire
 * d'alias, il rend une correspondance colonne → indice.
 */

/** Alias acceptés pour chaque colonne métier, normalisés (sans accents, en minuscules). */
export type HeaderAliases<C extends string> = Record<C, readonly string[]>;

export type ColumnMapping<C extends string> = Partial<Record<C, number>>;

export interface ParsedTable {
  readonly delimiter: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** Ligne du fichier où l'en-tête a été reconnu (1 = première ligne). */
  readonly headerLine: number;
}

/** Nombre de lignes examinées pour retrouver l'en-tête. */
const HEADER_SEARCH_DEPTH = 10;

export function normaliseHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_.]/g, " ")
    .replace(/\s+/g, " ");
}

/** Découpe une ligne en respectant les guillemets doubles. */
export function splitLine(line: string, delimiter: string): string[] {
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

/**
 * Séparateur décidé sur PLUSIEURS lignes, pas sur la seule première.
 *
 * Une ligne d'en-tête courte suivie de données contenant des virgules dans un
 * libellé suffisait à faire choisir la virgule. On retient donc le séparateur
 * qui découpe le plus de colonnes ET le plus régulièrement : un vrai séparateur
 * donne le même nombre de cellules à chaque ligne.
 */
export function detectDelimiter(lines: readonly string[]): string {
  const candidates = [";", "\t", ",", "|"];
  const sample = lines.slice(0, 8);
  let best = ";";
  let bestScore = -1;
  for (const c of candidates) {
    const counts = sample.map((l) => splitLine(l, c).length);
    const columns = Math.max(...counts, 0);
    if (columns < 2) continue;
    const regular = counts.filter((n) => n === columns).length;
    // La régularité prime : mieux vaut 3 colonnes sur toutes les lignes que 7
    // sur une seule.
    const score = regular * 100 + columns;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore < 0 ? ";" : best;
}

/** Combien de colonnes de cette ligne ressemblent à des en-têtes connus ? */
function headerScore<C extends string>(
  cells: readonly string[],
  aliases: HeaderAliases<C>,
): number {
  const normalised = cells.map(normaliseHeader);
  let score = 0;
  for (const column of Object.keys(aliases) as C[]) {
    if (normalised.some((h) => aliases[column].includes(h))) score += 1;
  }
  return score;
}

/**
 * Lit un tableau délimité en cherchant sa vraie ligne d'en-tête.
 *
 * Un export de scolarité commence souvent par un titre, un horodatage ou une
 * ligne de service : la ligne 1 n'est pas l'en-tête. On retient, parmi les
 * premières lignes, celle qui reconnaît le plus de colonnes. À égalité, la plus
 * haute gagne.
 */
export function parseDelimitedTable<C extends string>(
  text: string,
  aliases: HeaderAliases<C>,
): ParsedTable {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { delimiter: ";", headers: [], rows: [], headerLine: 1 };

  const delimiter = detectDelimiter(lines);

  let headerIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(lines.length, HEADER_SEARCH_DEPTH); i += 1) {
    const score = headerScore(splitLine(lines[i]!, delimiter), aliases);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
  }

  const headers = splitLine(lines[headerIndex]!, delimiter);
  const rows = lines.slice(headerIndex + 1).map((l) => splitLine(l, delimiter));
  return { delimiter, headers, rows, headerLine: headerIndex + 1 };
}

export function detectMapping<C extends string>(
  headers: readonly string[],
  aliases: HeaderAliases<C>,
): ColumnMapping<C> {
  const mapping: ColumnMapping<C> = {};
  const normalised = headers.map(normaliseHeader);
  for (const column of Object.keys(aliases) as C[]) {
    const index = normalised.findIndex((h) => aliases[column].includes(h));
    if (index >= 0) (mapping as Record<string, number>)[column] = index;
  }
  return mapping;
}
