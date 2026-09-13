/**
 * Lecture de la grille de notation rendue par un GPT ECOS — logique pure.
 *
 * CE QUE LE GPT REND (mesuré le 13/09 sur « ECOS cardio cas 4 ») : un classeur
 * `Grille_notation_ECOS_….xlsx`, feuille « Grille de notation », trois colonnes
 * `Item | Barème | Note obtenue`, une ligne par item (17 items d'expertise
 * médicale sur 5, 4 habiletés non techniques sur 4), puis une ligne `TOTAL`
 * (101). Une seconde feuille « Légende » explique la cotation. Le tableau du
 * DEBRIEF affiché dans ChatGPT a la même forme, avec un barème écrit
 * « 5 / 2 / 0 » ou « 0–4 » — on l'accepte aussi, collé tel quel.
 *
 * CE QU'ON EN GARDE : les items, dans l'ordre. La ligne TOTAL est écartée : le
 * score est recalculé (ici pour l'affichage, en base pour de vrai). Une ligne
 * illisible n'est pas devinée : elle est signalée et la grille refusée entière,
 * pour que ce qui est enregistré soit exactement ce que l'étudiant a vu.
 *
 * Ce module ne lit ni fichier ni presse-papiers : on lui donne des lignes de
 * cellules, il rend des items ou des erreurs. Le xlsx est ouvert ailleurs
 * (`infrastructure/xlsx`), le texte collé par `parseDelimitedTable`.
 */
import type { EcosGridItem } from "@/domain/ecos";
import {
  detectMapping,
  normaliseHeader,
  parseDelimitedTable,
  type HeaderAliases,
} from "@/domain/delimitedTable";

export type EcosGridColumn = "item" | "max" | "points";

export const ECOS_GRID_ALIASES: HeaderAliases<EcosGridColumn> = {
  item: ["item", "items", "intitule", "critere", "element", "libelle", "competence"],
  max: ["bareme", "max", "maximum", "points max", "note max", "sur", "ponderation", "poids"],
  points: ["note obtenue", "note", "obtenu", "obtenue", "points obtenus", "score", "resultat"],
};

export interface EcosGridReading {
  readonly items: readonly EcosGridItem[];
  /** Lignes écartées volontairement (TOTAL, sous-totaux, lignes vides). */
  readonly skipped: readonly string[];
  /** Lignes illisibles : si non vide, la grille ne doit pas être enregistrée. */
  readonly errors: readonly string[];
  readonly score: number;
  readonly maxScore: number;
}

const HEADER_SEARCH_DEPTH = 10;

/** « TOTAL », « Score brut », « Sous-total » : des lignes de somme, pas des items. */
function isSummaryRow(label: string): boolean {
  const n = normaliseHeader(label);
  return /^(total|sous total|sous-total|score|somme|note finale|note globale)\b/.test(n);
}

/**
 * Lit un nombre écrit à la française ou à l'anglaise (« 2,5 », « 2.5 », « 5 pts »).
 * Rend `undefined` si rien de numérique n'est trouvé.
 */
export function readNumber(cell: string): number | undefined {
  const m = cell.replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const value = Number(m[0]);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Le barème peut être un nombre (« 5 »), une échelle (« 0–4 », « 0-4 ») ou la
 * cotation du DEBRIEF (« 5 / 2 / 0 ») : dans tous les cas, le maximum est le
 * plus grand nombre écrit.
 */
export function readMaxPoints(cell: string): number | undefined {
  const numbers = cell
    .replace(/,/g, ".")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((n) => Number.isFinite(n));
  if (!numbers || numbers.length === 0) return undefined;
  return Math.max(...numbers);
}

function scoreHeader(cells: readonly string[]): number {
  const mapping = detectMapping(cells, ECOS_GRID_ALIASES);
  return Object.keys(mapping).length;
}

/**
 * Lit des lignes de cellules (première feuille d'un xlsx, ou texte découpé).
 * Cherche l'en-tête dans les dix premières lignes ; à défaut, suppose l'ordre
 * Item / Barème / Note obtenue.
 */
export function readEcosGridRows(rows: readonly (readonly string[])[]): EcosGridReading {
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim().length > 0));
  if (nonEmpty.length === 0) {
    return { items: [], skipped: [], errors: ["La grille est vide."], score: 0, maxScore: 0 };
  }

  let headerIndex = -1;
  let best = 1; // il faut reconnaître au moins deux colonnes pour parler d'en-tête
  for (let i = 0; i < Math.min(nonEmpty.length, HEADER_SEARCH_DEPTH); i += 1) {
    const s = scoreHeader(nonEmpty[i]!);
    if (s > best) {
      best = s;
      headerIndex = i;
    }
  }

  const mapping =
    headerIndex >= 0
      ? detectMapping(nonEmpty[headerIndex]!, ECOS_GRID_ALIASES)
      : { item: 0, max: 1, points: 2 };
  const itemCol = mapping.item ?? 0;
  const maxCol = mapping.max ?? 1;
  const pointsCol = mapping.points ?? 2;

  const items: EcosGridItem[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const data = nonEmpty.slice(headerIndex + 1);

  data.forEach((row, index) => {
    const line = headerIndex + index + 2;
    const label = (row[itemCol] ?? "").trim();
    if (!label) {
      skipped.push(`ligne ${line} : sans intitulé`);
      return;
    }
    if (isSummaryRow(label)) {
      skipped.push(`ligne ${line} : « ${label} » (ligne de total, recalculée)`);
      return;
    }
    const maxPoints = readMaxPoints(row[maxCol] ?? "");
    const points = readNumber(row[pointsCol] ?? "");
    if (maxPoints === undefined) {
      errors.push(`ligne ${line} (« ${label} ») : barème illisible`);
      return;
    }
    if (points === undefined) {
      errors.push(`ligne ${line} (« ${label} ») : note obtenue manquante`);
      return;
    }
    if (points < 0 || points > maxPoints) {
      errors.push(
        `ligne ${line} (« ${label} ») : note ${points} hors du barème 0–${maxPoints}`,
      );
      return;
    }
    items.push({ label, maxPoints, points });
  });

  if (items.length === 0 && errors.length === 0) {
    errors.push("Aucun item reconnu : la grille doit avoir les colonnes Item, Barème et Note obtenue.");
  }

  const score = items.reduce((a, i) => a + i.points, 0);
  const maxScore = items.reduce((a, i) => a + i.maxPoints, 0);
  if (items.length > 0 && maxScore <= 0) {
    errors.push("Le barème total est nul : aucun point à obtenir.");
  }

  return { items, skipped, errors, score, maxScore };
}

/**
 * Le tableau du DEBRIEF collé depuis ChatGPT arrive en texte : tabulations
 * quand on copie le tableau, ou « | » quand on copie le markdown. On le
 * découpe avec le lecteur commun puis on lit les lignes comme un xlsx.
 */
export function readEcosGridText(text: string): EcosGridReading {
  const table = parseDelimitedTable(text, ECOS_GRID_ALIASES);
  if (table.headers.length === 0) return readEcosGridRows([]);
  // Un tableau markdown a une ligne « --- | --- » sous l'en-tête : elle sera
  // écartée comme ligne sans nombre… sauf qu'elle a un intitulé. On la retire ici.
  const rows = table.rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c.trim()) || c === ""));
  return readEcosGridRows([table.headers, ...rows]);
}
