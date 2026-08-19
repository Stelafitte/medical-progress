/**
 * LECTEUR PPTX RÉEL — exécution locale (navigateur ou test), sans réseau.
 *
 * Un fichier .pptx est une archive ZIP OOXML. Ce module la décompresse et en
 * extrait un inventaire structuré : ordre des diapositives, textes, notes du
 * présentateur, images et pistes audio commentées. Aucun octet ne quitte le
 * poste : pas de téléversement, pas de stockage serveur, pas d'appel IA.
 *
 * Volontairement sans DOMParser : l'extraction OOXML utile ici est textuelle et
 * doit fonctionner à l'identique dans le navigateur et dans les tests Node.
 */
import { unzipSync } from "fflate";

export interface PptxMediaFile {
  /** Chemin interne dans l'archive, ex. `ppt/media/audio1.m4a`. */
  readonly path: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface PptxSlideInventory {
  /** Index 1-based dans l'ordre de présentation réel. */
  readonly index: number;
  readonly path: string;
  /** Premier texte significatif de la diapositive, sinon libellé de repli. */
  readonly title: string;
  /** Tous les textes de la diapositive, dans l'ordre du document. */
  readonly texts: readonly string[];
  /** Notes du présentateur, source de la transcription. */
  readonly notes: string;
  readonly audio: readonly PptxMediaFile[];
  readonly images: readonly PptxMediaFile[];
  readonly hasAnimations: boolean;
}

export interface PptxInventory {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly slides: readonly PptxSlideInventory[];
  readonly fontsEmbedded: boolean;
  /** Toutes les pistes audio du paquet, y compris non rattachées. */
  readonly audioFiles: readonly PptxMediaFile[];
  readonly title?: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  wma: "audio/x-ms-wma",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  emf: "image/emf",
  wmf: "image/wmf",
};

const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "wav", "wma"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg"]);

const extensionOf = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";
const baseNameOf = (path: string) => path.split("/").pop() ?? path;

const decodeXml = (bytes: Uint8Array) => new TextDecoder("utf-8").decode(bytes);

const unescapeXml = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");

/** Textes OOXML (`<a:t>`) dans l'ordre du document. */
function extractTexts(xml: string): string[] {
  const out: string[] = [];
  const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const text = unescapeXml(match[1] ?? "").replace(/\s+/g, " ").trim();
    if (text) out.push(text);
  }
  return out;
}

/** Résolution d'un `Target` de relation relatif au dossier du fichier porteur. */
function resolveTarget(ownerPath: string, target: string): string {
  if (target.startsWith("/")) return target.replace(/^\//, "");
  const dir = ownerPath.split("/").slice(0, -1).join("/");
  const segments = [...dir.split("/"), ...target.split("/")];
  const stack: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }
  return stack.join("/");
}

interface Relationship {
  readonly id: string;
  readonly type: string;
  readonly target: string;
}

function parseRelationships(xml: string): Relationship[] {
  const out: Relationship[] = [];
  const re = /<Relationship\b([^>]*)\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const attrs = match[1] ?? "";
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const type = /\bType="([^"]+)"/.exec(attrs)?.[1] ?? "";
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1] ?? "";
    if (id) out.push({ id, type, target: unescapeXml(target) });
  }
  return out;
}

const relsPathOf = (path: string) => {
  const dir = path.split("/").slice(0, -1).join("/");
  return `${dir}/_rels/${baseNameOf(path)}.rels`;
};

/** Ordre réel des diapositives : `sldIdLst` de `ppt/presentation.xml`. */
function slideOrder(entries: Record<string, Uint8Array>): string[] {
  const presentation = entries["ppt/presentation.xml"];
  const rels = entries["ppt/_rels/presentation.xml.rels"];
  if (presentation && rels) {
    const byId = new Map(parseRelationships(decodeXml(rels)).map((r) => [r.id, r.target]));
    const xml = decodeXml(presentation);
    const list = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(xml)?.[1] ?? "";
    const ordered: string[] = [];
    const re = /r:id="([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(list)) !== null) {
      const target = byId.get(match[1] ?? "");
      if (!target) continue;
      const path = resolveTarget("ppt/presentation.xml", target);
      if (entries[path]) ordered.push(path);
    }
    if (ordered.length > 0) return ordered;
  }
  // Repli : tri numérique des slideN.xml.
  return Object.keys(entries)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(/(\d+)/.exec(a)?.[1] ?? 0) - Number(/(\d+)/.exec(b)?.[1] ?? 0));
}

function mediaFileOf(entries: Record<string, Uint8Array>, path: string): PptxMediaFile | undefined {
  const bytes = entries[path];
  if (!bytes) return undefined;
  const extension = extensionOf(path);
  return {
    path,
    fileName: baseNameOf(path),
    bytes,
    mimeType: MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
    sizeBytes: bytes.byteLength,
  };
}

/** Nettoie les notes : le numéro de diapositive du gabarit n'est pas du commentaire. */
function cleanNotes(texts: readonly string[]): string {
  return texts
    .filter((text) => !/^\d{1,3}$/.test(text))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Décompresse et inventorie un vrai .pptx. Lève une erreur explicite si
 * l'archive n'est pas une présentation OOXML exploitable.
 */
export function readPptxPackage(fileName: string, data: Uint8Array): PptxInventory {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data);
  } catch {
    throw new Error("Fichier illisible : ce n'est pas une archive .pptx valide.");
  }
  if (!entries["ppt/presentation.xml"]) {
    throw new Error("Archive sans ppt/presentation.xml : présentation PowerPoint non reconnue.");
  }

  const audioFiles = Object.keys(entries)
    .filter((path) => path.startsWith("ppt/media/") && AUDIO_EXTENSIONS.has(extensionOf(path)))
    .sort()
    .map((path) => mediaFileOf(entries, path))
    .filter((file): file is PptxMediaFile => file !== undefined);

  const slides = slideOrder(entries).map((path, position): PptxSlideInventory => {
    const xml = decodeXml(entries[path]!);
    const texts = extractTexts(xml);
    const rels = entries[relsPathOf(path)];
    const relationships = rels ? parseRelationships(decodeXml(rels)) : [];

    const audio: PptxMediaFile[] = [];
    const images: PptxMediaFile[] = [];
    let notes = "";

    for (const relationship of relationships) {
      const target = resolveTarget(path, relationship.target);
      if (relationship.target.startsWith("http")) continue;
      if (relationship.type.endsWith("/notesSlide")) {
        const notesXml = entries[target];
        if (notesXml) notes = cleanNotes(extractTexts(decodeXml(notesXml)));
        continue;
      }
      const extension = extensionOf(target);
      if (AUDIO_EXTENSIONS.has(extension)) {
        const file = mediaFileOf(entries, target);
        if (file && !audio.some((a) => a.path === file.path)) audio.push(file);
      } else if (IMAGE_EXTENSIONS.has(extension)) {
        const file = mediaFileOf(entries, target);
        if (file && !images.some((i) => i.path === file.path)) images.push(file);
      }
    }

    return {
      index: position + 1,
      path,
      title: texts.find((text) => text.length > 1 && text.length <= 140) ?? `Diapositive ${position + 1}`,
      texts,
      notes,
      audio,
      images,
      hasAnimations: /<p:(?:timing|animEffect|anim\b)/.test(xml),
    };
  });

  const fontsEmbedded = Object.keys(entries).some((path) => path.startsWith("ppt/fonts/"));
  const coreProps = entries["docProps/core.xml"];
  const title = coreProps
    ? /<dc:title>([\s\S]*?)<\/dc:title>/.exec(decodeXml(coreProps))?.[1]?.trim()
    : undefined;

  return {
    fileName,
    sizeBytes: data.byteLength,
    slides,
    fontsEmbedded,
    audioFiles,
    ...(title ? { title: unescapeXml(title) } : {}),
  };
}
