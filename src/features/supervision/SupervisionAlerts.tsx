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
import { EmptyState, MockBadge, ScopeNotice } from "@/features/professional/mock-ui";
import { learnerName, useSupervision } from "@/features/supervision/useSupervision";
import {
  ALERT_SEVERITY_LABELS_FR,
  SUPERVISION_ALERT_LABELS_FR,
  type SupervisionAlertKind,
} from "@/domain/supervision";

const KINDS: readonly (SupervisionAlertKind | "all")[] = [
  "all",
  "low_activity",
  "missing_quota",
  "no_entry",
  "underexposed_competence",
  "late_validation",
];

export function SupervisionAlerts() {
  const { data, isPending } = useSupervision();
  const [kind, setKind] = useState<SupervisionAlertKind | "all">("all");

  if (isPending || !data) return <Skeleton className="h-64 w-full" />;

  const alerts = data.alerts.filter((a) => kind === "all" || a.kind === kind);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Alertes"
        level={1}
        action={<MockBadge />}
        description="Faible activité, quota manquant, absence de saisie, exposition insuffisante, validation en retard."
      />

      <ScopeNotice>
        Les alertes sont calculées uniquement sur les étudiants de vos stages, dans le programme
        sélectionné.
      </ScopeNotice>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer les alertes">
        {KINDS.map((k) => (
          <Button
            key={k}
            size="sm"
            variant={kind === k ? "default" : "outline"}
            onClick={() => setKind(k)}
          >
            {k === "all" ? "Toutes" : SUPERVISION_ALERT_LABELS_FR[k]}
          </Button>
        ))}
      </div>

      {alerts.length === 0 ? (
        <EmptyState>Aucune alerte pour ce filtre.</EmptyState>
      ) : (
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Étudiant</TableHead>
                <TableHead>Détail</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead>Gravité</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell className="font-medium">
                    {SUPERVISION_ALERT_LABELS_FR[alert.kind]}
                  </TableCell>
                  <TableCell>{learnerName(data, alert.enrollmentId)}</TableCell>
                  <TableCell className="max-w-sm text-muted-foreground">{alert.message}</TableCell>
                  <TableCell>
                    {alert.dueOn ? new Date(alert.dueOn).toLocaleDateString("fr-FR") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={alert.severity === "critical" ? "destructive" : "outline"}
                      className="font-normal"
                    >
                      {ALERT_SEVERITY_LABELS_FR[alert.severity]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
