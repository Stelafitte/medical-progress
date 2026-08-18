/**
 * Médiathèque pédagogique — MODÈLE DE DOMAINE (maquette).
 *
 * Ce module ne décrit QUE des métadonnées de support. Le fichier binaire
 * (PDF, PPT, vidéo, piste audio) n'est jamais modélisé ici : aucun stockage
 * n'est activé dans cette itération. Un `MediaAsset` décrit l'emplacement
 * FUTUR du binaire, jamais son contenu.
 */
import type { IsoDateTime, OutcomeId, PersonId, ProgramId, Provenance } from "@/domain/types";

export type MediaResourceId = string & { readonly __brand?: "MediaResource" };

/** Types de supports du corpus réel des deux programmes. */
export type MediaKind =
  "pdf" | "slides" | "slides_audio" | "video" | "link" | "quiz" | "clinical_case";

export const MEDIA_KIND_LABELS_FR: Record<MediaKind, string> = {
  pdf: "PDF",
  slides: "PowerPoint",
  slides_audio: "PowerPoint commenté (audio)",
  video: "Vidéo",
  link: "Lien",
  quiz: "QCM",
  clinical_case: "Cas clinique",
};

export type MediaStatus = "draft" | "published" | "archived";

export const MEDIA_STATUS_LABELS_FR: Record<MediaStatus, string> = {
  draft: "brouillon",
  published: "publié",
  archived: "archivé",
};

/** Visibilité fonctionnelle : jamais une garantie technique dans cette maquette. */
export type MediaVisibility = "cohort" | "program" | "supervisors" | "private";

export const MEDIA_VISIBILITY_LABELS_FR: Record<MediaVisibility, string> = {
  cohort: "Promotion inscrite",
  program: "Tout le programme",
  supervisors: "Encadrants et enseignants",
  private: "Équipe pédagogique uniquement",
};

/**
 * Emplacement prévu du binaire. `storageActivated` reste faux : la maquette
 * n'écrit ni ne transmet aucun fichier.
 */
export interface MediaAsset {
  readonly kind: "file" | "url";
  /** Nom de fichier déclaré ou URL saisie. Jamais téléversé. */
  readonly label: string;
  readonly sizeHint?: string;
  readonly durationMinutes?: number;
  readonly hasTranscript?: boolean;
  readonly storageActivated: false;
}

export interface MediaVersion {
  readonly version: string;
  readonly changedAt: IsoDateTime;
  readonly authorPersonId: PersonId;
  readonly summary: string;
  readonly status: MediaStatus;
}

export interface MediaResource {
  readonly id: MediaResourceId;
  readonly programId: ProgramId;
  readonly title: string;
  readonly kind: MediaKind;
  /** Module / chapitre du programme (regroupement d'affichage). */
  readonly module: string;
  readonly description: string;
  readonly outcomeIds: readonly OutcomeId[];
  readonly version: string;
  readonly status: MediaStatus;
  readonly visibility: MediaVisibility;
  readonly authorPersonId: PersonId;
  readonly updatedAt: IsoDateTime;
  readonly availableFrom?: IsoDateTime;
  readonly availableUntil?: IsoDateTime;
  /** Vrai si l'équipe a marqué le support comme à réviser. */
  readonly needsReview: boolean;
  readonly asset: MediaAsset;
  /**
   * Présent uniquement pour un PowerPoint sonorisé/commenté : décrit la source
   * privée et l'artefact web dérivé. Aucun binaire n'existe dans la maquette.
   */
  readonly narrated?: NarratedDeck;
  readonly versions: readonly MediaVersion[];
  readonly provenance: Provenance;
}

export interface MediaFilters {
  readonly search?: string;
  readonly kind?: MediaKind | "all";
  readonly status?: MediaStatus | "all";
  readonly module?: string | "all";
  /** true = ne garder que les supports sans objectif rattaché. */
  readonly onlyUnlinked?: boolean;
}

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/** Filtrage pur, toujours cloisonné par programme en amont. */
export function filterMedia(
  resources: readonly MediaResource[],
  filters: MediaFilters,
): readonly MediaResource[] {
  const search = filters.search ? norm(filters.search.trim()) : "";
  return resources.filter((r) => {
    if (filters.kind && filters.kind !== "all" && r.kind !== filters.kind) return false;
    if (filters.status && filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.module && filters.module !== "all" && r.module !== filters.module) return false;
    if (filters.onlyUnlinked && r.outcomeIds.length > 0) return false;
    if (!search) return true;
    const haystack = norm([r.title, r.description, r.module, r.version].join(" "));
    return haystack.includes(search);
  });
}

export interface MediaIndicators {
  readonly total: number;
  readonly published: number;
  readonly drafts: number;
  readonly archived: number;
  readonly needsReview: number;
  readonly unlinked: number;
}

export function mediaIndicators(resources: readonly MediaResource[]): MediaIndicators {
  return {
    total: resources.length,
    published: resources.filter((r) => r.status === "published").length,
    drafts: resources.filter((r) => r.status === "draft").length,
    archived: resources.filter((r) => r.status === "archived").length,
    needsReview: resources.filter((r) => r.needsReview).length,
    unlinked: resources.filter((r) => r.outcomeIds.length === 0).length,
  };
}

export function mediaModules(resources: readonly MediaResource[]): readonly string[] {
  return [...new Set(resources.map((r) => r.module))].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Actions d'administration disponibles pour un support, selon son statut. */
export type MediaAction =
  "edit_metadata" | "new_version" | "publish" | "unpublish" | "archive" | "preview";

export const MEDIA_ACTION_LABELS_FR: Record<MediaAction, string> = {
  edit_metadata: "Modifier les métadonnées",
  new_version: "Créer une nouvelle version",
  publish: "Publier",
  unpublish: "Dépublier",
  archive: "Archiver",
  preview: "Prévisualiser",
};

export function availableMediaActions(resource: MediaResource): readonly MediaAction[] {
  const actions: MediaAction[] = ["edit_metadata", "new_version", "preview"];
  if (resource.status === "published") actions.push("unpublish");
  else if (resource.status === "draft") actions.push("publish");
  if (resource.status !== "archived") actions.push("archive");
  return actions;
}

/** Mention obligatoire : la maquette ne transporte aucun binaire. */
export const MEDIA_STORAGE_NOTICE_FR = "Stockage non activé dans cette maquette";

/* ==========================================================================
 * POWERPOINT SONORISÉ → LECTEUR WEB HTML5 (MAQUETTE)
 *
 * Décision fonctionnelle : le format consulté par l'apprenant n'est jamais le
 * fichier PPTX. C'est un lecteur web HTML5 assemblé à partir d'artefacts
 * DÉRIVÉS (images de diapositives, pistes audio, transcription, manifeste).
 * La source PPTX reste réservée à l'équipe pédagogique et n'apparaît dans
 * AUCUN DTO apprenant. Dans cette itération, rien n'est téléversé ni converti.
 * ========================================================================== */

/** Statut de conversion, strictement distinct du statut éditorial `MediaStatus`. */
export type ConversionStatus =
  | "not_required"
  | "awaiting_upload"
  | "queued"
  | "analyzing"
  | "converting"
  | "review_required"
  | "ready"
  | "failed";

export const CONVERSION_STATUS_LABELS_FR: Record<ConversionStatus, string> = {
  not_required: "Conversion non requise",
  awaiting_upload: "En attente de dépôt",
  queued: "En file d'attente",
  analyzing: "Analyse du paquet",
  converting: "Conversion en cours",
  review_required: "Contrôle pédagogique requis",
  ready: "Prêt à consulter",
  failed: "Échec de conversion",
};

/** Avancement simulé affiché à l'administrateur (aucune mesure réelle). */
export const CONVERSION_STATUS_PROGRESS: Record<ConversionStatus, number> = {
  not_required: 0,
  awaiting_upload: 0,
  queued: 10,
  analyzing: 30,
  converting: 60,
  review_required: 85,
  ready: 100,
  failed: 0,
};

export type ConversionAlert =
  | "missing_audio"
  | "slides_without_narration"
  | "font_not_embedded"
  | "animation_not_convertible"
  | "transcript_to_review";

export const CONVERSION_ALERT_LABELS_FR: Record<ConversionAlert, string> = {
  missing_audio: "Audio absent",
  slides_without_narration: "Commentaire manquant sur certaines diapositives",
  font_not_embedded: "Police non incorporée",
  animation_not_convertible: "Animation non convertible",
  transcript_to_review: "Transcription à relire",
};

/** Étapes du pipeline futur, dans l'ordre. */
export type ConversionStep =
  | "upload"
  | "precheck"
  | "extract"
  | "render_slides"
  | "audio"
  | "transcript"
  | "assemble_html5"
  | "pedagogical_review"
  | "publication";

export const CONVERSION_PIPELINE: readonly ConversionStep[] = [
  "upload",
  "precheck",
  "extract",
  "render_slides",
  "audio",
  "transcript",
  "assemble_html5",
  "pedagogical_review",
  "publication",
];

export const CONVERSION_STEP_LABELS_FR: Record<ConversionStep, string> = {
  upload: "Dépôt",
  precheck: "Contrôle",
  extract: "Extraction",
  render_slides: "Rendu des diapositives",
  audio: "Audio",
  transcript: "Transcription",
  assemble_html5: "Assemblage HTML5",
  pedagogical_review: "Contrôle pédagogique",
  publication: "Publication",
};

export type ConversionStepState = "pending" | "running" | "done" | "failed" | "blocked";

export const CONVERSION_STEP_STATE_LABELS_FR: Record<ConversionStepState, string> = {
  pending: "à faire",
  running: "en cours",
  done: "terminé",
  failed: "en échec",
  blocked: "bloqué",
};

export interface ConversionStepLogEntry {
  readonly step: ConversionStep;
  readonly state: ConversionStepState;
  readonly at?: IsoDateTime;
  readonly note?: string;
}

/** Sortie de conversion demandée. Le MP4 n'est qu'un secours optionnel. */
export type ConversionTarget = "html5" | "html5_mp4";

export const CONVERSION_TARGET_LABELS_FR: Record<ConversionTarget, string> = {
  html5: "Lecteur web HTML5 (recommandé)",
  html5_mp4: "HTML5 + MP4 de secours",
};

export interface NarratedConversionOptions {
  readonly extractNotes: boolean;
  readonly generateTranscript: boolean;
  readonly autoChapters: boolean;
  /** Faux = transcription masquée aux apprenants. */
  readonly exposeTranscriptToLearners: boolean;
}

/** Paquet source PPTX : métadonnée réservée à l'équipe pédagogique. */
export interface NarratedSourcePackage {
  readonly fileName: string;
  readonly sizeHint?: string;
  readonly uploadedAt?: IsoDateTime;
  /** Invariant de conception : jamais exposé côté apprenant. */
  readonly restrictedToStaff: true;
  readonly storageActivated: false;
}

export interface NarratedChapter {
  readonly id: string;
  readonly title: string;
  /** Index (1-based) de la diapositive d'ouverture du chapitre. */
  readonly startSlide: number;
}

export interface NarratedSlide {
  readonly index: number;
  readonly title: string;
  readonly durationSeconds: number;
  readonly hasNarration: boolean;
  readonly transcript?: string;
}

/** Artefact web dérivé : c'est le seul format servi à l'apprenant. */
export interface NarratedWebArtifact {
  readonly state: "draft" | "ready" | "published";
  readonly slideCount: number;
  readonly totalDurationSeconds: number;
  readonly hasTranscript: boolean;
  readonly chapters: readonly NarratedChapter[];
  readonly slides: readonly NarratedSlide[];
  /** Sortie de secours facultative, jamais recommandée par défaut. */
  readonly mp4Fallback?: { readonly label: string; readonly sizeHint?: string };
}

export interface PptxPrecheck {
  readonly extensionOk: boolean;
  readonly audioDetected: boolean;
  readonly slideCount: number;
  readonly estimatedDurationMinutes: number;
  readonly slidesWithoutNarration: readonly number[];
  readonly alerts: readonly ConversionAlert[];
  /** Vrai si le contrôle simulé autorise la mise en file. */
  readonly canQueue: boolean;
}

export interface NarratedDeck {
  readonly conversionStatus: ConversionStatus;
  readonly target: ConversionTarget;
  readonly source: NarratedSourcePackage;
  readonly options: NarratedConversionOptions;
  readonly precheck: PptxPrecheck;
  readonly alerts: readonly ConversionAlert[];
  readonly steps: readonly ConversionStepLogEntry[];
  readonly artifact?: NarratedWebArtifact;
}

export const NARRATED_UPLOAD_LABEL_FR = "Déposer un PPTX sonorisé/commenté";
export const NARRATED_SOURCE_RESTRICTION_FR =
  "Le fichier source restera réservé à l'équipe pédagogique ; les apprenants consulteront uniquement la version web";
export const NARRATED_RECOMMENDED_FORMAT_FR =
  "Le lecteur web HTML5 est le format recommandé : plus interactif et traçable que le MP4 de secours";
export const NARRATED_ONLINE_ONLY_FR = "Consultable en ligne";
export const NARRATED_SUBMIT_LABEL_FR = "Enregistrer et préparer la conversion (maquette)";
export const NARRATED_HUMAN_REVIEW_FR =
  "Aucune version web n'est publiée sans contrôle pédagogique humain";

/** Contrôle simulé du dépôt : aucune lecture de binaire, uniquement des déclarations. */
export function checkPptxUpload(input: {
  readonly fileName: string;
  readonly hasAudio: boolean;
  readonly slideCount: number;
  readonly slidesWithoutNarration?: readonly number[];
  readonly estimatedDurationMinutes?: number;
  readonly fontsEmbedded?: boolean;
  readonly hasComplexAnimations?: boolean;
}): PptxPrecheck {
  const extensionOk = /\.pptx$/i.test(input.fileName.trim());
  const slidesWithoutNarration = input.slidesWithoutNarration ?? [];
  const alerts: ConversionAlert[] = [];
  if (!input.hasAudio) alerts.push("missing_audio");
  if (slidesWithoutNarration.length > 0) alerts.push("slides_without_narration");
  if (input.fontsEmbedded === false) alerts.push("font_not_embedded");
  if (input.hasComplexAnimations) alerts.push("animation_not_convertible");
  return {
    extensionOk,
    audioDetected: input.hasAudio,
    slideCount: input.slideCount,
    estimatedDurationMinutes: input.estimatedDurationMinutes ?? 0,
    slidesWithoutNarration,
    alerts,
    canQueue: extensionOk && input.hasAudio && input.slideCount > 0,
  };
}

/** Statut de conversion d'un support, `not_required` hors PPTX commenté. */
export function conversionStatusOf(resource: MediaResource): ConversionStatus {
  return resource.narrated?.conversionStatus ?? "not_required";
}

/** Actions mock proposées à l'administrateur selon le statut de conversion. */
export type NarratedAction =
  "start_conversion" | "retry_conversion" | "preview_as_learner" | "approve_web_version";

export const NARRATED_ACTION_LABELS_FR: Record<NarratedAction, string> = {
  start_conversion: "Lancer la conversion",
  retry_conversion: "Reprendre après erreur",
  preview_as_learner: "Prévisualiser comme un étudiant",
  approve_web_version: "Valider la version web",
};

export function availableNarratedActions(deck: NarratedDeck): readonly NarratedAction[] {
  const actions: NarratedAction[] = [];
  if (deck.conversionStatus === "awaiting_upload" || deck.conversionStatus === "queued")
    actions.push("start_conversion");
  if (deck.conversionStatus === "failed") actions.push("retry_conversion");
  if (deck.artifact) actions.push("preview_as_learner");
  if (deck.conversionStatus === "review_required") actions.push("approve_web_version");
  return actions;
}

/** Vrai si l'apprenant peut consulter la version web : conversion prête ET support publié. */
export function isNarratedAvailableToLearners(resource: MediaResource): boolean {
  const deck = resource.narrated;
  if (!deck?.artifact) return false;
  return (
    deck.conversionStatus === "ready" &&
    deck.artifact.state === "published" &&
    resource.status === "published"
  );
}

/**
 * DTO apprenant. Contrat : aucune référence au paquet source (nom de fichier,
 * chemin, URL, MP4 de secours). La transcription n'est incluse que si l'équipe
 * pédagogique l'a explicitement autorisée.
 */
export interface LearnerNarratedDeck {
  readonly mediaId: MediaResourceId;
  readonly title: string;
  readonly module: string;
  readonly description: string;
  readonly outcomeIds: readonly OutcomeId[];
  readonly slideCount: number;
  readonly totalDurationSeconds: number;
  readonly chapters: readonly NarratedChapter[];
  readonly slides: readonly NarratedSlide[];
  readonly transcriptAvailable: boolean;
  readonly availability: "online_only";
}

export function toLearnerNarratedDeck(resource: MediaResource): LearnerNarratedDeck | undefined {
  const deck = resource.narrated;
  if (!deck?.artifact || !isNarratedAvailableToLearners(resource)) return undefined;
  const exposeTranscript = deck.options.exposeTranscriptToLearners && deck.artifact.hasTranscript;
  return {
    mediaId: resource.id,
    title: resource.title,
    module: resource.module,
    description: resource.description,
    outcomeIds: resource.outcomeIds,
    slideCount: deck.artifact.slideCount,
    totalDurationSeconds: deck.artifact.totalDurationSeconds,
    chapters: deck.artifact.chapters,
    slides: deck.artifact.slides.map((slide) => ({
      index: slide.index,
      title: slide.title,
      durationSeconds: slide.durationSeconds,
      hasNarration: slide.hasNarration,
      ...(exposeTranscript && slide.transcript ? { transcript: slide.transcript } : {}),
    })),
    transcriptAvailable: exposeTranscript,
    availability: "online_only",
  };
}

/** Vitesses de lecture proposées par le lecteur web. */
export const PLAYER_SPEEDS: readonly number[] = [0.75, 1, 1.25, 1.5];

export function formatPlayerDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Chapitre courant à partir de l'index (1-based) de diapositive. */
export function chapterForSlide(
  chapters: readonly NarratedChapter[],
  slideIndex: number,
): NarratedChapter | undefined {
  return [...chapters]
    .sort((a, b) => a.startSlide - b.startSlide)
    .reduce<NarratedChapter | undefined>(
      (current, chapter) => (chapter.startSlide <= slideIndex ? chapter : current),
      undefined,
    );
}
