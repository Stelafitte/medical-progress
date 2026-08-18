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
  | "pdf"
  | "slides"
  | "slides_audio"
  | "video"
  | "link"
  | "quiz"
  | "clinical_case";

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
  | "edit_metadata"
  | "new_version"
  | "publish"
  | "unpublish"
  | "archive"
  | "preview";

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
