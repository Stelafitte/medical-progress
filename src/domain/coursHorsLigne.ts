/**
 * LE COURS HORS LIGNE (18/09) -- ce que contient le ZIP, calculé sans rien
 * télécharger, pour être testé à part.
 *
 * POURQUOI UN ZIP. Les URL signées sont réémises à chaque ouverture : le cache
 * du navigateur ne sert jamais, et chaque consultation repaie ~25 Mo de sortie
 * Supabase. Un étudiant qui garde le cours sur son disque ne le repaie plus
 * (Stef, 17/09 : « le zip téléchargeable est la cible »).
 *
 * LE FILIGRANE NOMINATIF (décision de Stef, 17/09) : le nom de l'étudiant dans
 * le manifeste, et un bandeau permanent du lecteur. Pas d'incrustation dans
 * l'image : il peut l'effacer, mais il faut le vouloir.
 *
 * LE MANIFESTE EST UN SCRIPT, PAS UN JSON. Le lecteur s'ouvre par double-clic
 * (file://), où `fetch` est refusé : `manifest.js` pose `window.COURSE_MANIFEST`.
 */

export interface OfflineSlideSource {
  readonly index: number;
  readonly title: string;
  readonly videoUrl?: string | undefined;
  readonly imageUrl?: string | undefined;
  readonly audioUrl?: string | undefined;
  readonly transcript?: string | undefined;
}

export interface OfflineCourseMeta {
  readonly id: string;
  readonly title: string;
  readonly version: string;
  readonly learnerName: string;
  readonly learnerEmail: string;
  /** Date lisible, déjà formatée (« 18/09/2026 »). */
  readonly downloadedOn: string;
}

export interface OfflineDownload {
  /** Chemin DANS le dossier du cours. */
  readonly path: string;
  readonly url: string;
}

export interface OfflinePlan {
  readonly folder: string;
  readonly downloads: readonly OfflineDownload[];
  readonly manifestJs: string;
}

/** Extension lue dans le chemin de l'URL, requête signée exclue. */
export function extensionOf(url: string, fallback: string): string {
  const chemin = url.split("?")[0] ?? "";
  const match = /\.([a-z0-9]{2,5})$/i.exec(chemin);
  return match?.[1] ? match[1].toLowerCase() : fallback;
}

/** Nom de dossier sûr sur tous les systèmes, à partir du titre. */
export function folderNameFor(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return base || "cours";
}

export function planOfflineCourse(
  slides: readonly OfflineSlideSource[],
  meta: OfflineCourseMeta,
): OfflinePlan {
  const downloads: OfflineDownload[] = [];
  const manifestSlides = slides.map((slide) => {
    const n = String(slide.index).padStart(2, "0");
    const piste = (url: string | undefined, nom: string, ext: string) => {
      if (!url) return undefined;
      const path = `medias/${n}-${nom}.${extensionOf(url, ext)}`;
      downloads.push({ path, url });
      return path;
    };
    const videoUrl = piste(slide.videoUrl, "clip", "mp4");
    const imageUrl = piste(slide.imageUrl, "image", "jpg");
    // L'audio séparé n'est utile que sans clip : le clip porte déjà la narration.
    const audioUrl = videoUrl ? undefined : piste(slide.audioUrl, "audio", "m4a");
    return {
      index: slide.index,
      title: slide.title,
      ...(videoUrl ? { videoUrl } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(audioUrl ? { audioUrl } : {}),
      ...(slide.transcript ? { transcript: slide.transcript } : {}),
    };
  });
  const manifest = {
    format: "campus-sante-cours-hors-ligne",
    formatVersion: 1,
    course: {
      id: meta.id,
      title: meta.title,
      version: meta.version,
      slideCount: slides.length,
    },
    learner: { name: meta.learnerName, email: meta.learnerEmail },
    downloadedOn: meta.downloadedOn,
    slides: manifestSlides,
  };
  return {
    folder: folderNameFor(meta.title),
    downloads,
    manifestJs: `window.COURSE_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n`,
  };
}
