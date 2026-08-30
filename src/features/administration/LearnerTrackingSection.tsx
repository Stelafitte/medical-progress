/**
 * Table de suivi croisée des apprenants — composant PARTAGÉ.
 * Rendu identique dans « Classes d'apprenants » (lecture par classe) et dans
 * « Pilotage de programme » (suivi de la promotion pilotée).
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState, MockBadge, PanelCard, StatCard } from "@/features/professional/mock-ui";
import { CohortSelector } from "@/features/administration/CohortSelector";
import type { ProgramAdminScope } from "@/features/administration/useProgramAdmin";
import { defaultPilotCohortId } from "@/features/administration/adminProgramViewModel";
import {
  TRACKING_AXIS_HINTS_FR,
  TRACKING_AXIS_LABELS_FR,
  buildLearnerTrackingRows,
  summarizeLearnerTracking,
  type AxisScore,
  type LearnerTrackingRow,
} from "@/features/administration/learnerTrackingViewModel";
import { assessmentFixturesFor } from "@/infrastructure/mock/assessmentFixtures";

function AxisCell({ axis }: { axis: AxisScore }) {
  if (axis.total === 0) return <span className="text-muted-foreground text-xs">non attendu</span>;
  return (
    <div className="min-w-24 space-y-1">
      <Progress value={axis.percent} className="h-1.5" />
      <span className="text-muted-foreground text-xs tabular-nums">
        {axis.done}/{axis.total} · {axis.percent} %
      </span>
    </div>
  );
}

export function LearnerTrackingSection({
  data,
  cohortId,
  onCohortChange,
  showCohortSelector = true,
  description = "Croisement des quatre axes de progression pour chaque apprenant de la classe.",
}: {
  data: ProgramAdminScope;
  cohortId?: string | undefined;
  onCohortChange?: (cohortId: string) => void;
  showCohortSelector?: boolean;
  description?: string;
}) {
  const cohorts = data.cohorts;
  const [localCohortId, setLocalCohortId] = useState<string | null>(null);
  const selectedId = cohortId ?? localCohortId ?? defaultPilotCohortId(cohorts);
  const selected = cohorts.find((c) => c.id === selectedId);

  const rows = useMemo<readonly LearnerTrackingRow[]>(() => {
    const assessments = data.program
      ? assessmentFixturesFor(
          data.program.id,
          data.program.code.toUpperCase().startsWith("DFASM"),
        )
      : [];
    const enrollments = data.enrollments.filter((e) => e.cohortId === selectedId);
    return buildLearnerTrackingRows({
      enrollments,
      people: data.people,
      outcomes: data.outcomes,
      logs: data.logsReceived,
      assessments,
      expectedLogsPerLearner: data.templates.length,
    });
  }, [data, selectedId]);

  const summary = summarizeLearnerTracking(rows);

  return (
    <section className="space-y-4" aria-label="Suivi croisé des apprenants">
      {showCohortSelector ? (
        <CohortSelector
          cohorts={cohorts}
          value={selectedId}
          onChange={onCohortChange ?? setLocalCohortId}
          label="Classe suivie"
        />
      ) : null}

      <PanelCard
        title="Table de suivi croisée des apprenants"
        description={description}
        action={<MockBadge />}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Apprenants suivis" value={summary.learners} />
          <StatCard label="Théorie (moy.)" value={`${summary.theoryPercent} %`} />
          <StatCard label="Compétences (moy.)" value={`${summary.competencePercent} %`} />
          <StatCard label="Stage (moy.)" value={`${summary.placementPercent} %`} />
          <StatCard label="Évaluations (moy.)" value={`${summary.assessmentPercent} %`} />
        </div>

        <p className="text-muted-foreground mt-3 text-xs">
          Avancement global moyen {summary.globalPercent} % · {summary.awaitingValidation}{" "}
          compétence(s) déclarée(s) en attente de validation humaine ·{" "}
          {summary.blockedLearners} apprenant(s) avec un axe encore à 0 %.
        </p>

        {rows.length === 0 ? (
          <EmptyState>
            {selected
              ? "Aucun apprenant inscrit dans cette classe."
              : "Sélectionnez une classe pour afficher le suivi."}
          </EmptyState>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <caption className="text-muted-foreground mb-2 text-left text-xs">
                {selected ? `Classe ${selected.label} · ` : ""}
                {(["theory", "competence", "placement", "assessment"] as const)
                  .map(
                    (axis) =>
                      `${TRACKING_AXIS_LABELS_FR[axis]} : ${TRACKING_AXIS_HINTS_FR[axis]}`,
                  )
                  .join(" ")}
              </caption>
              <thead>
                <tr className="text-muted-foreground border-border border-b text-left text-xs">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Apprenant
                  </th>
                  {(["theory", "competence", "placement", "assessment"] as const).map((axis) => (
                    <th key={axis} scope="col" className="py-2 pr-3 font-medium">
                      {TRACKING_AXIS_LABELS_FR[axis]}
                    </th>
                  ))}
                  <th scope="col" className="py-2 font-medium">
                    Global
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.enrollmentId} className="border-border border-b last:border-0">
                    <th scope="row" className="py-3 pr-3 text-left font-medium">
                      {row.personName}
                      <Badge variant="outline" className="ml-2 font-normal">
                        {row.status}
                      </Badge>
                    </th>
                    <td className="py-3 pr-3">
                      <AxisCell axis={row.theory} />
                    </td>
                    <td className="py-3 pr-3">
                      <AxisCell axis={row.competence} />
                    </td>
                    <td className="py-3 pr-3">
                      <AxisCell axis={row.placement} />
                    </td>
                    <td className="py-3 pr-3">
                      <AxisCell axis={row.assessment} />
                    </td>
                    <td className="py-3 font-semibold tabular-nums">{row.globalPercent} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
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
          <Button asChild size="sm" variant="outline" className="min-h-11">
            <Link to="/espace/administration/evaluations">Évaluations</Link>
          </Button>
        </div>
      </PanelCard>
    </section>
  );
}
