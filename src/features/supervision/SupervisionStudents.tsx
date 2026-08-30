import { useMemo, useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { learnerName, useSupervision } from "@/features/supervision/useSupervision";

export function SupervisionStudents() {
  const { data, isPending } = useSupervision();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.enrollments
      .map((enrollment) => ({
        enrollment,
        name: learnerName(data, enrollment.id),
        assignment: data.assignments.find((a) => a.enrollmentId === enrollment.id),
        alerts: data.alerts.filter((a) => a.enrollmentId === enrollment.id).length,
        confirmations: data.confirmations.filter(
          (c) => c.enrollmentId === enrollment.id && c.decision === "pending",
        ).length,
        logs: data.logsToValidate.filter((l) => l.enrollmentId === enrollment.id).length,
      }))
      .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()));
  }, [data, query]);

  if (isPending || !data) return <Skeleton className="h-72 w-full" />;

  const detail = rows.find((r) => r.enrollment.id === selected) ?? null;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Mes étudiants"
        level={1}
        action={<MockBadge />}
        description="Fiche synthétique par étudiant : progression, activité de stage et dernier contact."
      />

      <ScopeNotice>
        Seuls les étudiants affectés à vos stages apparaissent ici. Aucun accès aux autres étudiants
        de la promotion.
      </ScopeNotice>

      <div className="max-w-sm">
        <label htmlFor="filtre-etudiants" className="mb-1 block text-sm font-medium">
          Filtrer par nom
        </label>
        <Input
          id="filtre-etudiants"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom de l'étudiant"
        />
      </div>

      <div className="surface-panel overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Étudiant</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Carnets à décider</TableHead>
              <TableHead className="text-right">Compétences à confirmer</TableHead>
              <TableHead className="text-right">Alertes</TableHead>
              <TableHead className="text-right">Fiche</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.enrollment.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  {data.placements.find((p) => p.id === row.assignment?.placementId)?.name ?? "—"}
                </TableCell>
                <TableCell className="text-right">{row.logs}</TableCell>
                <TableCell className="text-right">{row.confirmations}</TableCell>
                <TableCell className="text-right">
                  {row.alerts > 0 ? (
                    <Badge variant="destructive" className="font-normal">
                      {row.alerts}
                    </Badge>
                  ) : (
                    "0"
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected(row.enrollment.id)}
                  >
                    Ouvrir
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 ? (
          <EmptyState>Aucun étudiant ne correspond au filtre.</EmptyState>
        ) : null}
      </div>

      {detail ? (
        <PanelCard
          title={`Fiche — ${detail.name}`}
          description="Synthèse d'encadrement (démonstration, aucune donnée patient)."
          action={
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Fermer
            </Button>
          }
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Connaissances</dt>
              <dd>Progression suivie dans le passeport de l'étudiant.</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Compétences simulées</dt>
              <dd>Séances de simulation enregistrées dans le programme.</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Compétences réelles</dt>
              <dd>
                {detail.confirmations} en attente de votre confirmation — aucune acquisition sans
                validation humaine.
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Activité de stage</dt>
              <dd>{detail.logs} carnet(s) soumis à décider.</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Dernier contact</dt>
              <dd>
                {data.messages.length > 0
                  ? new Date(data.messages[0]!.sentAt).toLocaleDateString("fr-FR")
                  : "—"}{" "}
                (messagerie simulée)
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Alertes</dt>
              <dd>{detail.alerts} signal(aux) actif(s).</dd>
            </div>
          </dl>
        </PanelCard>
      ) : null}
    </div>
  );
}
