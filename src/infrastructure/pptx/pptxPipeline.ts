/**
 * PIPELINE DE TRANSFORMATION PPTX → PAQUET LECTEUR WEB HTML5.
 *
 * Tout s'exécute sur le poste de l'utilisateur : décompression, extraction,
 * mesure des durées audio (navigateur), assemblage du paquet HTML5 et
 * téléchargement. Aucun octet n'est envoyé sur le réseau, aucun stockage
 * serveur n'est activé, aucun appel IA n'est effectué.
 */
import { zipSync } from "fflate";
import type { NarratedDeck } from "@/domain/mediaLibrary";
import {
  convertPptx,
  type PptxConversionInput,
  type PptxSlideSignal,
} from "@/domain/pptxConversion";
import { readPptxPackage, type PptxInventory } from "@/infrastructure/pptx/pptxReader";

/** Traduit l'inventaire du paquet en signaux de domaine. */
export function toConversionInput(
  inventory: PptxInventory,
  durationsByPath: Readonly<Record<string, number>> = {},
): PptxConversionInput {
  const slides: PptxSlideSignal[] = inventory.slides.map((slide) => {
    const measured = slide.audio.reduce(
      (sum, file) => sum + (durationsByPath[file.path] ?? 0),
      0,
    );
    return {
      index: slide.index,
      title: slide.title,
      notes: slide.notes,
      audioCount: slide.audio.length,
      audioBytes: slide.audio.reduce((sum, file) => sum + file.sizeBytes, 0),
      ...(measured > 0 ? { audioDurationSeconds: measured } : {}),
      imageCount: slide.images.length,
      textCount: slide.texts.length,
      hasAnimations: slide.hasAnimations,
    };
  });
  return {
    fileName: inventory.fileName,
    sizeBytes: inventory.sizeBytes,
    fontsEmbedded: inventory.fontsEmbedded,
    slides,
  };
}

export interface PptxTransformation {
  readonly inventory: PptxInventory;
  readonly deck: NarratedDeck;
}

/** Chaîne complète synchrone : lecture réelle du .pptx puis conversion. */
export function transformPptx(
  fileName: string,
  data: Uint8Array,
  durationsByPath: Readonly<Record<string, number>> = {},
  at: string = new Date().toISOString(),
): PptxTransformation {
  const inventory = readPptxPackage(fileName, data);
  const deck = convertPptx(
    toConversionInput(inventory, durationsByPath),
    "html5",
    undefined,
    at,
  );
  return { inventory, deck };
}

/**
 * Mesure les durées audio réelles via le navigateur (métadonnées seulement).
 * Renvoie un objet vide hors navigateur : le domaine retombe alors sur son
 * estimation.
 */
export async function measureAudioDurations(
  inventory: PptxInventory,
): Promise<Record<string, number>> {
  if (typeof window === "undefined" || typeof Audio === "undefined") return {};
  const result: Record<string, number> = {};
  for (const file of inventory.audioFiles) {
    const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: file.mimeType }));
    try {
      const duration = await new Promise<number>((resolve) => {
        const audio = new Audio();
        const done = (value: number) => resolve(Number.isFinite(value) ? value : 0);
        audio.preload = "metadata";
        audio.onloadedmetadata = () => done(audio.duration);
        audio.onerror = () => done(0);
        window.setTimeout(() => done(0), 4000);
        audio.src = url;
      });
      if (duration > 0) result[file.path] = duration;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return result;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Manifeste du paquet web : c'est lui, et non le PPTX, qui décrit le cours. */
export function buildManifest(transformation: PptxTransformation) {
  const { inventory, deck } = transformation;
  return {
    format: "campus-sante-html5-deck",
    version: 1,
    title: inventory.title ?? inventory.fileName.replace(/\.pptx$/i, ""),
    slideCount: deck.artifact?.slideCount ?? 0,
    totalDurationSeconds: deck.artifact?.totalDurationSeconds ?? 0,
    chapters: deck.artifact?.chapters ?? [],
    slides: (deck.artifact?.slides ?? []).map((slide) => {
      const source = inventory.slides.find((s) => s.index === slide.index);
      return {
        index: slide.index,
        title: slide.title,
        durationSeconds: slide.durationSeconds,
        hasNarration: slide.hasNarration,
        transcript: slide.transcript ?? "",
        bullets: source?.texts.slice(1) ?? [],
        images: (source?.images ?? []).map((file) => `media/${file.fileName}`),
        audio: (source?.audio ?? []).map((file) => `media/${file.fileName}`),
      };
    }),
  };
}

/** Lecteur web autonome inclus dans le paquet (aucune dépendance externe). */
function playerHtml(manifestJson: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cours commenté — Campus Santé Augmenté</title>
<style>
  :root { color-scheme: light; font-family: system-ui, sans-serif; }
  body { margin: 0; background: #f6f8fa; color: #13212e; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 16px; display: grid; gap: 16px; }
  .stage { background: #fff; border: 1px solid #dbe3ea; border-radius: 12px; padding: 20px; min-height: 320px; }
  .stage h1 { font-size: clamp(1.1rem, 2.6vw, 1.6rem); margin: 0 0 12px; }
  .stage ul { margin: 0; padding-left: 1.1rem; line-height: 1.6; }
  .stage img { max-width: 100%; height: auto; border-radius: 8px; margin-top: 12px; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  button, select { min-height: 44px; border-radius: 8px; border: 1px solid #b9c6d2; background: #fff; padding: 0 14px; font: inherit; }
  ol { padding-left: 1.2rem; }
  .transcript { background: #fff; border: 1px solid #dbe3ea; border-radius: 12px; padding: 16px; white-space: pre-wrap; }
  @media (max-width: 420px) { .wrap { padding: 10px; } }
</style>
</head>
<body>
<div class="wrap">
  <section class="stage" id="stage"></section>
  <div class="bar">
    <button id="prev" type="button">Précédent</button>
    <button id="next" type="button">Suivant</button>
    <select id="speed" aria-label="Vitesse de lecture">
      <option value="0.75">0,75×</option><option value="1" selected>1×</option>
      <option value="1.25">1,25×</option><option value="1.5">1,5×</option><option value="2">2×</option>
    </select>
    <span id="counter"></span>
  </div>
  <audio id="audio" controls style="width:100%"></audio>
  <nav><strong>Sommaire</strong><ol id="toc"></ol></nav>
  <section class="transcript" id="transcript"></section>
</div>
<script id="manifest" type="application/json">${manifestJson}</script>
<script>
  const manifest = JSON.parse(document.getElementById("manifest").textContent);
  const stage = document.getElementById("stage");
  const audio = document.getElementById("audio");
  let current = 0;
  function render() {
    const slide = manifest.slides[current];
    stage.innerHTML = "<h1></h1><ul></ul>";
    stage.querySelector("h1").textContent = slide.title;
    const ul = stage.querySelector("ul");
    slide.bullets.forEach((text) => { const li = document.createElement("li"); li.textContent = text; ul.appendChild(li); });
    slide.images.forEach((src) => { const img = document.createElement("img"); img.src = src; img.alt = slide.title; stage.appendChild(img); });
    document.getElementById("counter").textContent = (current + 1) + " / " + manifest.slides.length;
    document.getElementById("transcript").textContent = slide.transcript || "Aucune transcription pour cette diapositive.";
    audio.src = slide.audio[0] || "";
  }
  document.getElementById("prev").onclick = () => { current = Math.max(0, current - 1); render(); };
  document.getElementById("next").onclick = () => { current = Math.min(manifest.slides.length - 1, current + 1); render(); };
  document.getElementById("speed").onchange = (event) => { audio.playbackRate = Number(event.target.value); };
  audio.onended = () => { if (current < manifest.slides.length - 1) { current += 1; render(); audio.play().catch(() => {}); } };
  manifest.slides.forEach((slide, index) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button"; button.textContent = slide.title;
    button.onclick = () => { current = index; render(); };
    li.appendChild(button); document.getElementById("toc").appendChild(li);
  });
  render();
</script>
</body>
</html>`;
}

/** Assemble le paquet HTML5 réel (zip) : index.html + manifeste + médias. */
export function buildHtml5Package(transformation: PptxTransformation): Uint8Array {
  const manifest = buildManifest(transformation);
  const manifestJson = JSON.stringify(manifest, null, 2);
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    "index.html": encoder.encode(playerHtml(manifestJson)),
    "manifest.json": encoder.encode(manifestJson),
    "LISEZ-MOI.txt": encoder.encode(
      [
        "Paquet lecteur web HTML5 généré par Campus Santé Augmenté.",
        "Contenu : diapositives (texte + images extraites), pistes audio, transcription, sommaire.",
        "Le PPTX source n'est jamais inclus dans ce paquet, il reste réservé à l'équipe pédagogique.",
        `Titre : ${escapeHtml(manifest.title)}`,
      ].join("\n"),
    ),
  };
  for (const slide of transformation.inventory.slides) {
    for (const file of [...slide.audio, ...slide.images]) {
      files[`media/${file.fileName}`] = file.bytes;
    }
  }
  return zipSync(files, { level: 6 });
}
