/**
 * Type de média canonique d'un fichier, déduit de son extension.
 *
 * `File.type` ne peut pas servir : le navigateur y met ce que le système
 * déclare, et Chrome étiquette un `.m4a` en `audio/x-m4a` alors que le
 * stockage n'accepte que `audio/mp4`. L'extension, elle, est stable.
 *
 * La liste correspond aux types autorisés par les buckets privés du projet.
 * Un fichier hors liste est refusé ici, avec un message lisible, plutôt que
 * par le stockage avec un message qui ne dit pas quoi faire.
 */
const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  vtt: "text/vtt",
  json: "application/json",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  webm: "video/webm",
  mov: "video/quicktime",
};

export function canonicalMediaType(fileName: string): string | undefined {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MEDIA_TYPE_BY_EXTENSION[extension];
}

export function requireCanonicalMediaType(fileName: string): string {
  const mediaType = canonicalMediaType(fileName);
  if (!mediaType) {
    throw new Error(
      `Type de fichier non pris en charge : « ${fileName} ». ` +
        "Formats acceptés : PNG, WebP, MP4, WebM, MOV, M4A, MP3, VTT, JSON, PDF, PPTX.",
    );
  }
  return mediaType;
}
