import { useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { personNameFor, useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { StageLogsReceived } from "@/features/stage/StageLogReviewSection";
import { STAGE_LOG_STATUS_LABELS_FR } from "@/domain/stageLog";
import { SUPERVISION_ALERT_LABELS_FR } from "@/domain/supervision";

export function AdminMonitoring() {
  const { data, isPending } = useProgramAdmin();
  const [selected, setSelected] = useState<string | null>(null);

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const statuses = ["draft", "submitted", "needs_revision", "validated", "transmitted"] as const;
  const counts = statuses.map((status) => ({
    status,
    count: data.logsReceived.filter((l) => l.status === status).length,
  }));

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Suivi pédagogique"
        level={1}
        action={<MockBadge />}
        description="Cockpit individuel, promotion, groupe, terrain et période."
      />

      <ScopeNotice>
        La fiche apprenant administrative ouvre le dossier institutionnel complet, indépendamment
        des préférences de partage personnelles de l'apprenant.
      </ScopeNotice>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Inscriptions actives" value={data.enrollments.length} />
        <StatCard label="Affectations de stage" value={data.assignments.length} />
        <StatCard label="Carnets transmis" value={data.logsReceived.length} />
        <StatCard label="Alertes ouvertes" value={data.alerts.length} />
      </div>

      <PanelCard title="État des carnets" description="Répartition par statut du workflow.">
        <ul className="flex flex-wrap gap-3 text-sm">
          {counts.map(({ status, count }) => (
            <li key={status} className="flex items-center gap-2">
              <Badge variant="outline" className="font-normal">
                {STAGE_LOG_STATUS_LABELS_FR[status]}
              </Badge>
              <span>{count}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Les carnets non commencés et incomplets seront comptés depuis la base lors de l'activation
          du backend.
        </p>
      </PanelCard>

      <PanelCard title="Étudiants en retard ou sans activité">
        {data.alerts.length === 0 ? (
          <EmptyState>Aucun signal.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{personNameFor(data, a.enrollmentId)}</span>
                <Badge variant="outline" className="font-normal">
                  {SUPERVISION_ALERT_LABELS_FR[a.kind]}
                </Badge>
                <span className="text-muted-foreground">{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard title="Fiches apprenants" description="Dossier institutionnel administratif.">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Apprenant</TableHead>
                <TableHead>Cohorte</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Dossier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.enrollments.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{personNameFor(data, e.id)}</TableCell>
                  <TableCell>
                    {data.cohorts.find((c) => c.id === e.cohortId)?.label ?? "—"}
                  </TableCell>
                  <TableCell>{e.status}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setSelected(e.id)}>
                      Ouvrir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PanelCard>

      {selected ? (
        <PanelCard
          title={`Dossier institutionnel — ${personNameFor(data, selected)}`}
          description="Vue administrative complète (démonstration)."
          action={
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Fermer
            </Button>
          }
        >
          <ul className="space-y-1 text-sm">
            <li>
              Affectations : {data.assignments.filter((a) => a.enrollmentId === selected).length}
            </li>
            <li>
              Carnets transmis :{" "}
              {data.logsReceived.filter((l) => l.enrollmentId === selected).length}
            </li>
            <li>
              Pièces administratives reçues :{" "}
              {
                data.documents.filter((d) => d.enrollmentId === selected && d.status === "received")
                  .length
              }
            </li>
            <li>Alertes : {data.alerts.filter((a) => a.enrollmentId === selected).length}</li>
          </ul>
        </PanelCard>
      ) : null}

      <StageLogsReceived />
    </div>
  );
}
