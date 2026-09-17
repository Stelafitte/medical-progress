/**
 * LES RÉSULTATS DES DOSSIERS PROGRESSIFS D'UNE PROMOTION.
 *
 * Symétrique de `QcmResultats`, et pour la même raison : les tentatives sont
 * en base depuis que le lecteur existe (17/09), il faut que l'équipe les voie.
 *
 * CE QU'ON MONTRE, ET CE QU'ON NE MONTRE PAS. Le dossier, combien d'étudiants
 * l'ont commencé, combien d'étapes ont été jouées, le score moyen. Jamais la
 * copie d'un étudiant étape par étape : l'équipe pilote un enseignement, elle
 * ne relit pas des devoirs.
 *
 * UN DOSSIER QUE PERSONNE N'OUVRE EST UNE INFORMATION, pas un vide à masquer :
 * c'est souvent qu'il est trop loin dans la liste, ou que son titre n'attire
 * personne.
 */
import { useQuery } from "@tanstack/react-query";
import { useDataAccess } from "@/application/session";
import { StatCard } from "@/features/professional/mock-ui";
import type { Cohort } from "@/domain/types";

const pourcent = (score: number | undefined) =>
  score === undefined ? "—" : `${Math.round(score * 100)} %`;

export function DossiersResultats({ cohort }: { readonly cohort: Cohort }) {
  const dataAccess = useDataAccess();
  const resultats = useQuery({
    queryKey: ["dossiers-resultats", cohort.id],
    queryFn: () => dataAccess.assessments.caseResultsByCohort(cohort.id),
  });

  const lignes = resultats.data ?? [];
  const joues = lignes.filter((l) => l.attempts > 0);
  const etapes = lignes.reduce((n, l) => n + l.attempts, 0);
  const moyenne =
    etapes > 0 ? joues.reduce((s, l) => s + (l.avgScore ?? 0) * l.attempts, 0) / etapes : undefined;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">
        Résultats <span className="text-muted-foreground font-normal">— la promotion, agrégée</span>
      </p>
      {resultats.isPending ? (
        <p className="text-muted-foreground text-xs">Lecture des résultats…</p>
      ) : resultats.isError ? (
        <p className="text-destructive text-xs">Résultats illisibles pour l'instant.</p>
      ) : etapes === 0 ? (
        <p className="text-muted-foreground text-xs">
          Aucune étape jouée sur cette promotion pour l'instant.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label="Dossiers commencés"
              value={joues.length}
              hint={`sur ${lignes.length}`}
            />
            <StatCard label="Étapes jouées" value={etapes} />
            <StatCard label="Score moyen" value={pourcent(moyenne)} />
          </div>
          <ul className="divide-border divide-y">
            {[...lignes]
              .sort((a, b) => b.attempts - a.attempts)
              .map((l) => (
                <li
                  key={l.caseId}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    {l.title}
                    <span className="text-muted-foreground text-xs">
                      {l.itemCode ? ` · item ${l.itemCode}` : ""}
                    </span>
                  </span>
                  <span
                    className="text-muted-foreground text-xs"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {l.learners} étudiant(s) · {l.attempts} étape(s) · {pourcent(l.avgScore)}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
