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
import { useDataAccess, useSession } from "@/application/session";
import { RETENTION_TBD_FR, platformAdminCanOpenLearnerFile } from "@/domain/administration";
import { ROLE_LABELS_FR } from "@/domain/roles";
import type { ProgramKind } from "@/domain/types";

const PROGRAM_KIND_LABELS: Record<ProgramKind, string> = {
  diu: "Formation diplômante",
  dfasm: "Formation initiale",
  dpc: "Développement professionnel continu",
  other: "Autre programme",
};

/**
 * Administration PLATEFORME : supervision seulement.
 * Aucun dossier pédagogique n'est accessible depuis cet espace.
 */
export function PlatformAdminView() {
  const data = useDataAccess();
  const { programs } = useSession();
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
  const supervisionByProgram = new Map(result.rows.map((row) => [row.programId, row]));
  const learnerTotal = programs.reduce((total, program) => {
    const supervision = supervisionByProgram.get(program.id);
    return total + (supervision?.learners ?? program.annualLearnerEstimate);
  }, 0);

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Direction plateforme"
        level={1}
        action={<MockBadge label="Maquette limitée" />}
        description="Vue d’ensemble de tous les programmes, de leur activité et de leur gouvernance."
      />

      <ScopeNotice>
        Cet espace est distinct de l'administration d'un programme. L'accès aux dossiers
        pédagogiques n'est jamais accordé automatiquement (
        {platformAdminCanOpenLearnerFile() ? "accès" : "aucun accès"} depuis cet écran).
      </ScopeNotice>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Programmes configurés" value={programs.length} />
        <StatCard label="Apprenants (tous programmes)" value={learnerTotal} />
        <StatCard label="Rôles administrateur" value={administrators.length} />
      </div>

      <PanelCard
        title="Tous les programmes"
        description="Vue consolidée de la plateforme, indépendante du programme actif dans les autres espaces."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Programme</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Établissement</TableHead>
                <TableHead>Administrateurs</TableHead>
                <TableHead className="text-right">Apprenants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programs.map((program) => {
                const row = supervisionByProgram.get(program.id);
                const administratorNames = row?.authorizedAdministrators
                  .map((id) => result.people.find((p) => p.id === id)?.fullName ?? id)
                  .join(", ");
                return (
                <TableRow key={program.id}>
                  <TableCell>
                    <span className="block font-medium">{program.name}</span>
                    <span className="text-xs text-muted-foreground">{program.code}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {PROGRAM_KIND_LABELS[program.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{program.institution}</TableCell>
                  <TableCell>
                    {administratorNames || "À attribuer"}
                  </TableCell>
                  <TableCell className="text-right">
                    {row?.learners ?? program.annualLearnerEstimate}
                  </TableCell>
                </TableRow>
                );
              })}
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
