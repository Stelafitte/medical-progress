/**
 * Lecture du TEXTE d'un document pédagogique, côté navigateur.
 *
 * Formats lus réellement : PDF (pdf.js), Word .docx (mammoth.js), .txt, .md
 * et HTML (pages d'un site enregistré). Les deux bibliothèques sont chargées
 * depuis un CDN à la volée : rien
 * à installer sur le poste, et le poids ne pèse que sur les écrans qui
 * importent vraiment un fichier.
 *
 * Une archive ZIP est traitée comme un CORPUS : chaque fichier lisible
 * devient un document à part entière, qui conserve son chemin d'origine et
 * son contenu binaire. C'est ce qui permet, plus loin dans la chaîne, de
 * déposer le fichier dans la médiathèque ET de rattacher les connaissances
 * extraites au document dont elles viennent. Concaténer l'archive en un seul
 * bloc de texte perdrait cette traçabilité.
 */

import { annotateRankImages } from "@/domain/corpusChapter";

const loadedScripts = new Set<string>();

/** Charge une bibliothèque UMD depuis un CDN une seule fois (mise en cache par URL). */
export function loadScriptOnce(src: string): Promise<void> {
  if (loadedScripts.has(src)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      loadedScripts.add(src);
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      loadedScripts.add(src);
      resolve();
    };
    script.onerror = () => reject(new Error(`Échec du chargement de ${src}`));
    document.head.appendChild(script);
  });
}

interface MammothGlobal {
  extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}

export async function extractPdfText(file: File): Promise<string> {
  // L'indirection par variable évite à TypeScript de tenter de résoudre
  // l'URL comme un module local.
  const pdfjsModuleUrl = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs";
  const pdfjs = await import(/* @vite-ignore */ pdfjsModuleUrl);
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = (content.items as { str?: string }[]).map((item) => item.str ?? "").join(" ");
    pageTexts.push(pageText.trim());
  }
  return pageTexts.join("\n\n").trim();
}

export async function extractDocxText(file: File): Promise<string> {
  await loadScriptOnce("https://cdn.jsdelivr.net/npm/mammoth@1/mammoth.browser.min.js");
  const mammoth = (window as unknown as { mammoth?: MammothGlobal }).mammoth;
  if (!mammoth) throw new Error("Lecteur Word indisponible (échec du chargement).");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.trim();
}

export const extractTxtText = async (file: File): Promise<string> => (await file.text()).trim();

/**
 * Texte utile d'une page HTML.
 *
 * Un miroir de site (référentiel de collège, cours en ligne) est fait de
 * pages où le contenu pèse moins que l'habillage. On retire donc scripts,
 * styles, menus, en-têtes, pieds de page et formulaires, puis on préfère
 * `<main>` ou `<article>` quand la page en a un. Sans ce nettoyage, chaque
 * page envoyée à l'analyse commencerait par le même menu de navigation, et
 * l'IA proposerait les mêmes « connaissances » pour toutes.
 *
 * `DOMParser` construit un document inerte : les scripts de la page ne sont
 * jamais exécutés, et les images ne sont pas chargées.
 */
export async function extractHtmlText(file: File): Promise<string> {
  // Les rangs R2C sont des IMAGES dans les pages de la SFC. On les remplace par
  // un marqueur AVANT le passage au DOM : `textContent` les effacerait, et le
  // texte conservé perdrait la hiérarchisation paragraphe par paragraphe qui
  // fait toute la valeur de ce corpus. Voir `domain/corpusChapter.ts`.
  const raw = annotateRankImages(await file.text());
  const doc = new DOMParser().parseFromString(raw, "text/html");
  doc
    .querySelectorAll("script, style, noscript, svg, nav, header, footer, aside, form")
    .forEach((element) => element.remove());
  const root = doc.querySelector("main, article, [role='main']") ?? doc.body;
  return (root?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Format reconnu d'après l'EXTENSION, jamais d'après `File.type` — un fichier
 * sorti d'une archive n'a pas de type MIME, et celui du navigateur varie d'un
 * poste à l'autre. */
export type ReadableFormat = "pdf" | "docx" | "text" | "html";

export function readableFormat(fileName: string): ReadableFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  return null;
}

export function isZipFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}

export function isLegacyDoc(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".doc") && !lower.endsWith(".docx");
}

export async function extractText(file: File): Promise<string> {
  const format = readableFormat(file.name);
  if (format === "pdf") return extractPdfText(file);
  if (format === "docx") return extractDocxText(file);
  if (format === "text") return extractTxtText(file);
  if (format === "html") return extractHtmlText(file);
  throw new Error(`Format non pris en charge : ${file.name}`);
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"] as const;

export function isImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(`.${extension}`));
}

/** Résout `.` et `..` dans un chemin d'archive. */
function normalizeSegments(path: string): string {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return out.join("/");
}

/**
 * Chemin, DANS L'ARCHIVE, d'une ressource référencée par une page.
 *
 * Un site enregistré mélange les formes : chemin relatif à la page, chemin
 * absolu depuis la racine du site, URL complète vers un autre domaine. On
 * essaie les résolutions plausibles et on ne retient que celles qui désignent
 * un fichier réellement présent — une image restée sur le web n'est pas dans
 * l'archive, et inventer son chemin produirait un dépôt vide.
 */
function resolveArchivePath(
  pagePath: string,
  source: string,
  available: ReadonlySet<string>,
): string | null {
  const clean = (source.split("#")[0] ?? "").split("?")[0]?.trim() ?? "";
  if (!clean || /^(https?:|data:|mailto:|javascript:)/i.test(clean)) return null;

  const baseDir = pagePath.includes("/") ? pagePath.slice(0, pagePath.lastIndexOf("/")) : "";
  const siteRoot = pagePath.split("/")[0];
  const candidates = clean.startsWith("/")
    ? [`${siteRoot}${clean}`, clean.slice(1)]
    : [`${baseDir}/${clean}`, clean];

  for (const candidate of candidates) {
    const normalized = normalizeSegments(candidate);
    if (available.has(normalized)) return normalized;
  }
  return null;
}

/** Chemins des images référencées par une page HTML, tels qu'ils existent dans
 * l'archive. Les `<img>` sans `src` utilisable, et ceux qui pointent hors de
 * l'archive, sont ignorés. */
function referencedImages(
  html: string,
  pagePath: string,
  available: ReadonlySet<string>,
): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const found = new Set<string>();
  doc.querySelectorAll("img[src]").forEach((element) => {
    const resolved = resolveArchivePath(pagePath, element.getAttribute("src") ?? "", available);
    if (resolved && isImagePath(resolved)) found.add(resolved);
  });
  return [...found].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Une figure d'un document : conservée pour être déposée à côté de lui. */
export interface CorpusImage {
  readonly path: string;
  readonly file: File;
}

/** Un document du corpus : son chemin d'origine, le fichier lui-même (conservé
 * pour être déposé dans la médiathèque) et son texte. */
export interface CorpusDocument {
  /** Chemin dans l'archive, ou nom du fichier si l'import portait sur un seul document. */
  readonly path: string;
  readonly format: ReadableFormat;
  readonly file: File;
  readonly text: string;
  /**
   * Figures que cette page référence et qui sont présentes dans l'archive.
   * Vide hors HTML : les images d'un PDF ou d'un .docx sont enfouies dans le
   * fichier, on ne les en extrait pas — le document lui-même les porte déjà.
   */
  readonly images: readonly CorpusImage[];
}

export interface CorpusReadResult {
  readonly documents: readonly CorpusDocument[];
  /** Fichiers écartés : format non lisible, ou aucun texte extractible. */
  readonly ignored: readonly string[];
}

/**
 * Lit un fichier unique ou une archive et rend un corpus de documents.
 *
 * L'ordre est celui, alphabétique, des chemins : deux lectures de la même
 * archive donnent le même corpus, dans le même ordre. Sans cela, un
 * réimport produirait un texte différent à chaque fois, et toute comparaison
 * avec l'import précédent deviendrait impossible.
 *
 * Un fichier illisible n'interrompt jamais la lecture : il est écarté et
 * signalé. Une archive entière ne doit pas être rejetée pour une image.
 */
export async function readDocumentCorpus(file: File): Promise<CorpusReadResult> {
  if (!isZipFile(file)) {
    const format = readableFormat(file.name);
    if (!format) return { documents: [], ignored: [file.name] };
    const text = await extractText(file);
    if (!text) return { documents: [], ignored: [file.name] };
    return { documents: [{ path: file.name, format, file, text, images: [] }], ignored: [] };
  }

  const { unzipSync } = await import("fflate");
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));

  const names = Object.keys(entries)
    .filter((name) => !name.endsWith("/")) // dossiers
    .filter((name) => !name.startsWith("__MACOSX/")) // métadonnées macOS
    .filter((name) => !(name.split("/").pop() ?? "").startsWith(".")) // fichiers cachés
    .sort((a, b) => a.localeCompare(b, "fr"));

  // Index des fichiers réellement présents : il sert à ne retenir, parmi les
  // images qu'une page référence, que celles que l'archive contient.
  const available = new Set(names);

  const documents: CorpusDocument[] = [];
  const ignored: string[] = [];

  for (const name of names) {
    const format = readableFormat(name);
    const bytes = entries[name];
    if (!format || !bytes || bytes.length === 0) {
      ignored.push(name);
      continue;
    }
    const inner = new File([bytes.slice()], name.split("/").pop() ?? name);
    let text = "";
    let raw = "";
    try {
      if (format === "html") {
        raw = await inner.text();
        text = await extractHtmlText(inner);
      } else {
        text = await extractText(inner);
      }
    } catch {
      ignored.push(name);
      continue;
    }
    if (!text) {
      ignored.push(name);
      continue;
    }

    const images: CorpusImage[] =
      format === "html"
        ? referencedImages(raw, name, available)
            .map((imagePath) => {
              const imageBytes = entries[imagePath];
              if (!imageBytes || imageBytes.length === 0) return null;
              return {
                path: imagePath,
                file: new File([imageBytes.slice()], imagePath.split("/").pop() ?? imagePath),
              };
            })
            .filter((image): image is CorpusImage => image !== null)
        : [];

    documents.push({ path: name, format, file: inner, text, images });
  }

  return { documents, ignored };
}

/** Texte d'un corpus, concaténé, chaque extrait précédé de son chemin
 * d'origine — sans quoi on ne sait plus quel paragraphe vient d'où. */
export function corpusToText(documents: readonly CorpusDocument[]): string {
  return documents
    .map((doc) => `## ${doc.path}\n\n${doc.text}`)
    .join("\n\n")
    .trim();
}

/**
 * Découpe un texte en morceaux d'au plus `maxChars`, sur des frontières de
 * phrase quand c'est possible.
 *
 * On coupe à la phrase, jamais au milieu d'un mot : un segment qui commence
 * par une demi-phrase est illisible pour un lecteur comme pour un modèle, et
 * une réponse citée depuis ce segment commencerait au milieu d'une idée.
 *
 * Sert deux usages avec la même fonction, à deux tailles différentes : de
 * petits segments pour retrouver un passage, de grandes tranches pour tenir
 * sous la limite d'entrée du service d'analyse.
 */
export function splitText(text: string, maxChars: number): string[] {
  const clean = text.trim();
  if (clean.length === 0) return [];
  if (clean.length <= maxChars) return [clean];

  // Frontières de phrase, en gardant la ponctuation avec la phrase qu'elle
  // termine. Un texte sans ponctuation retombe sur une coupe par longueur.
  const sentences = clean.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) ?? [clean];

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = "";
      }
      for (let start = 0; start < sentence.length; start += maxChars) {
        chunks.push(sentence.slice(start, start + maxChars).trim());
      }
      continue;
    }
    if (current.length + sentence.length > maxChars) {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((chunk) => chunk.length > 0);
}

/** Taille des segments conservés en base : assez court pour qu'un passage
 * retrouvé soit citable tel quel, assez long pour garder son contexte. */
export const STORAGE_SEGMENT_CHARS = 4000;

/** Taille des tranches envoyées à l'analyse : sous la limite d'entrée du
 * service (20 000 caractères), avec de la marge. */
export const ANALYSIS_SLICE_CHARS = 18000;
