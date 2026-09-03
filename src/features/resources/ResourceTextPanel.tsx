import { useQuery } from "@tanstack/react-query";

import { useDataAccess } from "@/application/session";
import { Skeleton } from "@/components/ui/skeleton";
import type { LearningResourceId } from "@/domain/types";

/**
 * Le CONTENU DÉTAILLÉ d'un support, lu depuis `learning_resource_texts`.
 *
 * CE QUI MANQUAIT. Le texte intégral des cours est en base depuis le 30/08 —
 * plus d'un million de caractères, découpés en segments de 4 000 — et **rien ne
 * l'affichait à l'apprenant**. Il voyait le titre d'un chapitre, jamais son
 * contenu. C'est l'objectif 2 énoncé par Stef le 03/09 : « surtout les contenus
 * détaillés quand ils sont présents ».
 *
 * CHARGÉ À L'OUVERTURE, PAS AVANT. Un chapitre peut peser plusieurs dizaines de
 * milliers de caractères ; charger les 22 d'un coup à l'affichage de la page
 * ferait payer à l'étudiant un contenu qu'il n'a pas demandé. La requête part
 * quand il déplie, et react-query la garde ensuite.
 *
 * L'ORDRE DES SEGMENTS EST CELUI DE LA BASE (`segmentIndex`) : un texte
 * recomposé dans le désordre serait pire qu'un texte absent, et rien à l'écran
 * ne permettrait de s'en apercevoir.
 */
export function ResourceTextPanel({ resourceId }: { resourceId: LearningResourceId }) {
  const dataAccess = useDataAccess();
  const { data, isPending, isError } = useQuery({
    queryKey: ["resource-text", resourceId],
    queryFn: () => dataAccess.resources.listResourceTexts(resourceId),
  });

  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (isError) return <p className="text-sm text-destructive">Contenu momentanément illisible.</p>;
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ce support n'a pas de contenu texte enregistré.
      </p>
    );
  }

  const segments = [...data].sort(
    (a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.segmentIndex - b.segmentIndex,
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {segments.length} segment(s) — contenu intégral du support.
      </p>
      {segments.map((segment) => (
        <p
          key={`${segment.sourcePath}#${segment.segmentIndex}`}
          className="whitespace-pre-wrap text-sm leading-relaxed"
        >
          {segment.content}
        </p>
      ))}
    </div>
  );
}
