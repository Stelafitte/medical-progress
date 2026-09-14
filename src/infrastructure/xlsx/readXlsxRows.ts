/**
 * Ouvre un classeur .xlsx dans le navigateur et rend les cellules de sa
 * première feuille, en texte — sans dépendance.
 *
 * POURQUOI PAS UNE BIBLIOTHÈQUE. Le seul xlsx que le hub lit aujourd'hui est
 * la grille de notation d'un GPT ECOS : trois colonnes, vingt lignes. Embarquer
 * SheetJS (près d'un mégaoctet) pour ça, c'est payer chaque chargement de page
 * pour un import occasionnel. Un .xlsx est un zip de XML : le navigateur sait
 * dégonfler (`DecompressionStream`), et le XML de trois colonnes se lit à la
 * main. Si un jour le hub doit lire des classeurs complexes (formules
 * partagées, dates, feuilles multiples à choisir), ce sera le moment d'une
 * bibliothèque — pas avant.
 *
 * CE QUI EST LU : chaînes partagées, chaînes en ligne, valeurs numériques et
 * booléennes, cellules avec un préfixe d'espace de noms (`<x:c>`) ou sans.
 * CE QUI NE L'EST PAS : les dates (rendues comme leur nombre de série), les
 * formules (on prend la valeur calculée si elle est stockée), les styles.
 */

const textDecoder = new TextDecoder("utf-8");

interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly data: Uint8Array;
}

/** Lit le répertoire central du zip : la seule table fiable des entrées. */
function readZipEntries(bytes: Uint8Array): ReadonlyMap<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_558); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Ce fichier n'est pas un classeur xlsx (zip sans répertoire).");

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();

  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    // En-tête local : les longueurs de nom et d'extra peuvent différer de celles du répertoire.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, {
      name,
      method,
      data: bytes.subarray(dataStart, dataStart + compressedSize),
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateEntry(entry: ZipEntry): Promise<string> {
  if (entry.method === 0) return textDecoder.decode(entry.data);
  if (entry.method !== 8) {
    throw new Error(`Compression ${entry.method} non prise en charge dans ${entry.name}.`);
  }
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  /* `Uint8Array<ArrayBufferLike>` n est pas un `BufferSource` aux yeux de TS 5.7 :
     la copie redonne un tampon non partage, et ne coute rien a ces tailles. */
  void writer.write(new Uint8Array(entry.data));
  void writer.close();
  return await new Response(stream.readable).text();
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/** Concatène les `<t>` d'un `<si>` ou d'un `<is>` (texte enrichi = plusieurs runs). */
function readRichText(xml: string): string {
  return [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)]
    .map((m) => decodeXmlText(m[1] ?? ""))
    .join("");
}

function readSharedStrings(xml: string | undefined): readonly string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) =>
    readRichText(m[1] ?? ""),
  );
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? "A";
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

/** Chemin de la première feuille : workbook.xml → rels ; sinon sheet1.xml. */
async function firstSheetPath(entries: ReadonlyMap<string, ZipEntry>): Promise<string> {
  const workbook = entries.get("xl/workbook.xml");
  const rels = entries.get("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const wbXml = await inflateEntry(workbook);
    const relXml = await inflateEntry(rels);
    const firstSheet = wbXml.match(/<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
    if (firstSheet) {
      const target = [...relXml.matchAll(/<Relationship\b[^>]*>/g)]
        .map((m) => m[0])
        .find((tag) => tag.includes(`Id="${firstSheet}"`))
        ?.match(/Target="([^"]+)"/)?.[1];
      if (target) return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    }
  }
  return "xl/worksheets/sheet1.xml";
}

/**
 * Rend les lignes de la première feuille, chaque cellule en texte, les trous
 * comblés par des chaînes vides pour que l'indice de colonne reste celui du
 * classeur.
 */
export async function readXlsxRows(bytes: ArrayBuffer): Promise<readonly (readonly string[])[]> {
  const entries = readZipEntries(new Uint8Array(bytes));
  const sheetPath = await firstSheetPath(entries);
  const sheet = entries.get(sheetPath);
  if (!sheet) throw new Error("Le classeur ne contient aucune feuille lisible.");

  const shared = readSharedStrings(
    entries.has("xl/sharedStrings.xml")
      ? await inflateEntry(entries.get("xl/sharedStrings.xml")!)
      : undefined,
  );
  const xml = await inflateEntry(sheet);

  const rows: string[][] = [];
  for (const row of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const cells: string[] = [];
    for (const cell of (row[1] ?? "").matchAll(
      /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g,
    )) {
      const attrs = cell[1] ?? "";
      const body = cell[2] ?? "";
      const reference = attrs.match(/\br="([A-Z]+\d+)"/)?.[1] ?? "";
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
      let value = "";
      if (type === "s") {
        const index = Number(body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? "-1");
        value = shared[index] ?? "";
      } else if (type === "inlineStr") {
        value = readRichText(body);
      } else if (type === "b") {
        value = /<(?:\w+:)?v>1<\/(?:\w+:)?v>/.test(body) ? "VRAI" : "FAUX";
      } else {
        value = decodeXmlText(body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? "");
      }
      const index = reference ? columnIndex(reference) : cells.length;
      while (cells.length < index) cells.push("");
      cells[index] = value;
    }
    rows.push(cells);
  }
  return rows;
}
