import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useDataAccess } from "@/application/session";
import { Skeleton } from "@/components/ui/skeleton";
import { RankBadge } from "@/components/rank-badge";
import type { KnowledgeRank, LearningResourceId } from "@/domain/types";

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
          {avecRangs(segment.content)}
        </p>
      ))}
    </div>
  );
}

/**
 * LES MARQUEURS DE RANG, RENDUS EN BADGES.
 *
 * Le texte du referentiel porte 1 017 marqueurs `[Rang A|B|C]` poses juste
 * apres les titres de section — 542 A, 380 B, 95 C. Ils s'affichaient en TEXTE
 * BRUT, crochets compris, au milieu de la prose : l'etudiant lisait
 * « Syndromes coronariens aigus [Rang A] Un syndrome coronarien... » sans que
 * rien ne distingue le marqueur du cours.
 *
 * ON NE TOUCHE QU'AUX MARQUEURS. Le decoupage du texte par section — chiffres
 * romains, sous-sections A/B — est un chantier de DONNEES tenu par la session
 * « referentiel », qui mesure d'abord la regularite des titres sur les
 * 22 chapitres. Deviner ici ce qu'est un titre produirait un second decoupage
 * concurrent, et un faux a chaque exception.
 *
 * LA REGEX EST VOLONTAIREMENT ETROITE : `[Rang X]` exactement, avec sa
 * majuscule. Elle ne peut donc pas avaler un crochet du cours.
 */
const MARQUEUR_RANG = /\[Rang ([ABC])\]/g;

function avecRangs(contenu: string): ReactNode[] {
  const morceaux: ReactNode[] = [];
  let curseur = 0;
  let trouve: RegExpExecArray | null;
  MARQUEUR_RANG.lastIndex = 0;
  while ((trouve = MARQUEUR_RANG.exec(contenu)) !== null) {
    if (trouve.index > curseur) morceaux.push(contenu.slice(curseur, trouve.index));
    morceaux.push(
      <RankBadge
        key={`${trouve.index}-${trouve[1]}`}
        rank={trouve[1] as KnowledgeRank}
        className="mx-1"
      />,
    );
    curseur = trouve.index + trouve[0].length;
  }
  if (curseur === 0) return [contenu];
  if (curseur < contenu.length) morceaux.push(contenu.slice(curseur));
  return morceaux;
}
