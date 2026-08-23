/**
 * « Vue d'ensemble » du programme.
 *
 * Suite de l'audit : la promotion observée est explicite (plus d'agrégat
 * implicite), la prochaine échéance est affichée, chaque tâche et chaque alerte
 * ouvre l'écran qui permet d'agir, et les deux fonctions jusqu'ici
 * inatteignables — statistiques pluriannuelles et crédits IA — sont accessibles
 * depuis cet écran.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, CalendarClock } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { AiCreditsSection } from "@/features/administration/AiCreditsSection";
import { useProgramAdmin, personNameFor } from "@/features/administration/useProgramAdmin";
import {
  buildPilotTimeline,
  defaultPilotCohortId,
  formatFrDate,
  nextMilestone,
} from "@/features/administration/adminProgramViewModel";
import { useSession } from "@/application/session";
import { CERTIFICATE_STATUS_LABELS_FR } from "@/domain/administration";

const TASK_PRIORITY_FR: Record<string, string> = {
  high: "prioritaire",
  medium: "à planifier",
  low: "secondaire",
};

export function AdminDashboard() {
  const { activeProgram } = useSession();
  const { data, isPending } = useProgramAdmin();
  const [cohortId, setCohortId] = useState<string | null>(null);

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const selectedId = cohortId ?? defaultPilotCohortId(data.cohorts);
  const cohort = data.cohorts.find((c) => c.id === selectedId);
  const cohortLabel = cohort?.label ?? "cohorte";
  const timeline = buildPilotTimeline(data.planSchedule, cohort);
  const next = nextMilestone(timeline);

  const enrollmentsOfCohort = data.enrollments.filter((e) => e.cohortId === selectedId);
  const enrollmentIds = new Set(enrollmentsOfCohort.map((e) => e.id));
  const alerts = data.alerts.filter((alert) => enrollmentIds.has(alert.enrollmentId));
  const certificates = data.certificates.filter((c) => enrollmentIds.has(c.enrollmentId));
  const missingDocuments = data.documents.filter((d) => d.status !== "received").length;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Administration du programme"
        level={1}
        action={<MockBadge />}
        description={`Vue d'ensemble de ${activeProgram.name}, promotion par promotion. Un seul moteur, plusieurs programmes configurés.`}
      />

      <ScopeNotice>
        Périmètre strictement limité à {activeProgram.name}. Les chiffres ci-dessous se lisent pour
        la promotion sélectionnée : aucun agrégat implicite entre promotions.
      </ScopeNotice>

      <CohortSelector
        cohorts={data.cohorts}
        value={selectedId}
        onChange={setCohortId}
        label="Promotion observée"
      />

      <PanelCard
        title="Prochaine échéance du programme"
        description="Premier jalon non passé de la chronologie du programme et de la promotion observée."
        action={<CalendarClock className="text-primary size-5" aria-hidden />}
      >
        {next ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">{formatFrDate(next.date)}</span>
            <span className="font-medium">{next.label}</span>
            <Badge variant="outline" className="font-normal">
              {next.origin === "cohort" ? "jalon de promotion" : "jalon de programme"}
            </Badge>
            {next.official ? (
              <Badge variant="secondary" className="font-normal">
                date officielle
              </Badge>
            ) : null}
            <Button asChild size="sm" variant="outline" className="min-h-11">
              <Link to="/espace/administration/pilotage" search={{ promotion: selectedId }}>
                Ouvrir la chronologie
                <ArrowRight className="ms-1 size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        ) : (
          <EmptyState>Aucune échéance à venir pour cette promotion.</EmptyState>
        )}
      </PanelCard>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`Apprenants — ${cohortLabel}`}
          value={cohort?.learnerCount ?? enrollmentsOfCohort.length}
          hint={`${data.cohorts.length} promotion(s) sur ce programme`}
        />
        <StatCard
          label="Stages"
          value={data.assignments.length}
          hint={`${data.placements.length} terrain(s) configuré(s)`}
        />
        <StatCard
          label="Carnets reçus"
          value={data.logsReceived.length}
          hint="validés puis transmis en interne"
        />
        <StatCard
          label="Pièces à obtenir"
          value={missingDocuments}
          hint="demandées ou manquantes"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          title="Tâches prioritaires et échéances"
          description="Chaque tâche ouvre l'écran qui permet d'agir."
        >
          {data.tasks.length === 0 ? (
            <EmptyState>Aucune tâche.</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.tasks.map((task) => (
                <li
                  key={task.id}
                  className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <span>{task.label}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={task.priority === "high" ? "destructive" : "outline"}
                      className="font-normal"
                    >
                      {TASK_PRIORITY_FR[task.priority] ?? task.priority}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatFrDate(task.dueOn)}
                    </span>
                    <Button asChild size="sm" variant="ghost" className="min-h-11">
                      <Link to="/espace/administration/pilotage" search={{ promotion: selectedId }}>
                        Traiter
                        <ArrowRight className="ms-1 size-4" aria-hidden />
                      </Link>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard
          title={`Alertes — ${cohortLabel}`}
          description="Signaux de la promotion observée : chaque ligne mène au suivi de l'apprenant."
        >
          {alerts.length === 0 ? (
            <EmptyState>Aucune alerte pour cette promotion.</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {alerts.map((alert) => (
                <li
                  key={alert.id}
                  className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <span>
                    <span className="font-medium">{personNameFor(data, alert.enrollmentId)}</span> —{" "}
                    <span className="text-muted-foreground">{alert.message}</span>
                  </span>
                  <Button asChild size="sm" variant="ghost" className="min-h-11">
                    <Link to="/espace/encadrement/etudiants">
                      Voir l'apprenant
                      <ArrowRight className="ms-1 size-4" aria-hidden />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>

      <PanelCard
        title={`Validations et certificats — ${cohortLabel}`}
        description="Avancement du workflow de complétude pour la promotion observée."
      >
        {certificates.length === 0 ? (
          <EmptyState>Aucun certificat suivi pour cette promotion.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {certificates.map((c) => (
              <li
                key={c.id}
                className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <span>{personNameFor(data, c.enrollmentId)}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className="font-normal">
                    {CERTIFICATE_STATUS_LABELS_FR[c.status]}
                  </Badge>
                  <Button asChild size="sm" variant="ghost" className="min-h-11">
                    <Link to="/espace/administration/documents">
                      Ouvrir les documents
                      <ArrowRight className="ms-1 size-4" aria-hidden />
                    </Link>
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Statistiques pluriannuelles"
        description="Comparaison des promotions successives du programme : réussite, assiduité, carnets reçus."
        action={<BarChart3 className="text-primary size-5" aria-hidden />}
      >
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/espace/statistiques">
            Ouvrir les statistiques du programme
            <ArrowRight className="ms-1 size-4" aria-hidden />
          </Link>
        </Button>
      </PanelCard>

      <AiCreditsSection />
    </div>
  );
}
