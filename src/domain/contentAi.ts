/**
 * Contrat universel d'exploitation IA des contenus — MODÈLE DE DOMAINE (maquette).
 *
 * Règle de couverture : TOUT support pédagogique publié de la médiathèque doit
 * posséder un profil d'exploitation IA au statut `ready` après contrôle
 * pédagogique, quel que soit son format. Le contenu validé est la source de
 * vérité : une réponse IA doit citer une référence précise (page PDF,
 * diapositive, chapitre/timestamp, titre/ancre HTML, question de QCM, étape de
 * cas clinique) et signaler explicitement toute sortie du corpus.
 *
 * Aucune extraction, aucun index, aucun appel IA réel n'existe dans cette
 * itération : tous les états ci-dessous sont des maquettes.
 */
import type { IsoDateTime, OutcomeId, ProgramId } from "@/domain/types";
import type { MediaKind, MediaResource, MediaResourceId } from "@/domain/mediaLibrary";

/** Statut IA, strictement distinct du statut éditorial `MediaStatus`. */
export type ContentAiStatus =
  | "awaiting_extraction"
  | "extracting"
  | "structuring"
  | "review_required"
  | "indexing"
  | "ready"
  | "outdated"
  | "failed";

export const CONTENT_AI_STATUS_LABELS_FR: Record<ContentAiStatus, string> = {
  awaiting_extraction: "À traiter par l'IA",
  extracting: "Extraction en cours",
  structuring: "Structuration en cours",
  review_required: "À relire",
  indexing: "Indexation en cours",
  ready: "Prêt pour l'IA",
  outdated: "Obsolète, à réindexer",
  failed: "Échec de traitement",
};

/** Modes d'usage IA activables par ressource. */
export type ContentAiMode =
  "ask" | "be_questioned" | "generate_quiz" | "guided_clinical_case" | "adaptive_review" | "voice";

export const CONTENT_AI_MODE_LABELS_FR: Record<ContentAiMode, string> = {
  ask: "Poser une question",
  be_questioned: "Être interrogé",
  generate_quiz: "Générer / réaliser des QCM",
  guided_clinical_case: "Cas clinique guidé",
  adaptive_review: "Révision adaptative",
  voice: "Interaction vocale",
};

export const CONTENT_AI_MODES: readonly ContentAiMode[] = [
  "ask",
  "be_questioned",
  "generate_quiz",
  "guided_clinical_case",
  "adaptive_review",
  "voice",
];

/** Nature des éléments extraits, dépendante du format source. */
export type ExtractionFacet =
  | "text"
  | "ocr"
  | "structure"
  | "pages"
  | "slides"
  | "speaker_notes"
  | "audio_transcript"
  | "chapters"
  | "timestamps"
  | "headings"
  | "paragraphs"
  | "tables"
  | "anchors"
  | "questions"
  | "answers"
  | "explanations"
  | "objectives"
  | "scenario"
  | "steps"
  | "reasoning"
  | "competencies"
  | "metadata_only";

export const EXTRACTION_FACET_LABELS_FR: Record<ExtractionFacet, string> = {
  text: "Texte",
  ocr: "OCR",
  structure: "Structure",
  pages: "Pages",
  slides: "Diapositives",
  speaker_notes: "Notes du présentateur",
  audio_transcript: "Transcription audio",
  chapters: "Chapitres",
  timestamps: "Timestamps",
  headings: "Titres",
  paragraphs: "Paragraphes",
  tables: "Tableaux",
  anchors: "Ancres",
  questions: "Questions",
  answers: "Réponses",
  explanations: "Explications",
  objectives: "Objectifs",
  scenario: "Scénario",
  steps: "Étapes",
  reasoning: "Raisonnement",
  competencies: "Compétences",
  metadata_only: "Métadonnées uniquement",
};

/** Facettes attendues par format : socle du contrat universel. */
export const EXPECTED_FACETS_BY_KIND: Record<MediaKind, readonly ExtractionFacet[]> = {
  pdf: ["text", "ocr", "structure", "pages"],
  slides: ["text", "speaker_notes", "slides"],
  slides_audio: ["slides", "speaker_notes", "audio_transcript", "chapters", "timestamps"],
  video: ["audio_transcript", "chapters", "timestamps"],
  web_page: ["headings", "paragraphs", "tables", "anchors"],
  quiz: ["questions", "answers", "explanations", "objectives"],
  clinical_case: ["scenario", "steps", "reasoning", "competencies"],
  link: ["metadata_only"],
};

/** Type de référence citable, dépendant du format. */
export type CitationKind =
  | "pdf_page"
  | "slide"
  | "chapter_timestamp"
  | "html_anchor"
  | "quiz_question"
  | "case_step"
  | "metadata";

export const CITATION_KIND_LABELS_FR: Record<CitationKind, string> = {
  pdf_page: "Page PDF",
  slide: "Diapositive",
  chapter_timestamp: "Chapitre / timestamp",
  html_anchor: "Titre / ancre HTML",
  quiz_question: "Question de QCM",
  case_step: "Étape du cas clinique",
  metadata: "Métadonnées",
};

/** Type de citation attendu par format : contrat de provenance. */
export const CITATION_KIND_BY_MEDIA_KIND: Record<MediaKind, CitationKind> = {
  pdf: "pdf_page",
  slides: "slide",
  slides_audio: "chapter_timestamp",
  video: "chapter_timestamp",
  web_page: "html_anchor",
  quiz: "quiz_question",
  clinical_case: "case_step",
  link: "metadata",
};

export interface ContentAiCitation {
  readonly kind: CitationKind;
  /** Locator lisible : « p. 42 », « diapositive 4 », « 12:30 », « #diagnostic ». */
  readonly locator: string;
  readonly label: string;
  /** Vrai si la référence a été contrôlée par l'équipe pédagogique. */
  readonly verified: boolean;
}

/** Décision explicite exigée pour un lien externe simple. */
export type LinkTransformDecision = "convert_to_web_page" | "convert_to_document" | "not_published";

export const LINK_TRANSFORM_DECISION_LABELS_FR: Record<LinkTransformDecision, string> = {
  convert_to_web_page: "À transformer en page web HTML",
  convert_to_document: "À transformer en document déposé",
  not_published: "Non publié (hors corpus IA)",
};

export interface ContentAiProfile {
  readonly mediaId: MediaResourceId;
  readonly programId: ProgramId;
  readonly mediaKind: MediaKind;
  readonly status: ContentAiStatus;
  /** Version de la source (ou de l'instantané) réellement exploitée. */
  readonly sourceVersion: string;
  readonly extractedFacets: readonly ExtractionFacet[];
  readonly segmentCount: number;
  readonly citations: readonly ContentAiCitation[];
  readonly outcomeIds: readonly OutcomeId[];
  readonly indexedAt?: IsoDateTime;
  readonly enabledModes: readonly ContentAiMode[];
  readonly alerts: readonly string[];
  /** Présent seulement pour un lien externe simple. */
  readonly linkDecision?: LinkTransformDecision;
  /** Invariants de maquette. */
  readonly indexActivated: false;
  readonly aiCallsActivated: false;
}

/** Vrai si toutes les références du profil ont été contrôlées. */
export function areCitationsVerified(profile: ContentAiProfile): boolean {
  return profile.citations.length > 0 && profile.citations.every((c) => c.verified);
}

/** Vrai si les facettes attendues par format sont couvertes. */
export function coversExpectedFacets(profile: ContentAiProfile): boolean {
  const expected = EXPECTED_FACETS_BY_KIND[profile.mediaKind] ?? [];
  return expected.every((facet) => profile.extractedFacets.includes(facet));
}

/** Vrai si le type de citation du profil correspond au format source. */
export function usesExpectedCitationKind(profile: ContentAiProfile): boolean {
  const expected = CITATION_KIND_BY_MEDIA_KIND[profile.mediaKind];
  return profile.citations.every((c) => c.kind === expected);
}

/** Garde de publication : bloquée si l'IA n'est pas prête ou les références non validées. */
export interface PublicationGate {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

export function evaluatePublicationGate(
  resource: MediaResource,
  profile: ContentAiProfile | undefined,
): PublicationGate {
  const reasons: string[] = [];
  if (!profile) reasons.push("Aucun profil d'exploitation IA n'est associé à ce support.");
  else {
    if (profile.status !== "ready")
      reasons.push(
        `Traitement IA non prêt (${CONTENT_AI_STATUS_LABELS_FR[profile.status].toLowerCase()}).`,
      );
    if (!areCitationsVerified(profile))
      reasons.push("Les références/citations ne sont pas validées.");
    if (!coversExpectedFacets(profile))
      reasons.push("Le contenu extrait est incomplet pour ce format.");
    if (profile.mediaKind === "link" && !profile.linkDecision)
      reasons.push("Un lien externe simple exige une décision explicite de transformation.");
  }
  if (resource.status === "archived") reasons.push("Support archivé.");
  return { allowed: reasons.length === 0, reasons };
}

export const PUBLICATION_BLOCKED_NOTICE_FR =
  "Publication bloquée dans la maquette : le traitement IA doit être prêt et les références validées";

/** Indicateur « Couverture IA des contenus publiés ». */
export interface ContentAiCoverage {
  readonly publishedCount: number;
  readonly withProfile: number;
  readonly ready: number;
  readonly coverageRatio: number;
  readonly readyRatio: number;
  readonly byKind: readonly {
    readonly kind: MediaKind;
    readonly published: number;
    readonly ready: number;
  }[];
}

export function computeContentAiCoverage(
  resources: readonly MediaResource[],
  profiles: readonly ContentAiProfile[],
): ContentAiCoverage {
  const published = resources.filter((r) => r.status === "published");
  const byId = new Map(profiles.map((p) => [p.mediaId, p] as const));
  const withProfile = published.filter((r) => byId.has(r.id)).length;
  const ready = published.filter((r) => byId.get(r.id)?.status === "ready").length;
  const kinds = [...new Set(published.map((r) => r.kind))];
  return {
    publishedCount: published.length,
    withProfile,
    ready,
    coverageRatio: published.length === 0 ? 1 : withProfile / published.length,
    readyRatio: published.length === 0 ? 1 : ready / published.length,
    byKind: kinds.map((kind) => ({
      kind,
      published: published.filter((r) => r.kind === kind).length,
      ready: published.filter((r) => r.kind === kind && byId.get(r.id)?.status === "ready").length,
    })),
  };
}

/** Files de travail de l'administrateur. */
export type ContentAiQueue = "to_process" | "to_review" | "ready" | "outdated";

export const CONTENT_AI_QUEUE_LABELS_FR: Record<ContentAiQueue, string> = {
  to_process: "À traiter par l'IA",
  to_review: "À relire",
  ready: "Prêts",
  outdated: "Obsolètes / à réindexer",
};

export function queueOf(profile: ContentAiProfile): ContentAiQueue {
  switch (profile.status) {
    case "ready":
      return "ready";
    case "outdated":
      return "outdated";
    case "review_required":
      return "to_review";
    default:
      return "to_process";
  }
}

export function groupByQueue(
  profiles: readonly ContentAiProfile[],
): Record<ContentAiQueue, readonly ContentAiProfile[]> {
  return {
    to_process: profiles.filter((p) => queueOf(p) === "to_process"),
    to_review: profiles.filter((p) => queueOf(p) === "to_review"),
    ready: profiles.filter((p) => queueOf(p) === "ready"),
    outdated: profiles.filter((p) => queueOf(p) === "outdated"),
  };
}

/** Actions mock proposées à l'administrateur. */
export type ContentAiAction =
  "analyze" | "review" | "approve_for_ai" | "reindex" | "preview_assistant";

export const CONTENT_AI_ACTION_LABELS_FR: Record<ContentAiAction, string> = {
  analyze: "Analyser",
  review: "Relire",
  approve_for_ai: "Valider pour l'IA",
  reindex: "Réindexer",
  preview_assistant: "Prévisualiser l'assistant",
};

export function availableContentAiActions(profile: ContentAiProfile): readonly ContentAiAction[] {
  const actions: ContentAiAction[] = [];
  if (profile.status === "awaiting_extraction" || profile.status === "failed")
    actions.push("analyze");
  if (profile.status === "review_required") actions.push("review", "approve_for_ai");
  if (profile.status === "outdated") actions.push("reindex");
  if (profile.status === "ready") actions.push("preview_assistant", "reindex");
  return actions;
}

/* ==========================================================================
 * MODES PAR PROGRAMME
 * DFASM Cardiologie : vocal activé et mis en avant.
 * DIU Échocardiographie : vocal disponible mais jamais lancé par défaut
 * (maîtrise des coûts). Les deux réglages restent modifiables par l'admin.
 * ========================================================================== */

export interface ProgramAiPolicy {
  readonly programId: ProgramId;
  readonly allowedModes: readonly ContentAiMode[];
  readonly voiceEnabled: boolean;
  /** Vrai si le mode vocal est proposé en premier à l'apprenant. */
  readonly voicePromoted: boolean;
  readonly note: string;
}

export function isModeAvailable(
  policy: ProgramAiPolicy,
  profile: ContentAiProfile,
  mode: ContentAiMode,
): boolean {
  if (mode === "voice" && !policy.voiceEnabled) return false;
  return policy.allowedModes.includes(mode) && profile.enabledModes.includes(mode);
}

export function availableModes(
  policy: ProgramAiPolicy,
  profile: ContentAiProfile,
): readonly ContentAiMode[] {
  return CONTENT_AI_MODES.filter((mode) => isModeAvailable(policy, profile, mode));
}

/** Mode ouvert par défaut : jamais le vocal si le programme ne le met pas en avant. */
export function defaultMode(
  policy: ProgramAiPolicy,
  profile: ContentAiProfile,
): ContentAiMode | undefined {
  const modes = availableModes(policy, profile);
  if (policy.voicePromoted && modes.includes("voice")) return "voice";
  return modes.find((mode) => mode !== "voice") ?? modes[0];
}

/* ==========================================================================
 * ROUTEUR DE COÛTS (DOCUMENTÉ, JAMAIS APPELÉ)
 * ========================================================================== */

export type AiTier = "none" | "light_model" | "advanced_model" | "realtime_voice";

export const AI_TIER_LABELS_FR: Record<AiTier, string> = {
  none: "Sans IA (contenu validé seul)",
  light_model: "Modèle léger",
  advanced_model: "Modèle avancé",
  realtime_voice: "Vocal temps réel",
};

export const AI_TIER_ESCALATION: readonly AiTier[] = [
  "none",
  "light_model",
  "advanced_model",
  "realtime_voice",
];

/** Sélection documentaire du palier : aucune requête n'est émise. */
export function plannedTierForMode(mode: ContentAiMode): AiTier {
  switch (mode) {
    case "voice":
      return "realtime_voice";
    case "guided_clinical_case":
    case "adaptive_review":
      return "advanced_model";
    case "ask":
    case "be_questioned":
    case "generate_quiz":
      return "light_model";
    default:
      return "none";
  }
}

export const AI_MOCK_NOTICE_FR =
  "Maquette : aucun traitement IA réel, aucun index, aucun appel réseau n'a eu lieu";
export const AI_GROUNDING_NOTICE_FR =
  "Les réponses seront fondées sur les contenus pédagogiques validés et citeront leur référence ; toute sortie du corpus doit être signalée";
export const AI_VOICE_MOCK_NOTICE_FR =
  "Mode vocal simulé : aucun microphone n'est demandé et aucune session temps réel n'est ouverte";
export const AI_STUDY_CTA_FR = "Étudier avec l'IA";
export const WEB_REFERENCE_CTA_FR = "Consulter le référentiel";

/* ==========================================================================
 * DTO APPRENANT
 * ========================================================================== */

export interface LearnerAiResource {
  readonly mediaId: MediaResourceId;
  readonly title: string;
  readonly kind: MediaKind;
  readonly module: string;
  readonly description: string;
  readonly outcomeIds: readonly OutcomeId[];
  readonly sourceVersion: string;
  readonly indexedAt?: IsoDateTime;
  readonly citations: readonly ContentAiCitation[];
  readonly modes: readonly ContentAiMode[];
  /** URL canonique affichée pour une page web ; jamais ouverte automatiquement. */
  readonly canonicalUrl?: string;
  readonly hasNarratedPlayer: boolean;
}

/**
 * Construit le DTO apprenant. Rien n'est exposé si le support n'est pas publié
 * ou si le profil IA n'est pas prêt : le corpus apprenant reste le contenu
 * validé.
 */
export function toLearnerAiResource(
  resource: MediaResource,
  profile: ContentAiProfile | undefined,
  policy: ProgramAiPolicy,
): LearnerAiResource | undefined {
  if (resource.status !== "published" || !profile || profile.status !== "ready") return undefined;
  if (!areCitationsVerified(profile)) return undefined;
  return {
    mediaId: resource.id,
    title: resource.title,
    kind: resource.kind,
    module: resource.module,
    description: resource.description,
    outcomeIds: resource.outcomeIds,
    sourceVersion: profile.sourceVersion,
    ...(profile.indexedAt ? { indexedAt: profile.indexedAt } : {}),
    citations: profile.citations,
    modes: availableModes(policy, profile),
    ...(resource.webPage ? { canonicalUrl: resource.webPage.canonicalUrl } : {}),
    hasNarratedPlayer: resource.narrated?.artifact?.state === "published",
  };
}

/** Réponse factice sourcée : jamais générée par un modèle. */
export interface MockAiTurn {
  readonly role: "learner" | "assistant";
  readonly text: string;
  readonly citations?: readonly ContentAiCitation[];
}

export function buildMockAnswer(
  resource: LearnerAiResource,
  mode: ContentAiMode,
  question: string,
): MockAiTurn {
  const citation = resource.citations[0];
  const intro: Record<ContentAiMode, string> = {
    ask: `Réponse maquette fondée sur « ${resource.title} » (${resource.sourceVersion}).`,
    be_questioned: `Question maquette issue de « ${resource.title} » : décrivez la démarche attendue.`,
    generate_quiz: `QCM maquette à partir de « ${resource.title} » : 3 questions, une seule réponse exacte.`,
    guided_clinical_case: `Cas clinique guidé maquette adossé à « ${resource.title} », entièrement fictif.`,
    adaptive_review: `Plan de révision maquette calé sur vos objectifs et « ${resource.title} ».`,
    voice: `Restitution vocale simulée du contenu « ${resource.title} ».`,
  };
  const trimmed = question.trim();
  return {
    role: "assistant",
    text: `${intro[mode]}${trimmed ? ` Élément demandé : « ${trimmed} ».` : ""} ${AI_GROUNDING_NOTICE_FR}.`,
    ...(citation ? { citations: [citation] } : {}),
  };
}

/** États de la maquette vocale. Aucun accès micro, aucune session Realtime. */
export type MockVoiceState = "idle" | "ready" | "listening" | "assistant_speaking";

export const MOCK_VOICE_STATE_LABELS_FR: Record<MockVoiceState, string> = {
  idle: "Vocal à l'arrêt",
  ready: "Prêt",
  listening: "Écoute (simulée)",
  assistant_speaking: "L'assistant parle (simulé)",
};
