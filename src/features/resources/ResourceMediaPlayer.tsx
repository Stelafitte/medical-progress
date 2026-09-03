import { useQuery } from "@tanstack/react-query";

import { useDataAccess } from "@/application/session";
import { Skeleton } from "@/components/ui/skeleton";
import type { LearningResourceId } from "@/domain/types";

/**
 * Le LECTEUR d'un support déposé en seau privé.
 *
 * CE QUI MANQUAIT. Les 4 vidéos de compétence étaient visibles dans la liste et
 * strictement injouables : aucune balise `video` dans tout `src/`, et
 * `signAssetUrls` — écrite le 30/08 — n'était appelée par aucun écran
 * apprenant. Stef l'a dit le 03/09 : « les vidéos qu'on ne peut pas regarder ».
 *
 * LE LIEN EST DEMANDÉ À L'OUVERTURE, PAS AVANT. Il expire au bout d'une heure ;
 * en signer 26 au chargement de la page en produirait 25 périmés pour un
 * regardé. `staleTime` est donc calé bien en deçà de l'expiration.
 *
 * `controls` ET RIEN D'AUTRE : pas de lecture automatique, pas de préchargement
 * du flux. Un étudiant en stage regarde sur son forfait mobile.
 */
export function ResourceMediaPlayer({
  resourceId,
  title,
}: {
  readonly resourceId: LearningResourceId;
  readonly title: string;
}) {
  const dataAccess = useDataAccess();
  const { data, isPending, isError } = useQuery({
    queryKey: ["resource-media-url", resourceId],
    queryFn: () => dataAccess.resources.signResourceMediaUrl(resourceId),
    // Le lien vaut une heure : on le renouvelle bien avant qu'il ne meure.
    staleTime: 30 * 60 * 1000,
  });

  if (isPending) return <Skeleton className="aspect-video w-full" />;
  if (isError) return <p className="text-sm text-destructive">Vidéo momentanément illisible.</p>;
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun fichier n'est disponible pour ce support.
      </p>
    );
  }

  return (
    <video
      controls
      preload="none"
      className="w-full rounded-lg border border-border bg-black"
      aria-label={title}
    >
      <source src={data} />
      Votre navigateur ne sait pas lire cette vidéo.
    </video>
  );
}
