/**
 * LA MATRICE DE LA PROMOTION — composant PARTAGÉ par « Vue d'ensemble »,
 * « Classes d'apprenants » et « Pilotage de programme ».
 *
 * REFONTE DU 21/09 (Stef : « une liste énorme d'alertes… illisible ; il
 * faudrait un tableau avec tous les apprenants et une matrice de visualisation
 * de leurs montées en compétence »).
 *   - UNE LIGNE PAR APPRENANT, une case COLORÉE par axe : l'œil voit la
 *     promotion d'un coup, et qui décroche, sans lire un seul chiffre ;
 *   - LES SIGNAUX NE SONT PLUS UNE LISTE : ils deviennent une colonne, le
 *     nombre par apprenant, leur texte au survol. Vingt alertes sur trois
 *     étudiants se lisent comme trois lignes, pas comme vingt ;
 *   - LA DERNIÈRE CONNEXION est une colonne : « jamais connecté » se voit ;
 *   - TRI PAR RETARD par défaut (ce qu'on vient chercher), alphabétique à un clic.
 *
 * LES CHIFFRES SONT RÉELS (voir `learnerTrackingViewModel`). Un axe sans source
 * mesurée s'affiche « non mesuré » : jamais de chiffre inventé.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowDownWideNarrow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PanelCard, StatCard } from "@/features/professional/mock-ui";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { setCohortFocus, useCohortFocus } from "@/application/cohortFocusStore";
import type { ProgramAdminScope } from "@/features/administration/useProgramAdmin";
import { defaultPilotCohortId } from "@/features/administration/adminProgramViewModel";
import {
  TRACKING_AXIS_HINTS_FR,
  TRACKING_AXIS_LABELS_FR,
  buildLearnerTrackingRows,
  summarizeLearnerTracking,
  type AxisScore,
  type LearnerTrackingRow,
  type TrackingAxis,
} from "@/features/administration/learnerTrackingViewModel";

const AXES: readonly TrackingAxis[] = ["theory", "competence", "placement", "assessment"];

/** Une couleur par palier : rouge à zéro, ambre au début, bleu en route, vert acquis. */
function teinte(percent: number): string {
  if (percent === 0) return "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200";
  if (percent < 34) return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
  if (percent < 67) return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200";
  return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
}

function AxisCell({ axis, label }: { axis: AxisScore; label: string }) {
  if (axis.total === 0) {
    return <span className="text-xs text-muted-foreground">non mesuré</span>;
  }
  return (
    <span
      title={`${label} : ${axis.done} sur ${axis.total}`}
      className={`inline-flex min-w-16 justify-center rounded-md px-2 py-1 text-xs font-medium tabular-nums ${teinte(axis.percent)}`}
    >
      {axis.percent} %
    </span>
  );
}

const JOUR = 24 * 60 * 60 * 1000;

/**
 * LE CARNET DE STAGE RÉEL, DANS LA MÊME LIGNE (21/09). Le Pilotage montrait
 * trois listes des mêmes étudiants (apprenants du groupe, suivi des stages,
 * suivi de la promotion) ; ce qui était propre aux deux premières tient ici :
 * rattachement au groupe d'encadrement, journées déclarées, périodes validées,
 * corrections demandées.
 */
function Carnet({
  log,
  rattache,
}: {
  log: ProgramAdminScope["stageLogs"][number] | undefined;
  rattache: boolean;
}) {
  const validees = log?.validations.filter((v) => v.decision === "validated").length ?? 0;
  const corrections = log?.validations.filter((v) => v.decision === "needs_revision").length ?? 0;
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs">
      {!rattache ? (
        <span className="rounded-md bg-rose-100 px-2 py-1 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          sans groupe
        </span>
      ) : null}
      {!log ? (
        <span className="text-muted-foreground">non ouvert</span>
      ) : (
        <span
          title={`${log.entries.length} journée(s) déclarée(s), ${validees} période(s) validée(s), ${corrections} correction(s) demandée(s)`}
          className="rounded-md bg-muted px-2 py-1 tabular-nums"
        >
          {log.entries.length} j · {validees} validée(s)
          {corrections > 0 ? ` · ${corrections} à corriger` : ""}
        </span>
      )}
    </span>
  );
}

function Connexion({ iso }: { iso: string | undefined }) {
  if (!iso) {
    return (
      <span className="rounded-md bg-rose-100 px-2 py-1 text-xs text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
        jamais connecté
      </span>
    );
  }
  const jours = Math.floor((Date.now() - new Date(iso).getTime()) / JOUR);
  const texte = jours <= 0 ? "aujourd'hui" : jours === 1 ? "hier" : `il y a ${jours} j`;
  return (
    <span
      title={new Date(iso).toLocaleString("fr-FR")}
      className={`rounded-md px-2 py-1 text-xs ${jours > 14 ? "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200" : "text-muted-foreground"}`}
    >
      {texte}
    </span>
  );
}

export function LearnerTrackingSection({
  data,
  cohortId,
  onCohortChange,
  showCohortSelector = true,
  title = "Suivi de la promotion",
  description = "Une ligne par apprenant : où il en est sur chaque axe, sa dernière connexion et ses signaux.",
}: {
  data: ProgramAdminScope;
  cohortId?: string | undefined;
  onCohortChange?: (cohortId: string) => void;
  showCohortSelector?: boolean;
  title?: string;
  description?: string;
}) {
  const cohorts = data.cohorts;
  // 21/09 : sans promotion imposée par l'appelant, on suit celle de l'en-tête.
  const focus = useCohortFocus();
  const [tri, setTri] = useState<"retard" | "nom">("retard");
  const selectedId = cohortId ?? focus ?? defaultPilotCohortId(cohorts);
  const selected = cohorts.find((c) => c.id === selectedId);

  const rows = useMemo<readonly LearnerTrackingRow[]>(() => {
    const enrollments = data.enrollments.filter((e) => e.cohortId === selectedId);
    return buildLearnerTrackingRows({
      enrollments,
      people: data.people,
      outcomes: data.outcomes,
      logs: data.logsReceived,
      expectedLogsPerLearner: data.templates.length,
      declarations: data.declarations,
      lastSignInByPerson: data.lastSignInByPerson,
    });
  }, [data, selectedId]);

  const carnets = useMemo(
    () => new Map(data.stageLogs.map((log) => [log.enrollmentId as string, log])),
    [data.stageLogs],
  );
  const rattaches = useMemo(
    () => new Set(data.groups.flatMap((g) => g.memberEnrollmentIds.map((id) => id as string))),
    [data.groups],
  );

  const signaux = useMemo(() => {
    const parInscription = new Map<string, string[]>();
    for (const alert of data.alerts) {
      const key = alert.enrollmentId as string;
      parInscription.set(key, [...(parInscription.get(key) ?? []), alert.message]);
    }
    return parInscription;
  }, [data.alerts]);

  const tries = useMemo(
    () =>
      [...rows].sort((a, b) =>
        tri === "nom"
          ? a.personName.localeCompare(b.personName, "fr")
          : a.globalPercent - b.globalPercent ||
            (signaux.get(b.enrollmentId)?.length ?? 0) - (signaux.get(a.enrollmentId)?.length ?? 0),
      ),
    [rows, tri, signaux],
  );

  const summary = summarizeLearnerTracking(rows);
  const jamaisConnectes = rows.filter((r) => !r.lastSignInAt).length;
  const avecSignal = rows.filter((r) => (signaux.get(r.enrollmentId)?.length ?? 0) > 0).length;

  return (
    <section className="space-y-4" aria-label="Suivi de la promotion">
      {showCohortSelector ? (
        <CohortSelector
          cohorts={cohorts}
          value={selectedId}
          onChange={onCohortChange ?? setCohortFocus}
          label="Classe suivie"
        />
      ) : null}

      <PanelCard
        collapsible
        defaultOpen
        title={title}
        description={description}
        tone={avecSignal > 0 || jamaisConnectes > 0 ? "attention" : "neutral"}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Apprenants" value={summary.learners} />
          <StatCard
            label="Jamais connectés"
            value={jamaisConnectes}
            tone={jamaisConnectes > 0 ? "attention" : "done"}
          />
          <StatCard
            label="Avec un signal"
            value={avecSignal}
            tone={avecSignal > 0 ? "attention" : "done"}
          />
          <StatCard
            label="Compétences à valider"
            value={summary.awaitingValidation}
            tone={summary.awaitingValidation > 0 ? "action" : "neutral"}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-rose-200" aria-hidden /> 0 %
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-amber-200" aria-hidden /> moins d'un tiers
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-sky-200" aria-hidden /> en route
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-emerald-200" aria-hidden /> plus des deux tiers
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ms-auto min-h-11 gap-1"
            onClick={() => setTri((t) => (t === "retard" ? "nom" : "retard"))}
          >
            <ArrowDownWideNarrow className="size-4" aria-hidden />
            {tri === "retard" ? "Trié par retard" : "Trié par nom"}
          </Button>
        </div>

        {rows.length === 0 ? (
          <EmptyState>
            {selected
              ? "Aucun apprenant inscrit dans cette classe."
              : "Sélectionnez une classe pour afficher le suivi."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <caption className="sr-only">
                {AXES.map(
                  (axis) => `${TRACKING_AXIS_LABELS_FR[axis]} : ${TRACKING_AXIS_HINTS_FR[axis]}`,
                ).join(" ")}
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="sticky left-0 bg-card py-2 pr-3 font-medium">
                    Apprenant
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Connexion
                  </th>
                  {AXES.map((axis) => (
                    <th
                      key={axis}
                      scope="col"
                      title={TRACKING_AXIS_HINTS_FR[axis]}
                      className="py-2 pr-3 font-medium"
                    >
                      {TRACKING_AXIS_LABELS_FR[axis]}
                    </th>
                  ))}
                  <th
                    scope="col"
                    title="Carnet de stage réel : journées déclarées, périodes validées par l'encadrant"
                    className="py-2 pr-3 font-medium"
                  >
                    Carnet de stage
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Signaux
                  </th>
                </tr>
              </thead>
              <tbody>
                {tries.map((row) => {
                  const messages = signaux.get(row.enrollmentId) ?? [];
                  return (
                    <tr key={row.enrollmentId} className="border-b border-border last:border-0">
                      <th
                        scope="row"
                        className="sticky left-0 bg-card py-2.5 pr-3 text-left font-medium"
                      >
                        {row.personName}
                      </th>
                      <td className="py-2.5 pr-3">
                        <Connexion iso={row.lastSignInAt} />
                      </td>
                      {AXES.map((axis) => (
                        <td key={axis} className="py-2.5 pr-3">
                          <AxisCell axis={row[axis]} label={TRACKING_AXIS_LABELS_FR[axis]} />
                        </td>
                      ))}
                      <td className="py-2.5 pr-3">
                        <Carnet
                          log={carnets.get(row.enrollmentId)}
                          rattache={rattaches.has(row.enrollmentId)}
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        {messages.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span
                            title={messages.join("\n")}
                            className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                          >
                            <AlertTriangle className="size-3.5" aria-hidden />
                            {messages.length}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="min-h-11">
            <Link
              to="/espace/administration/pilotage"
              search={selectedId ? { promotion: selectedId } : {}}
            >
              Ouvrir le pilotage de cette classe
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="min-h-11">
            <Link to="/espace/administration/competences">Référentiel de compétences</Link>
          </Button>
        </div>
      </PanelCard>
    </section>
  );
}
