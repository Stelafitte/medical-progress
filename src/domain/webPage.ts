/**
 * Pages web HTML de la médiathèque — MODÈLE DE DOMAINE (maquette).
 *
 * Contrat de conception : une page web déclarée n'est JAMAIS relue librement
 * par l'IA ni téléchargée par la maquette. Le corpus exploitable est un
 * INSTANTANÉ extrait, nettoyé, versionné puis validé pédagogiquement. Si la
 * page distante change, l'instantané validé n'est jamais écrasé
 * automatiquement : la ressource est marquée « actualisation à contrôler ».
 *
 * Aucun appel réseau, aucun crawl, aucun téléchargement dans cette itération.
 */
import type { IsoDateTime, PersonId } from "@/domain/types";

/** Fréquence de vérification déclarée (aucune tâche planifiée réelle). */
export type WebCheckFrequency = "manual" | "monthly" | "quarterly";

export const WEB_CHECK_FREQUENCY_LABELS_FR: Record<WebCheckFrequency, string> = {
  manual: "Manuelle",
  monthly: "Mensuelle",
  quarterly: "Trimestrielle",
};

/** Profondeur d'extraction : page seule ou sous-pages explicitement choisies. */
export type WebCrawlDepth = "page_only" | "selected_subpages";

export const WEB_CRAWL_DEPTH_LABELS_FR: Record<WebCrawlDepth, string> = {
  page_only: "Page seule",
  selected_subpages: "Page et sous-pages sélectionnées",
};

export type WebAccessMode = "public" | "authenticated";

export const WEB_ACCESS_MODE_LABELS_FR: Record<WebAccessMode, string> = {
  public: "Page publique",
  authenticated: "Nécessite une authentification",
};

/** Étapes du pipeline d'ingestion d'une page web, dans l'ordre. */
export type WebIngestionStep =
  | "declared"
  | "extract_main_content"
  | "clean_navigation"
  | "structure_content"
  | "snapshot_version"
  | "pedagogical_review"
  | "ai_indexing"
  | "publication";

export const WEB_INGESTION_PIPELINE: readonly WebIngestionStep[] = [
  "declared",
  "extract_main_content",
  "clean_navigation",
  "structure_content",
  "snapshot_version",
  "pedagogical_review",
  "ai_indexing",
  "publication",
];

export const WEB_INGESTION_STEP_LABELS_FR: Record<WebIngestionStep, string> = {
  declared: "Lien déclaré",
  extract_main_content: "Extraction du contenu principal",
  clean_navigation: "Nettoyage navigation et publicité",
  structure_content: "Structuration titres, paragraphes, tableaux",
  snapshot_version: "Instantané versionné",
  pedagogical_review: "Contrôle pédagogique",
  ai_indexing: "Indexation IA",
  publication: "Publication",
};

/** Pré-contrôle simulé d'une URL : aucune requête HTTP n'est émise. */
export interface WebUrlPrecheck {
  readonly urlValid: boolean;
  readonly scheme?: "http" | "https";
  readonly host?: string;
  readonly canonicalUrl?: string;
  /** Accessibilité DÉCLARÉE par l'équipe pédagogique, jamais mesurée. */
  readonly reachableDeclared: boolean;
  readonly detectedTitle?: string;
  readonly detectedLanguage?: string;
  readonly sectionCount?: number;
  readonly lastAnalyzedAt?: IsoDateTime;
  readonly changeDetected: boolean;
  readonly canQueue: boolean;
  /** Rappel affiché : la maquette ne visite jamais l'URL. */
  readonly simulated: true;
}

export const WEB_PRECHECK_NOTICE_FR =
  "Pré-contrôle simulé : la maquette n'appelle jamais l'URL et ne télécharge aucune page";
export const WEB_SNAPSHOT_NOTICE_FR =
  "L'IA exploite uniquement l'instantané extrait, versionné et validé — jamais une relecture libre du Web";
export const WEB_CHANGE_NOTICE_FR =
  "Actualisation à contrôler : la version validée n'est jamais écrasée automatiquement";

const HTTP_URL = /^https?:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i;

/**
 * Contrôle purement syntaxique d'une URL http/https + report des
 * caractéristiques DÉCLARÉES. Aucune lecture de la page distante.
 */
export function checkWebPageUrl(input: {
  readonly url: string;
  readonly reachableDeclared?: boolean;
  readonly detectedTitle?: string;
  readonly detectedLanguage?: string;
  readonly sectionCount?: number;
  readonly lastAnalyzedAt?: IsoDateTime;
  readonly changeDetected?: boolean;
}): WebUrlPrecheck {
  const raw = input.url.trim();
  const urlValid = HTTP_URL.test(raw);
  const reachableDeclared = urlValid && input.reachableDeclared !== false;
  if (!urlValid) {
    return {
      urlValid: false,
      reachableDeclared: false,
      changeDetected: false,
      canQueue: false,
      simulated: true,
    };
  }
  const scheme = raw.toLowerCase().startsWith("https://") ? "https" : "http";
  const host = raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] ?? "";
  const canonicalUrl = raw.replace(/[#?].*$/, "").replace(/\/+$/, "");
  return {
    urlValid: true,
    scheme,
    host,
    canonicalUrl,
    reachableDeclared,
    ...(input.detectedTitle ? { detectedTitle: input.detectedTitle } : {}),
    ...(input.detectedLanguage ? { detectedLanguage: input.detectedLanguage } : {}),
    ...(input.sectionCount !== undefined ? { sectionCount: input.sectionCount } : {}),
    ...(input.lastAnalyzedAt ? { lastAnalyzedAt: input.lastAnalyzedAt } : {}),
    changeDetected: input.changeDetected === true,
    canQueue: reachableDeclared,
    simulated: true,
  };
}

/** Section structurée d'un instantané : sert de référence de citation. */
export interface WebSnapshotSection {
  readonly anchor: string;
  readonly heading: string;
  readonly paragraphs: number;
  readonly tables: number;
}

/** Instantané versionné et immuable une fois validé. */
export interface WebSnapshot {
  readonly version: string;
  readonly capturedAt: IsoDateTime;
  readonly language: string;
  readonly detectedTitle: string;
  readonly sections: readonly WebSnapshotSection[];
  readonly reviewedBy?: PersonId;
  readonly reviewedAt?: IsoDateTime;
  readonly validated: boolean;
  /** Aucun HTML brut n'est conservé dans la maquette. */
  readonly rawHtmlStored: false;
}

export interface WebPageSource {
  readonly canonicalUrl: string;
  readonly access: WebAccessMode;
  readonly checkFrequency: WebCheckFrequency;
  readonly depth: WebCrawlDepth;
  readonly selectedSubpages?: readonly string[];
  readonly precheck: WebUrlPrecheck;
  readonly steps: readonly {
    readonly step: WebIngestionStep;
    readonly state: "pending" | "running" | "done" | "blocked";
    readonly at?: IsoDateTime;
    readonly note?: string;
  }[];
  /** Instantané servant de source de vérité pour l'IA et les citations. */
  readonly validatedSnapshot?: WebSnapshot;
  /** Vrai si un changement distant a été signalé depuis la validation. */
  readonly refreshToReview: boolean;
  readonly lastCheckedAt?: IsoDateTime;
  /** Invariant de maquette : aucun crawl ni téléchargement. */
  readonly networkFetchActivated: false;
}

/** Vrai si l'instantané validé peut alimenter l'IA. */
export function hasValidatedSnapshot(source: WebPageSource | undefined): boolean {
  return source?.validatedSnapshot?.validated === true;
}

/** Libellé d'état affiché à l'administrateur. */
export function webSourceStateLabelFr(source: WebPageSource): string {
  if (!hasValidatedSnapshot(source)) return "Instantané en attente de validation";
  if (source.refreshToReview) return "Actualisation à contrôler";
  return "Instantané validé";
}
