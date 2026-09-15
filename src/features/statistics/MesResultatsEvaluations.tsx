/**
 * MES RÉSULTATS D'ÉVALUATION — la section de « Mes statistiques ».
 *
 * Stef (15/09) : « dans les Statistiques de l'étudiant doivent apparaître
 * tous les résultats des évaluations ». Ce que la base sait des évaluations
 * d'un étudiant, aujourd'hui : ses réponses aux QCM (question_attempts, au
 * barème EDN) et ses passages d'ECOS virtuel (grilles rapportées). Les deux
 * sont lus ici, à son seul périmètre — rien des autres apprenants.
 *
 *   - QCM : le total, puis par item, où l'on pèche — même lecture que
 *     l'équipe a de la promotion, restreinte à soi ;
 *   - ECOS virtuel : chaque passage, sa station, sa date, son score.
 *
 * Même langage visuel que le reste de l'onglet : chiffres en display, piste
 * de 3 px, notes de pied.
 */
import { useQuery } from "@tanstack/react-query";
import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { useDataAccess, useSession } from "@/application/session";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";

const pourcent = (score: number | undefined) =>
  score === undefined ? "—" : `${Math.round(score * 100)} %`;

export function MesResultatsEvaluations({ enrollmentId }: { readonly enrollmentId: string }) {
  const data = useDataAccess();
  const { activeProgram } = useSession();
  const qcm = useQuery({
    queryKey: ["mes-resultats-qcm", enrollmentId],
    queryFn: () => data.assessments.myQuestionResults(enrollmentId),
  });
  const parItem = useQuery({
    queryKey: ["mes-resultats-qcm-items", enrollmentId],
    queryFn: () => data.assessments.myQuestionResultsByTheme(enrollmentId),
  });
  const ecos = useQuery({
    queryKey: ["ecos-external-runs", activeProgram.id, enrollmentId],
    queryFn: () => data.ecosExternal.listRunsForEnrollment(enrollmentId),
  });

  const total = qcm.data;
  const items = parItem.data ?? [];
  const passages = ecos.data ?? [];
  const charge = qcm.isPending || parItem.isPending || ecos.isPending;

  return (
    <section>
      <h2 className="mb-3 font-display text-[21px] font-medium tracking-[-0.015em]">
        Mes évaluations
      </h2>
      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        {/* QCM — le total */}
        <div className="px-4 pb-3.5 pt-4">
          <p className={`${EYEBROW} text-muted-foreground`}>QCM d'entraînement</p>
          {charge ? (
            <p className="mt-2 text-[13px] text-muted-foreground">Lecture de vos résultats…</p>
          ) : !total || total.attempts === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">
              Aucune réponse enregistrée pour l'instant : vos séries apparaîtront ici, au barème des
              EDN.
            </p>
          ) : (
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <b
                className="font-display text-[40px] font-medium leading-none tracking-[-0.03em]"
                style={TABULAIRE}
              >
                {pourcent(total.avgScore)}
              </b>
              <span className="text-sm text-muted-foreground">
                score EDN moyen · {total.attempts} réponse{total.attempts > 1 ? "s" : ""} sur{" "}
                {total.distinctQuestions} question{total.distinctQuestions > 1 ? "s" : ""}
                {total.lastAnsweredAt ? ` · dernière le ${formatFrDate(total.lastAnsweredAt)}` : ""}
              </span>
            </p>
          )}
        </div>

        {/* QCM — par item */}
        {items.length > 0 ? (
          <ul className="divide-y divide-border border-t">
            {items.map((it) => {
              const pct = it.avgScore === undefined ? 0 : Math.round(it.avgScore * 100);
              return (
                <li key={it.themeId ?? "sans-theme"} className="px-4 py-3">
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-display text-[15px] leading-tight tracking-[-0.01em]">
                      {it.themeLabel}
                    </span>
                    <span className={`${EYEBROW} text-muted-foreground`} style={TABULAIRE}>
                      {it.attempts} réponse{it.attempts > 1 ? "s" : ""} · {pourcent(it.avgScore)}
                    </span>
                  </p>
                  <span
                    className="mt-2 flex h-[3px] overflow-hidden rounded-sm bg-card-sunk"
                    aria-hidden
                  >
                    <span
                      className="block h-full bg-field"
                      style={{ width: `${Math.max(pct, it.attempts > 0 ? 3 : 0)}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {/* ECOS virtuel */}
        <div className="border-t px-4 pb-3.5 pt-4">
          <p className={`${EYEBROW} text-muted-foreground`}>ECOS virtuel</p>
          {ecos.isPending ? null : passages.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">
              Aucun passage rapporté. Jouez une station depuis « Mes évaluations » et déposez sa
              grille.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {passages.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="text-[14px]">
                    {p.stationLabel}
                    <span className="text-muted-foreground"> · {formatFrDate(p.playedOn)}</span>
                  </span>
                  <span className={`${EYEBROW} text-muted-foreground`} style={TABULAIRE}>
                    {p.score} / {p.maxScore}
                    {p.maxScore > 0 ? ` · ${Math.round((p.score / p.maxScore) * 100)} %` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="border-t px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          Les QCM d'entraînement sont corrigés au barème des EDN (1 · 0,5 · 0,2 · 0) et ne comptent
          pas dans votre validation. Votre équipe de stage voit les mêmes chiffres, agrégés à la
          promotion.
        </p>
      </div>
    </section>
  );
}
