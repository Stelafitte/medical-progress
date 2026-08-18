/**
 * Profils d'exploitation IA de démonstration — MÉTADONNÉES UNIQUEMENT.
 *
 * Aucun index vectoriel, aucun découpage réel, aucun appel IA. Les compteurs de
 * segments et les références sont des exemples destinés à valider le contrat de
 * couverture : tout support publié possède un profil, prêt après contrôle.
 */
import { EXPECTED_FACETS_BY_KIND } from "@/domain/contentAi";
import type { ContentAiCitation, ContentAiProfile, ProgramAiPolicy } from "@/domain/contentAi";
import type { MediaKind, MediaResource } from "@/domain/mediaLibrary";
import { mediaResources } from "./mediaFixtures";

const invariants = { indexActivated: false, aiCallsActivated: false } as const;

export const contentAiProfiles: readonly ContentAiProfile[] = [
  /* ---------------------------- DIU Échocardiographie ---------------------- */
  {
    mediaId: "med-diu-ppt-coupes",
    programId: "prog-diu-echo",
    mediaKind: "slides_audio",
    status: "ready",
    sourceVersion: "v3.1",
    extractedFacets: ["slides", "speaker_notes", "audio_transcript", "chapters", "timestamps"],
    segmentCount: 34,
    citations: [
      {
        kind: "chapter_timestamp",
        locator: "Chapitre 2 — 03:15",
        label: "Fenêtre parasternale grand axe",
        verified: true,
      },
      {
        kind: "chapter_timestamp",
        locator: "Chapitre 3 — 11:40",
        label: "Apicale quatre cavités",
        verified: true,
      },
    ],
    outcomeIds: ["out-echo-anat"],
    indexedAt: "2026-06-02T10:35:00Z",
    enabledModes: ["ask", "be_questioned", "generate_quiz", "adaptive_review", "voice"],
    alerts: [],
    ...invariants,
  },
  {
    mediaId: "med-diu-ppt-doppler",
    programId: "prog-diu-echo",
    mediaKind: "slides_audio",
    status: "review_required",
    sourceVersion: "v1.0",
    extractedFacets: ["slides", "speaker_notes", "audio_transcript"],
    segmentCount: 18,
    citations: [
      {
        kind: "chapter_timestamp",
        locator: "Diapositive 4 — sans audio",
        label: "Réglages pratiques",
        verified: false,
      },
    ],
    outcomeIds: ["out-echo-fevg"],
    enabledModes: ["ask", "be_questioned"],
    alerts: [
      "Deux diapositives sans commentaire audio : transcription partielle.",
      "Chapitres non confirmés par l'enseignant.",
    ],
    ...invariants,
  },
  {
    mediaId: "med-dfasm-web-referentiel-cv",
    programId: "prog-dfasm-cardio",
    mediaKind: "web_page",
    status: "outdated",
    sourceVersion: "instantané 2026-08",
    extractedFacets: ["headings", "paragraphs", "tables", "anchors"],
    segmentCount: 52,
    citations: [
      {
        kind: "html_anchor",
        locator: "#douleur-thoracique",
        label: "Douleur thoracique — démarche diagnostique",
        verified: true,
      },
      {
        kind: "html_anchor",
        locator: "#syndromes-coronariens",
        label: "Syndromes coronariens aigus",
        verified: true,
      },
    ],
    outcomeIds: ["out-dfasm-douleur", "out-dfasm-ecg"],
    indexedAt: "2026-07-04T10:20:00Z",
    enabledModes: ["ask", "be_questioned", "generate_quiz", "adaptive_review", "voice"],
    alerts: [
      "Changement détecté sur la page distante le 18/08/2026 : l'instantané validé n'a pas été écrasé.",
    ],
    ...invariants,
  },
  {
    mediaId: "med-diu-lien-guidelines",
    programId: "prog-diu-echo",
    mediaKind: "link",
    status: "awaiting_extraction",
    sourceVersion: "v1.0",
    extractedFacets: ["metadata_only"],
    segmentCount: 0,
    citations: [
      {
        kind: "metadata",
        locator: "Métadonnées du lien",
        label: "Recommandations européennes (titre et éditeur déclarés)",
        verified: true,
      },
    ],
    outcomeIds: [],
    enabledModes: [],
    alerts: [
      "Lien externe simple : hors corpus IA tant qu'aucune transformation n'est décidée.",
    ],
    linkDecision: "convert_to_web_page",
    ...invariants,
  },
];

/* --------------------------------------------------------------------------
 * Profils dérivés : garantissent l'invariant « tout support publié possède un
 * profil IA ». Les valeurs sont conformes au contrat par format.
 * ------------------------------------------------------------------------ */

const SAMPLE_CITATIONS: Partial<Record<MediaKind, readonly ContentAiCitation[]>> = {
  pdf: [
    { kind: "pdf_page", locator: "p. 12", label: "Section méthode", verified: true },
    { kind: "pdf_page", locator: "p. 34", label: "Tableau de valeurs de référence", verified: true },
  ],
  slides: [{ kind: "slide", locator: "Diapositive 6", label: "Points clés", verified: true }],
  video: [
    { kind: "chapter_timestamp", locator: "Chapitre 3 — 08:20", label: "Analyse du rythme", verified: true },
  ],
  quiz: [
    { kind: "quiz_question", locator: "Question 7", label: "Diagnostic différentiel", verified: true },
  ],
  clinical_case: [
    { kind: "case_step", locator: "Étape 2", label: "Hypothèses diagnostiques", verified: true },
  ],
};

function derivedProfile(resource: MediaResource): ContentAiProfile {
  const citations = SAMPLE_CITATIONS[resource.kind] ?? [];
  const isPublished = resource.status === "published";
  return {
    mediaId: resource.id,
    programId: resource.programId,
    mediaKind: resource.kind,
    status: isPublished ? "ready" : "review_required",
    sourceVersion: resource.version,
    extractedFacets: EXPECTED_FACETS_BY_KIND[resource.kind],
    segmentCount: isPublished ? 12 + citations.length * 4 : 6,
    citations: isPublished
      ? citations
      : citations.map((citation) => ({ ...citation, verified: false })),
    outcomeIds: resource.outcomeIds,
    ...(isPublished ? { indexedAt: resource.updatedAt } : {}),
    enabledModes: isPublished
      ? ["ask", "be_questioned", "generate_quiz", "adaptive_review", "voice"]
      : ["ask"],
    alerts: isPublished
      ? []
      : ["Support non publié : références en attente de contrôle pédagogique."],
    ...invariants,
  };
}

/** Profils explicites complétés par les profils dérivés. */
export const allContentAiProfiles: readonly ContentAiProfile[] = [
  ...contentAiProfiles,
  ...mediaResources
    .filter((resource) => !contentAiProfiles.some((p) => p.mediaId === resource.id))
    .map(derivedProfile),
];

/**
 * Complète automatiquement les profils manquants pour garantir l'invariant de
 * couverture des supports publiés dans la maquette.
 */
export const programAiPolicies: readonly ProgramAiPolicy[] = [
  {
    programId: "prog-dfasm-cardio",
    allowedModes: [
      "ask",
      "be_questioned",
      "generate_quiz",
      "guided_clinical_case",
      "adaptive_review",
      "voice",
    ],
    voiceEnabled: true,
    voicePromoted: true,
    note: "DFASM Cardiologie : interaction vocale activée et mise en avant (préparation ECOS).",
  },
  {
    programId: "prog-diu-echo",
    allowedModes: [
      "ask",
      "be_questioned",
      "generate_quiz",
      "guided_clinical_case",
      "adaptive_review",
      "voice",
    ],
    voiceEnabled: true,
    voicePromoted: false,
    note: "DIU Échocardiographie : vocal disponible mais jamais lancé par défaut (maîtrise des coûts). Réglage modifiable par l'administrateur.",
  },
];
