import { useQuery } from "@tanstack/react-query";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MockBadge, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import { RETENTION_TBD_FR, platformAdminCanOpenLearnerFile } from "@/domain/administration";
import { ROLE_LABELS_FR } from "@/domain/roles";

/**
 * Administration PLATEFORME : supervision seulement.
 * Aucun dossier pédagogique n'est accessible depuis cet espace.
 */
export function PlatformAdminView() {
  const data = useDataAccess();
  const { data: result, isPending } = useQuery({
    queryKey: ["platform-admin"],
    queryFn: async () => {
      const [rows, people, roles, audit] = await Promise.all([
        data.administration.listPlatformSupervision(),
        data.administration.listPeople(),
        data.administration.listAllRoleAssignments(),
        data.audit.listRecentEvents(10),
      ]);
      return { rows, people, roles, audit };
    },
  });

  if (isPending || !result) return <Skeleton className="h-80 w-full" />;

  const administrators = result.roles.filter((r) => r.role === "administrator");

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Administration plateforme"
        level={1}
        action={<MockBadge label="Maquette limitée" />}
        description="Programmes, administrateurs autorisés, paramètres communs et supervision."
      />

      <ScopeNotice>
        Cet espace est distinct de l'administration d'un programme. L'accès aux dossiers
        pédagogiques n'est jamais accordé automatiquement (
        {platformAdminCanOpenLearnerFile() ? "accès" : "aucun accès"} depuis cet écran).
      </ScopeNotice>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Programmes" value={result.rows.length} />
        <StatCard
          label="Apprenants (tous programmes)"
          value={result.rows.reduce((n, r) => n + r.learners, 0)}
        />
        <StatCard label="Rôles administrateur" value={administrators.length} />
      </div>

      <PanelCard title="Programmes et administrateurs autorisés">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Programme</TableHead>
                <TableHead>Administrateurs</TableHead>
                <TableHead className="text-right">Apprenants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.programId}>
                  <TableCell className="font-medium">{row.programLabel}</TableCell>
                  <TableCell>
                    {row.authorizedAdministrators
                      .map((id) => result.people.find((p) => p.id === id)?.fullName ?? id)
                      .join(", ")}
                  </TableCell>
                  <TableCell className="text-right">{row.learners}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PanelCard>

      <PanelCard title="Paramètres communs, quotas et stockage (prévus)">
        <ul className="space-y-2 text-sm">
          {result.rows.map((row) => (
            <li key={row.programId} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{row.programLabel}</span>
              <Badge variant="outline" className="font-normal">
                {row.aiQuotaLabel}
              </Badge>
              <span className="text-muted-foreground">{row.storageLabel}</span>
            </li>
          ))}
          <li className="text-muted-foreground">
            Sauvegardes et conservation : {RETENTION_TBD_FR}. Aucun appel IA réel, aucun stockage
            actif.
          </li>
        </ul>
      </PanelCard>

      <PanelCard title="Rôles de plateforme">
        <ul className="space-y-1 text-sm">
          {administrators.map((r, i) => (
            <li key={`${r.personId}-${i}`} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {result.people.find((p) => p.id === r.personId)?.fullName ?? r.personId}
              </span>
              <Badge variant="outline" className="font-normal">
                {ROLE_LABELS_FR[r.role]}
              </Badge>
              <span className="text-muted-foreground">
                portée : {r.scope.kind === "platform" ? "plateforme" : "programme"}
              </span>
            </li>
          ))}
        </ul>
      </PanelCard>

      <PanelCard title="Audit global simulé">
        <ul className="space-y-1 text-sm text-muted-foreground">
          {result.audit.map((e) => (
            <li key={e.id}>
              {new Date(e.createdAt).toLocaleDateString("fr-FR")} — {e.action}
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  );
}
