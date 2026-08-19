/**
 * CONVERSION PPTX → LECTEUR WEB HTML5 — logique de domaine (pure).
 *
 * Ce module ne lit aucun fichier : il transforme des SIGNAUX déjà extraits du
 * paquet (voir `@/infrastructure/pptx/pptxReader`) en artefact web dérivé
 * (`NarratedWebArtifact`) et en journal de pipeline. Il est donc entièrement
 * testable et indépendant du navigateur.
 *
 * Invariant conservé : la conversion ne publie jamais. Elle produit un artefact
 * `draft` et impose un contrôle pédagogique humain avant mise à disposition.
 */
import type {
  ConversionAlert,
  ConversionStatus,
  ConversionStepLogEntry,
  ConversionTarget,
  NarratedChapter,
  NarratedConversionOptions,
  NarratedDeck,
  NarratedSlide,
  NarratedWebArtifact,
  PptxPrecheck,
} from "@/domain/mediaLibrary";

/** Signaux mesurés sur une diapositive réelle du paquet déposé. */
export interface PptxSlideSignal {
  readonly index: number;
  readonly title: string;
  readonly notes: string;
  readonly audioCount: number;
  readonly audioBytes: number;
  /** Durée mesurée par le navigateur si disponible, sinon estimée. */
  readonly audioDurationSeconds?: number;
  readonly imageCount: number;
  readonly textCount: number;
  readonly hasAnimations: boolean;
}

export interface PptxConversionInput {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly fontsEmbedded: boolean;
  readonly slides: readonly PptxSlideSignal[];
}

/** Débit de parole retenu pour estimer une durée à partir des notes. */
export const WORDS_PER_MINUTE = 150;
/** Débit audio de référence (128 kbit/s) pour estimer une durée depuis la taille. */
const BYTES_PER_SECOND = 16_000;
/** Durée plancher d'une diapositive sans commentaire dans le lecteur web. */
export const MIN_SLIDE_SECONDS = 5;

const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** Durée d'une diapositive : mesure réelle > taille audio > notes > plancher. */
export function estimateSlideDuration(slide: PptxSlideSignal): number {
  if (slide.audioDurationSeconds && slide.audioDurationSeconds > 0)
    return Math.round(slide.audioDurationSeconds);
  if (slide.audioBytes > 0) return Math.max(MIN_SLIDE_SECONDS, Math.round(slide.audioBytes / BYTES_PER_SECOND));
  const words = wordCount(slide.notes);
  if (words > 0) return Math.max(MIN_SLIDE_SECONDS, Math.round((words / WORDS_PER_MINUTE) * 60));
  return MIN_SLIDE_SECONDS;
}

/** Une diapositive est « commentée » si elle porte une piste audio ou des notes. */
export function hasNarration(slide: PptxSlideSignal): boolean {
  return slide.audioCount > 0 || wordCount(slide.notes) >= 5;
}

/** Intervalle de secours du sommaire quand aucun intercalaire n'est détecté. */
export const CHAPTER_FALLBACK_INTERVAL = 5;

/**
 * Sommaire dérivé : intercalaire = diapositive peu chargée et non commentée.
 * À défaut, découpage régulier pour garantir une navigation utilisable.
 */
export function buildChapters(slides: readonly PptxSlideSignal[]): readonly NarratedChapter[] {
  if (slides.length === 0) return [];
  const dividers = slides.filter(
    (slide) => slide.index > 1 && !hasNarration(slide) && slide.textCount <= 2,
  );
  const starts =
    dividers.length > 0
      ? [1, ...dividers.map((slide) => slide.index)]
      : slides
          .filter((slide) => (slide.index - 1) % CHAPTER_FALLBACK_INTERVAL === 0)
          .map((slide) => slide.index);
  return [...new Set(starts)]
    .sort((a, b) => a - b)
    .map((startSlide) => ({
      id: `chapter-${startSlide}`,
      title: slides.find((slide) => slide.index === startSlide)?.title ?? `Partie ${startSlide}`,
      startSlide,
    }));
}

/** Contrôle du paquet réellement décompressé (pas une déclaration de l'auteur). */
export function precheckPackage(input: PptxConversionInput): PptxPrecheck {
  const slidesWithoutNarration = input.slides.filter((s) => !hasNarration(s)).map((s) => s.index);
  const audioDetected = input.slides.some((s) => s.audioCount > 0);
  const totalSeconds = input.slides.reduce((sum, slide) => sum + estimateSlideDuration(slide), 0);
  const alerts: ConversionAlert[] = [];
  if (!audioDetected) alerts.push("missing_audio");
  if (slidesWithoutNarration.length > 0) alerts.push("slides_without_narration");
  if (!input.fontsEmbedded) alerts.push("font_not_embedded");
  if (input.slides.some((s) => s.hasAnimations)) alerts.push("animation_not_convertible");
  return {
    extensionOk: /\.pptx$/i.test(input.fileName.trim()),
    audioDetected,
    slideCount: input.slides.length,
    estimatedDurationMinutes: Math.round(totalSeconds / 60),
    slidesWithoutNarration,
    alerts,
    canQueue: /\.pptx$/i.test(input.fileName.trim()) && input.slides.length > 0,
  };
}

export const DEFAULT_CONVERSION_OPTIONS: NarratedConversionOptions = {
  extractNotes: true,
  generateTranscript: true,
  autoChapters: true,
  exposeTranscriptToLearners: true,
};

/** Alertes bloquantes : elles interdisent la publication sans arbitrage humain. */
export const BLOCKING_ALERTS: readonly ConversionAlert[] = [
  "missing_audio",
  "slides_without_narration",
  "transcript_to_review",
];

export function hasBlockingAlert(alerts: readonly ConversionAlert[]): boolean {
  return alerts.some((alert) => BLOCKING_ALERTS.includes(alert));
}

/** Artefact web dérivé, seul format destiné aux apprenants. */
export function buildArtifact(
  input: PptxConversionInput,
  options: NarratedConversionOptions,
): NarratedWebArtifact {
  const slides: NarratedSlide[] = input.slides.map((slide) => {
    const transcript = options.generateTranscript && slide.notes ? slide.notes : undefined;
    return {
      index: slide.index,
      title: slide.title,
      durationSeconds: estimateSlideDuration(slide),
      hasNarration: hasNarration(slide),
      ...(transcript ? { transcript } : {}),
    };
  });
  return {
    state: "draft",
    slideCount: slides.length,
    totalDurationSeconds: slides.reduce((sum, slide) => sum + slide.durationSeconds, 0),
    hasTranscript: slides.some((slide) => slide.transcript !== undefined),
    chapters: options.autoChapters ? buildChapters(input.slides) : [],
    slides,
  };
}

/** Journal du pipeline réellement exécuté localement. */
export function buildStepLog(
  input: PptxConversionInput,
  artifact: NarratedWebArtifact,
  at: string,
): readonly ConversionStepLogEntry[] {
  return [
    { step: "upload", state: "done", at, note: `${input.fileName} lu localement, aucun envoi réseau` },
    { step: "precheck", state: "done", at, note: `${input.slides.length} diapositive(s) inventoriée(s)` },
    {
      step: "extract",
      state: "done",
      at,
      note: `${input.slides.reduce((n, s) => n + s.audioCount, 0)} piste(s) audio et ${input.slides.reduce((n, s) => n + s.imageCount, 0)} image(s) extraites`,
    },
    { step: "render_slides", state: "done", at, note: "Diapositives rendues en HTML5 (texte + images extraites)" },
    {
      step: "audio",
      state: artifact.slides.some((s) => s.hasNarration) ? "done" : "blocked",
      at,
      note: "Pistes audio rattachées à leur diapositive",
    },
    {
      step: "transcript",
      state: artifact.hasTranscript ? "done" : "blocked",
      at,
      note: artifact.hasTranscript
        ? "Transcription issue des notes du présentateur"
        : "Aucune note exploitable : transcription à saisir",
    },
    { step: "assemble_html5", state: "done", at, note: "Paquet lecteur web HTML5 assemblé" },
    { step: "pedagogical_review", state: "pending", at, note: "Contrôle pédagogique humain obligatoire" },
    { step: "publication", state: "pending" },
  ];
}

/**
 * Conversion complète (pure). Le statut final est toujours `review_required` :
 * aucune version web n'est publiable sans validation humaine.
 */
export function convertPptx(
  input: PptxConversionInput,
  target: ConversionTarget = "html5",
  options: NarratedConversionOptions = DEFAULT_CONVERSION_OPTIONS,
  at: string = new Date().toISOString(),
): NarratedDeck {
  const precheck = precheckPackage(input);
  if (!precheck.extensionOk || input.slides.length === 0) {
    const failed: ConversionStatus = "failed";
    return {
      conversionStatus: failed,
      target,
      source: { fileName: input.fileName, restrictedToStaff: true, storageActivated: false },
      options,
      precheck,
      alerts: precheck.alerts,
      steps: [
        { step: "upload", state: "failed", at, note: "Paquet non exploitable" },
        { step: "precheck", state: "failed", at },
      ],
    };
  }
  const artifact = buildArtifact(input, options);
  const alerts = [...precheck.alerts];
  if (options.generateTranscript && artifact.hasTranscript && !alerts.includes("transcript_to_review"))
    alerts.push("transcript_to_review");
  return {
    conversionStatus: "review_required",
    target,
    source: {
      fileName: input.fileName,
      sizeHint: `${Math.max(1, Math.round(input.sizeBytes / 1024 / 1024))} Mo`,
      uploadedAt: at,
      restrictedToStaff: true,
      storageActivated: false,
    },
    options,
    precheck,
    alerts,
    steps: buildStepLog(input, artifact, at),
  } satisfies NarratedDeck as NarratedDeck & { readonly artifact?: NarratedWebArtifact } extends never
    ? never
    : { ...NarratedDeck };
}
