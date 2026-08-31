/**
 * Lecture d'un fichier de promotion, quel qu'il soit.
 *
 * Un seul contrat vers le domaine : rendre du TEXTE DÉLIMITÉ, que
 * `buildRosterPreview` sait déjà analyser. Tout ce qui relève du format de
 * fichier — encodage, tableur, séparateur — se règle ici, et le domaine reste
 * pur et testable sans navigateur.
 *
 * Deux cas se présentent en vrai, et aucun n'est maîtrisé par l'utilisateur :
 *
 *   * un CSV exporté depuis Excel français, encodé en Windows-1252 : lu en
 *     UTF-8, « Benoît » devient « Beno<?>t » sans que rien ne le signale ;
 *   * un .xlsx envoyé tel quel par la scolarité, parce que « enregistrez-le
 *     d'abord en CSV » est le genre de consigne qui fait abandonner.
 *
 * Le .xlsx est lu SANS bibliothèque supplémentaire : c'est une archive ZIP de
 * XML, et `fflate` est déjà une dépendance du projet (elle sert au .docx et au
 * .pptx). Une dépendance de moins est une surface de moins.
 */

export interface RosterFileRead {
  /** Texte délimité, prêt pour `buildRosterPreview`. */
  readonly text: string;
  readonly source: "csv" | "xlsx";
  /** Encodage retenu pour un fichier texte (utile à afficher). */
  readonly encoding?: "utf-8" | "windows-1252";
  /** Nom de la feuille lue, quand le classeur en contient plusieurs. */
  readonly sheetName?: string;
}

const SPREADSHEET_RE = /\.(xlsx|xlsm)$/i;

/* ------------------------------------------------------------------ */
/* Texte : encodage deviné plutôt que supposé                          */
/* ------------------------------------------------------------------ */

/**
 * UTF-8 d'abord, en mode strict. S'il échoue, le fichier vient presque
 * toujours d'un Excel francophone : Windows-1252. On ne « répare » jamais un
 * texte déjà décodé — on le redécode depuis les octets, seule façon de ne pas
 * perdre d'information.
 */
function decodeText(bytes: Uint8Array): { text: string; encoding: "utf-8" | "windows-1252" } {
  try {
    const strict = new TextDecoder("utf-8", { fatal: true });
    return { text: strict.decode(bytes), encoding: "utf-8" };
  } catch {
    const fallback = new TextDecoder("windows-1252");
    return { text: fallback.decode(bytes), encoding: "windows-1252" };
  }
}

/* ------------------------------------------------------------------ */
/* Classeur Excel                                                      */
/* ------------------------------------------------------------------ */

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m);
}

/** « AB12 » -> 27. Nécessaire : une cellule vide n'apparaît pas dans le XML. */
function columnIndexOf(reference: string): number {
  const letters = /^([A-Z]+)/.exec(reference.toUpperCase())?.[1];
  if (!letters) return 0;
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

/** Concatène les <t> d'un fragment : un texte enrichi est découpé en morceaux. */
function textOf(fragment: string): string {
  const parts = [...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1] ?? "");
  return decodeXmlText(parts.join(""));
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? ""));
}

function parseSheet(xml: string, shared: readonly string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*)\/?>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const reference = /r="([A-Z]+\d+)"/i.exec(attributes)?.[1];
      const type = /t="([^"]+)"/.exec(attributes)?.[1];

      let value = "";
      if (type === "s") {
        const index = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
        value = Number.isInteger(index) ? (shared[index] ?? "") : "";
      } else if (type === "inlineStr") {
        value = textOf(body);
      } else {
        value = decodeXmlText(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      }

      const at = reference ? columnIndexOf(reference) : cells.length;
      while (cells.length < at) cells.push("");
      cells[at] = value.trim();
    }
    rows.push(cells);
  }
  return rows;
}

/** Échappe une cellule pour la ressortir en CSV point-virgule. */
function csvCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/* ------------------------------------------------------------------ */
/* Entrée unique                                                       */
/* ------------------------------------------------------------------ */

export async function readRosterFile(file: File): Promise<RosterFileRead> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!SPREADSHEET_RE.test(file.name)) {
    const { text, encoding } = decodeText(bytes);
    return { text, source: "csv", encoding };
  }

  const { unzipSync, strFromU8 } = await import("fflate");
  const entries = unzipSync(bytes);

  const sharedEntry = entries["xl/sharedStrings.xml"];
  const shared = sharedEntry ? parseSharedStrings(strFromU8(sharedEntry)) : [];

  // La première feuille dans l'ordre du classeur : sheet1, sheet2… Un tri
  // alphabétique brut placerait sheet10 avant sheet2.
  const sheetName = Object.keys(entries)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number(/(\d+)/.exec(a)![1]) - Number(/(\d+)/.exec(b)![1]))[0];

  if (!sheetName) {
    throw new Error("Ce classeur ne contient aucune feuille lisible.");
  }

  const rows = parseSheet(strFromU8(entries[sheetName]!), shared);
  const text = rows
    .filter((cells) => cells.some((c) => c !== ""))
    .map((cells) => cells.map(csvCell).join(";"))
    .join("\n");

  return { text, source: "xlsx", sheetName };
}
