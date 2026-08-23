/**
 * « Pilotage de programme » — l'EXPLOITATION d'une promotion précise.
 *
 * Un même programme peut être rejoué par plusieurs promotions, parallèles ou
 * successives : le pilotage se fait donc toujours promotion par promotion.
 * Aucun rappel des trois étapes ici (il reste sur le concepteur).
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Notebook, UserRound, Users } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { personNameFor, useProgramAdmin } from "@/features/administration/useProgramAdmin";
import {
  COHORT_PHASE_LABELS_FR,
  buildPilotTimeline,
  cohortPhase,
  cohortProgressRatio,
  defaultPilotCohortId,
  formatFrDate,
  nextMilestone,
} from "@/features/administration/adminProgramViewModel";
import { ROLE_LABELS_FR } from "@/domain/roles";

const STATE_STYLES = {
  done: "border-border text-muted-foreground",
  current: "border-primary bg-primary/5",
  upcoming: "border-border",
} as const;

export function AdminProgramPilot() {
  const { data, isPending } = useProgramAdmin();
  const [cohortId, setCohortId] = useState<string | null>(null);

  const cohorts = data?.cohorts ?? [];
  const selectedId = cohortId ?? defaultPilotCohortId(cohorts);
  const selected = cohorts.find((c) => c.id === selectedId);

  const timeline = useMemo(
    () => buildPilotTimeline(data?.planSchedule ?? [], selected),
    [data?.planSchedule, selected],
  );

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const upcoming = nextMilestone(timeline);
  const cohortEnrollments = data.enrollments.filter((e) => e.cohortId === selectedId);
  const cohortLogs = data.logsReceived.filter((log) =>
    cohortEnrollments.some((e) => e.id === log.enrollmentId),
  );
  const cohortAlerts = data.alerts.filter((alert) =>
    cohortEnrollments.some((e) => e.id === alert.enrollmentId),
  );
  const scopedRoles = data.roleAssignments.filter(
    (r) =>
      r.scope.kind !== "platform" &&
      "programId" in r.scope &&
      r.scope.programId === data.program?.id,
  );
  const progress = selected ? Math.round(cohortProgressRatio(selected) * 100) : 0;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Pilotage de programme"
        level={1}
        action={<MockBadge />}
        description="Suivez une promotion en cours : calendrier daté, inscriptions, carnets, alertes et intervenants."
      />

      <ScopeNotice>
        Le modèle pédagogique ne se modifie pas ici : il se conçoit dans « Concepteur de programme ».
        Cet écran n'agit que sur la promotion sélectionnée.
      </ScopeNotice>

      <CohortSelector cohorts={cohorts} value={selectedId} onChange={setCohortId} label="Promotion pilotée" />

      {!selected ? (
        <EmptyState>Aucune promotion rattachée à ce programme.</EmptyState>
      ) : (
        <>
          {/* Bandeau d'état de la promotion */}
          <section className="border-border bg-card space-y-3 rounded-lg border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selected.label}</h2>
                <p className="text-muted-foreground text-sm">
                  {formatFrDate(selected.startsOn)} → {formatFrDate(selected.endsOn)}
                </p>
              </div>
              <Badge variant="secondary" className="font-normal">
                {COHORT_PHASE_LABELS_FR[cohortPhase(selected)]}
              </Badge>
            </div>
            <Progress value={progress} />
            <p className="text-muted-foreground text-xs">
              Avancement calendaire {progress} %
              {upcoming
                ? ` · prochaine échéance : ${upcoming.label} le ${formatFrDate(upcoming.date)}`
                : " · tous les jalons connus sont passés"}
            </p>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {[
                { icon: Users, label: "Inscriptions", value: cohortEnrollments.length },
                { icon: Notebook, label: "Carnets reçus", value: cohortLogs.length },
                { icon: AlertTriangle, label: "Alertes ouvertes", value: cohortAlerts.length },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="border-border rounded-md border p-3">
                  <Icon className="text-muted-foreground size-4" aria-hidden />
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                </div>
              ))}
            </dl>
          </section>

          <PanelCard
            title="Calendrier daté de la promotion"
            description="Jalons du modèle repositionnés sur les dates réelles de cette promotion."
          >
            <ol className="space-y-2 text-sm">
              {timeline.map((item) => (
                <li
                  key={item.id}
                  aria-current={item.state === "current" ? "step" : undefined}
                  className={`flex flex-wrap items-center gap-2 rounded-md border p-3 ${STATE_STYLES[item.state]}`}
                >
                  <span className="font-mono text-xs">{formatFrDate(item.date)}</span>
                  <span className="font-medium">{item.label}</span>
                  <Badge variant="outline" className="bg-background font-normal">
                    {item.origin === "cohort" ? "promotion" : "programme"}
                  </Badge>
                  {item.detail ? (
                    <span className="text-muted-foreground text-xs">{item.detail}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </PanelCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard
              title="Signaux à traiter"
              description="Retards et absences d'activité sur cette promotion."
            >
              {cohortAlerts.length === 0 ? (
                <EmptyState>Aucun signal sur cette promotion.</EmptyState>
              ) : (
                <ul className="space-y-2 text-sm">
                  {cohortAlerts.map((alert) => (
                    <li
                      key={alert.id}
                      className="border-border flex flex-wrap items-center gap-2 rounded-md border p-3"
                    >
                      <AlertTriangle className="text-muted-foreground size-4" aria-hidden />
                      <span className="font-medium">{personNameFor(data, alert.enrollmentId)}</span>
                      <span className="text-muted-foreground">{alert.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            <PanelCard
              title="Intervenants et rôles"
              description="Rôles contextualisés au programme : aucun rôle global."
            >
              {scopedRoles.length === 0 ? (
                <EmptyState>Aucun intervenant rattaché.</EmptyState>
              ) : (
                <ul className="space-y-2 text-sm">
                  {scopedRoles.map((role, index) => (
                    <li
                      key={`${role.personId}-${role.role}-${index}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <UserRound className="text-muted-foreground size-4" aria-hidden />
                      <span className="font-medium">
                        {data.people.find((p) => p.id === role.personId)?.fullName ?? role.personId}
                      </span>
                      <Badge variant="outline" className="font-normal">
                        {ROLE_LABELS_FR[role.role]}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        portée : {role.scope.kind}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>
          </div>

          <PanelCard
            title="Outils de pilotage"
            description="Communications, statistiques et documents restent des écrans dédiés."
          >
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/espace/administration/communications">Communications</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/espace/statistiques">Statistiques</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/espace/administration/documents">Documents et certificats</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/espace/administration/classes">
                  Classes d'apprenants
                  <ArrowRight className="ms-1 size-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </PanelCard>
        </>
      )}
    </div>
  );
}
