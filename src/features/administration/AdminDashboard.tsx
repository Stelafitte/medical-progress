import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { useProgramAdmin, personNameFor } from "@/features/administration/useProgramAdmin";
import { useSession } from "@/application/session";
import { CERTIFICATE_STATUS_LABELS_FR } from "@/domain/administration";

export function AdminDashboard() {
  const { activeProgram } = useSession();
  const { data, isPending } = useProgramAdmin();

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const learners = data.cohorts.reduce((n, c) => n + c.learnerCount, 0);
  const missingDocuments = data.documents.filter((d) => d.status !== "received").length;

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Administration du programme"
        level={1}
        action={<MockBadge />}
        description={`Pilotage de ${activeProgram.name}. Un seul moteur, plusieurs programmes configurés.`}
      />

      <ScopeNotice>
        Périmètre strictement limité à {activeProgram.name}. Un administrateur de programme n'accède
        jamais aux autres programmes sans rôle explicite, et l'administration plateforme n'ouvre
        aucun dossier pédagogique.
      </ScopeNotice>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Apprenants de la promotion" value={learners} />
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
        <PanelCard title="Tâches prioritaires et échéances">
          {data.tasks.length === 0 ? (
            <EmptyState>Aucune tâche.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {data.tasks.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{task.label}</span>
                  <span className="flex items-center gap-2">
                    <Badge
                      variant={task.priority === "high" ? "destructive" : "outline"}
                      className="font-normal"
                    >
                      {task.priority === "high"
                        ? "prioritaire"
                        : task.priority === "medium"
                          ? "à planifier"
                          : "secondaire"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(task.dueOn).toLocaleDateString("fr-FR")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard title="Alertes de la promotion" description="Signaux consolidés du programme.">
          {data.alerts.length === 0 ? (
            <EmptyState>Aucune alerte.</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.alerts.map((alert) => (
                <li key={alert.id}>
                  <span className="font-medium">{personNameFor(data, alert.enrollmentId)}</span> —{" "}
                  <span className="text-muted-foreground">{alert.message}</span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>

      <PanelCard
        title="Validations et certificats"
        description="Avancement du workflow de complétude."
      >
        <ul className="space-y-2 text-sm">
          {data.certificates.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{personNameFor(data, c.enrollmentId)}</span>
              <Badge variant="outline" className="font-normal">
                {CERTIFICATE_STATUS_LABELS_FR[c.status]}
              </Badge>
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  );
}
