import { Link } from "@tanstack/react-router";
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
import { learnerName, useSupervision } from "@/features/supervision/useSupervision";
import { ALERT_SEVERITY_LABELS_FR, SUPERVISION_ALERT_LABELS_FR } from "@/domain/supervision";
import { useSession } from "@/application/session";

const STATUS_FR: Record<string, string> = {
  planned: "à venir",
  in_progress: "en cours",
  completed: "terminé",
  cancelled: "annulé",
};

export function SupervisionDashboard() {
  const { activeProgram } = useSession();
  const { data, isPending } = useSupervision();

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const inProgress = data.assignments.filter((a) => a.status === "in_progress");
  const planned = data.assignments.filter((a) => a.status === "planned");
  const completed = data.assignments.filter((a) => a.status === "completed");
  const pendingConfirmations = data.confirmations.filter((c) => c.decision === "pending");
  const openCases = data.cases.filter((c) => !c.handled);

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Espace responsable de stage"
        level={1}
        action={<MockBadge />}
        description={`Encadrement clinique pour ${activeProgram.name}. Données de démonstration.`}
      />

      <ScopeNotice>
        Périmètre limité aux étudiants affectés à vos stages ({data.enrollmentIds.length}{" "}
        étudiant(s) encadré(s)). Les autres étudiants du programme ne sont jamais chargés ni
        affichés.
      </ScopeNotice>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Étudiants encadrés" value={data.enrollmentIds.length} />
        <StatCard
          label="Stages"
          value={`${inProgress.length} en cours`}
          hint={`${planned.length} à venir · ${completed.length} terminé(s)`}
        />
        <StatCard
          label="Tâches à traiter"
          value={data.logsToValidate.length + pendingConfirmations.length + openCases.length}
          hint="carnets, compétences et cas en attente"
        />
        <StatCard label="Alertes" value={data.alerts.length} hint="périmètre de vos stages" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          title="Tâches à traiter"
          description="Aucune action groupée n'est exécutée sans revue explicite de la synthèse."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/espace/encadrement/carnets">Ouvrir les carnets</Link>
            </Button>
          }
        >
          <ul className="space-y-2">
            <li className="flex items-center justify-between gap-3">
              <span>Carnets soumis à décider</span>
              <Badge variant="secondary">{data.logsToValidate.length}</Badge>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Compétences réelles à confirmer</span>
              <Badge variant="secondary">{pendingConfirmations.length}</Badge>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Cas et questions non traités</span>
              <Badge variant="secondary">{openCases.length}</Badge>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Bilans de fin de stage non signés</span>
              <Badge variant="secondary">
                {data.reports.filter((r) => !r.signature.signed).length}
              </Badge>
            </li>
          </ul>
        </PanelCard>

        <PanelCard
          title="Alertes et échéances"
          description="Signaux calculés sur vos affectations."
        >
          {data.alerts.length === 0 ? (
            <EmptyState>Aucune alerte sur votre périmètre.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {data.alerts.slice(0, 4).map((alert) => (
                <li key={alert.id} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={alert.severity === "critical" ? "destructive" : "outline"}
                      className="font-normal"
                    >
                      {SUPERVISION_ALERT_LABELS_FR[alert.kind]}
                    </Badge>
                    <span className="text-sm font-medium">
                      {learnerName(data, alert.enrollmentId)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ALERT_SEVERITY_LABELS_FR[alert.severity]}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>

      <PanelCard title="Mes stages" description="Périodes et terrains dont vous êtes responsable.">
        {data.assignments.length === 0 ? (
          <EmptyState>Aucune affectation dans ce programme.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {data.assignments.map((assignment) => {
              const placement = data.placements.find((p) => p.id === assignment.placementId);
              return (
                <li key={assignment.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{placement?.name ?? "Stage"}</span>
                  <Badge variant="outline" className="font-normal">
                    {STATUS_FR[assignment.status]}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {learnerName(data, assignment.enrollmentId)} ·{" "}
                    {new Date(assignment.startsOn).toLocaleDateString("fr-FR")} —{" "}
                    {new Date(assignment.endsOn).toLocaleDateString("fr-FR")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
