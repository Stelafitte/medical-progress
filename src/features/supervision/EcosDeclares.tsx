/**
 * LES PASSAGES ECOS DÉCLARÉS PAR UN ÉTUDIANT, VUS PAR SON ÉQUIPE (13/09).
 *
 * Décision 5 du modèle du 12/09 : « l'étudiant, et son équipe de stage en
 * lecture ». Ici, la lecture : quelles stations ChatGPT il a jouées, quand,
 * avec quel score, et la grille ligne à ligne si on la déplie. Rien à cliquer
 * qui change quelque chose — la base refuse de toute façon (`delete` réservé
 * à l'auteur), et un bouton grisé promettrait un droit qui n'existe pas.
 *
 * ⚠️ C'EST DÉCLARATIF. Le passage a eu lieu hors du hub, avec un patient joué
 * par ChatGPT ; personne ici n'a vu le dialogue. Le panneau le dit en une
 * ligne pour que le score ne soit pas lu comme une note d'examen.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useDataAccess } from "@/application/session";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ecosRunPercent, type EcosExternalRun } from "@/domain/ecos";
import type { EnrollmentId } from "@/domain/types";
import { GrilleTable } from "@/features/evaluations/EcosVirtuelView";

function dateCourte(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function EcosDeclares({ enrollmentId }: { readonly enrollmentId: EnrollmentId }) {
  const data = useDataAccess();
  const { data: passages, isPending } = useQuery({
    queryKey: ["ecos-external-runs", enrollmentId],
    queryFn: () => data.ecosExternal.listRunsForEnrollment(enrollmentId),
  });

  if (isPending) return <Skeleton className="h-16 w-full" />;
  if (!passages || passages.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Aucun passage déclaré. Les stations se jouent dans ChatGPT ; l'étudiant rapporte ensuite
        sa grille de notation depuis « Mes évaluations ».
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {passages.map((run) => (
        <Passage key={run.id} run={run} />
      ))}
    </ul>
  );
}

function Passage({ run }: { readonly run: EcosExternalRun }) {
  const data = useDataAccess();
  const [ouvert, setOuvert] = useState(false);
  const { data: items, isPending } = useQuery({
    queryKey: ["ecos-external-run-items", run.id],
    enabled: ouvert,
    queryFn: () => data.ecosExternal.listRunItems(run.id),
  });

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {run.stationLabel}{" "}
            <span className="text-muted-foreground font-normal">· {dateCourte(run.playedOn)}</span>
          </p>
          <p className="text-sm">
            <strong>
              {run.score} / {run.maxScore}
            </strong>{" "}
            ({ecosRunPercent(run)} %) · {run.itemCount} item(s) · déclaré par l'étudiant
          </p>
        </div>
        <Button variant="outline" size="sm" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
          {ouvert ? "Replier la grille" : "Voir la grille"}
        </Button>
      </div>
      {ouvert ? (
        <div className="mt-3 overflow-auto rounded-lg border">
          {isPending || !items ? <Skeleton className="h-16 w-full" /> : <GrilleTable items={items} />}
        </div>
      ) : null}
    </li>
  );
}
