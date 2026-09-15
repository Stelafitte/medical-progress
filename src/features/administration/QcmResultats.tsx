/**
 * LES RÉSULTATS DES QCM D'UNE PROMOTION — ce que l'équipe voit des tentatives.
 *
 * Les réponses étaient en base (`question_attempts`, une ligne par réponse
 * avec son score EDN) sans qu'aucun écran ne les lise. Ici, deux lectures
 * agrégées, jamais la copie question par question : par THÈME — où la
 * promotion pèche — et par ÉTUDIANT — qui s'entraîne, qui ne s'entraîne pas.
 *
 * Le bloc vit dans le pilotage du QCM de la promotion : tout ce qui concerne
 * le QCM de cette promotion est au même endroit. Il ne lit que la base :
 * une promotion sans réponse affiche « aucune réponse », pas des chiffres.
 */
import { useQuery } from "@tanstack/react-query";
import { useDataAccess } from "@/application/session";
import { StatCard } from "@/features/professional/mock-ui";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import type { Cohort } from "@/domain/types";

const pourcent = (score: number | undefined) => (score === undefined ? "—" : `${Math.round(score * 100)} %`);

export function QcmResultats({ cohort }: { readonly cohort: Cohort }) {
  const dataAccess = useDataAccess();
  const parEtudiant = useQuery({
    queryKey: ["qcm-resultats-etudiants", cohort.id],
    queryFn: () => dataAccess.assessments.questionResultsByLearner(cohort.id),
  });
  const parTheme = useQuery({
    queryKey: ["qcm-resultats-themes", cohort.id],
    queryFn: () => dataAccess.assessments.questionResultsByTheme(cohort.id),
  });

  const etudiants = parEtudiant.data ?? [];
  const themes = parTheme.data ?? [];
  const actifs = etudiants.filter((e) => e.attempts > 0);
  const reponses = etudiants.reduce((n, e) => n + e.attempts, 0);
  const moyenne =
    reponses > 0
      ? actifs.reduce((s, e) => s + (e.avgScore ?? 0) * e.attempts, 0) / reponses
      : undefined;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">
        Résultats <span className="text-muted-foreground font-normal">— la promotion, agrégée</span>
      </p>
      {parEtudiant.isPending || parTheme.isPending ? (
        <p className="text-muted-foreground text-xs">Lecture des résultats…</p>
      ) : parEtudiant.isError || parTheme.isError ? (
        <p className="text-destructive text-xs">Résultats illisibles pour l'instant.</p>
      ) : reponses === 0 ? (
        <p className="text-muted-foreground text-xs">
          Aucune réponse enregistrée pour cette promotion ({etudiants.length} inscrit(s)).
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Étudiants entraînés"
              value={`${actifs.length} / ${etudiants.length}`}
              hint="ont répondu à au moins une question"
            />
            <StatCard label="Réponses" value={reponses} hint="toutes tentatives confondues" />
            <StatCard label="Score EDN moyen" value={pourcent(moyenne)} hint="barème 1 · 0,5 · 0,2 · 0" />
          </div>

          {themes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-1 pr-2 text-left font-medium">Thème</th>
                    <th className="py-1 pr-2 text-right font-medium">Réponses</th>
                    <th className="py-1 pr-2 text-right font-medium">Étudiants</th>
                    <th className="py-1 text-right font-medium">Score moyen</th>
                  </tr>
                </thead>
                <tbody>
                  {themes.map((t) => (
                    <tr key={t.themeId ?? "sans-theme"} className="border-b last:border-0">
                      <td className="py-1 pr-2">{t.themeLabel}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{t.attempts}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{t.learners}</td>
                      <td className="py-1 text-right tabular-nums">{pourcent(t.avgScore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1 pr-2 text-left font-medium">Étudiant</th>
                  <th className="py-1 pr-2 text-right font-medium">Réponses</th>
                  <th className="py-1 pr-2 text-right font-medium">Questions vues</th>
                  <th className="py-1 pr-2 text-right font-medium">Score moyen</th>
                  <th className="py-1 text-right font-medium">Dernière</th>
                </tr>
              </thead>
              <tbody>
                {etudiants.map((e) => (
                  <tr key={e.enrollmentId} className="border-b last:border-0">
                    <td className="py-1 pr-2">{e.fullName}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{e.attempts}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{e.distinctQuestions}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{pourcent(e.avgScore)}</td>
                    <td className="text-muted-foreground py-1 text-right">
                      {e.lastAnsweredAt ? formatFrDate(e.lastAnsweredAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
