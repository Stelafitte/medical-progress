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
    // L'instantané validé reste exploitable : un changement distant crée une
    // alerte « actualisation à contrôler » sans jamais désindexer le corpus.
    status: "ready",
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
      "Actualisation à contrôler : changement détecté sur la page distante le 18/08/2026. L'instantané validé « 2026-08 » reste exploitable et n'a été ni écrasé ni désindexé.",
    ],
    ...invariants,
  },
  {
    // Ancien lien externe simple : converti en page web HTML avec instantané
    // validé, donc réellement exploitable et publiable.
    mediaId: "med-diu-lien-guidelines",
    programId: "prog-diu-echo",
    mediaKind: "web_page",
    status: "ready",
    sourceVersion: "instantané 2026-04",
    extractedFacets: ["headings", "paragraphs", "tables", "anchors"],
    segmentCount: 21,
    citations: [
      {
        kind: "html_anchor",
        locator: "#valeurs-reference",
        label: "Valeurs de référence des cavités",
        verified: true,
      },
      {
        kind: "html_anchor",
        locator: "#methode-fevg",
        label: "Méthode de mesure de la FEVG",
        verified: true,
      },
    ],
    outcomeIds: ["out-echo-fevg"],
    indexedAt: "2026-04-02T09:00:00Z",
    enabledModes: ["ask", "be_questioned", "generate_quiz", "adaptive_review", "voice"],
    alerts: [],
    ...invariants,
  },
  {
    // Lien externe simple NON PUBLIÉ : décision explicite requise, hors corpus.
    mediaId: "med-diu-lien-societe",
    programId: "prog-diu-echo",
    mediaKind: "link",
    status: "awaiting_extraction",
    sourceVersion: "v0.1",
    extractedFacets: ["metadata_only"],
    segmentCount: 0,
    citations: [
      {
        kind: "metadata",
        locator: "Métadonnées du lien",
        label: "Société savante (titre et éditeur déclarés)",
        verified: true,
      },
    ],
    outcomeIds: [],
    enabledModes: [],
    alerts: ["Lien externe simple : hors corpus IA tant qu'aucune transformation n'est décidée."],
    linkDecision: "convert_to_web_page",
    ...invariants,
  },
  {
    // Exemple « À traiter » — brouillon uniquement, jamais un support publié.
    mediaId: "med-diu-qcm-valves",
    programId: "prog-diu-echo",
    mediaKind: "quiz",
    status: "awaiting_extraction",
    sourceVersion: "v0.9",
    extractedFacets: ["questions", "answers"],
    segmentCount: 0,
    citations: [],
    outcomeIds: [],
    enabledModes: [],
    alerts: ["Brouillon : explications et objectifs manquants, extraction non lancée (maquette)."],
    ...invariants,
  },
  {
    // Exemple « Obsolète / à réindexer » — brouillon uniquement.
    mediaId: "med-dfasm-cas-syncope",
    programId: "prog-dfasm-cardio",
    mediaKind: "clinical_case",
    status: "outdated",
    sourceVersion: "v0.4",
    extractedFacets: ["scenario", "steps", "reasoning", "competencies"],
    segmentCount: 9,
    citations: [{ kind: "case_step", locator: "Étape 1", label: "Anamnèse", verified: false }],
    outcomeIds: [],
    enabledModes: [],
    alerts: ["Brouillon révisé après extraction : réindexation nécessaire avant publication."],
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
    {
      kind: "pdf_page",
      locator: "p. 34",
      label: "Tableau de valeurs de référence",
      verified: true,
    },
  ],
  slides: [{ kind: "slide", locator: "Diapositive 6", label: "Points clés", verified: true }],
  video: [
    {
      kind: "chapter_timestamp",
      locator: "Chapitre 3 — 08:20",
      label: "Analyse du rythme",
      verified: true,
    },
  ],
  quiz: [
    {
      kind: "quiz_question",
      locator: "Question 7",
      label: "Diagnostic différentiel",
      verified: true,
    },
  ],
  web_page: [
    {
      kind: "html_anchor",
      locator: "#points-cles",
      label: "Points clés du chapitre",
      verified: true,
    },
  ],
  clinical_case: [
    { kind: "case_step", locator: "Étape 2", label: "Hypothèses diagnostiques", verified: true },
  ],
};

function derivedProfile(resource: MediaResource): ContentAiProfile {
  const citations = SAMPLE_CITATIONS[resource.kind] ?? [];
  if (resource.status === "published" && citations.length === 0) {
    throw new Error(
      `Fixture invalide : le support publié ${resource.id} (${resource.kind}) n'a aucune référence citable.`,
    );
  }
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
    programId: "prog-dpc-hvg",
    allowedModes: ["ask", "be_questioned", "generate_quiz", "adaptive_review"],
    voiceEnabled: false,
    voicePromoted: false,
    note: "DPC HVG–Amylose : révision et interrogation écrites sur le corpus validé, vocal non activé pour ce programme.",
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
