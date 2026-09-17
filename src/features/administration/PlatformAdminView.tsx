import { useQuery } from "@tanstack/react-query";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import {
  RETENTION_TBD_FR,
  aiStateLabel,
  platformAdminCanOpenLearnerFile,
} from "@/domain/administration";
import { formatGo } from "@/domain/operatingCost";
import { ROLE_LABELS_FR } from "@/domain/roles";
import {
  COHORT_PHASE_LABELS_FR,
  cohortPhase,
  cohortProgressRatio,
  daysUntil,
  formatFrDate,
  sortCohortsForPilot,
} from "@/features/administration/adminProgramViewModel";

/**
 * Administration PLATEFORME : supervision seulement.
 * Aucun dossier pédagogique n'est accessible depuis cet espace.
 */
export function PlatformAdminView() {
  const data = useDataAccess();
  const { data: result, isPending } = useQuery({
    queryKey: ["platform-admin"],
    queryFn: async () => {
      const [rows, people, roles, audit, programs, cohorts] = await Promise.all([
        data.administration.listPlatformSupervision(),
        data.administration.listPeople(),
        data.administration.listAllRoleAssignments(),
        data.audit.listRecentEvents(200),
        data.programs.listPrograms(),
        data.programs.listCohorts(),
      ]);
      const statsByProgram = await Promise.all(
        programs.map(async (p) => ({
          programId: p.id,
          snapshots: await data.statistics.listCohortStatistics(p.id),
        })),
      );
      return { rows, people, roles, audit, programs, cohorts, statsByProgram };
    },
  });

  if (isPending || !result) return <Skeleton className="h-80 w-full" />;

  const administrators = result.roles.filter((r) => r.role === "administrator");

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Campus Santé Augmenté"
        title="Administration plateforme"
        level={1}
        description="Programmes, administrateurs autorisés, paramètres communs et supervision."
      />

      <ScopeNotice>
        Cet espace est distinct de l'administration d'un programme. L'accès aux dossiers
        pédagogiques n'est jamais accordé automatiquement (
        {platformAdminCanOpenLearnerFile() ? "accès" : "aucun accès"} depuis cet écran).
      </ScopeNotice>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Programmes" value={result.programs.length} />
        <StatCard
          label="Apprenants (tous programmes)"
          value={result.rows.reduce((n, r) => n + r.learners, 0)}
        />
        <StatCard
          label="Promotions ouvertes"
          value={result.cohorts.filter((c) => cohortPhase(c) === "running").length}
          hint={`${result.cohorts.length} promotions au total`}
        />
        <StatCard label="Rôles administrateur" value={administrators.length} />
      </div>

      <SectionHeading
        title="Vue d'ensemble par programme"
        level={2}
        description="Un bloc par programme de la plateforme : promotions, classes, avancement et administrateurs autorisés. Supervision uniquement."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {result.programs.map((program) => {
          const cohorts = sortCohortsForPilot(
            result.cohorts.filter((c) => c.programId === program.id),
          );
          const row = result.rows.find((r) => r.programId === program.id);
          const learners = cohorts.reduce((n, c) => n + c.learnerCount, 0);
          const admins = result.roles
            .filter(
              (r) =>
                r.role === "administrator" &&
                r.scope.kind === "program" &&
                r.scope.programId === program.id,
            )
            .map((r) => result.people.find((p) => p.id === r.personId)?.fullName ?? r.personId);
          const running = cohorts.filter((c) => cohortPhase(c) === "running").length;
          const planned = cohorts.filter((c) => cohortPhase(c) === "planned").length;
          const closed = cohorts.filter((c) => cohortPhase(c) === "closed").length;
          const history = [
            ...(result.statsByProgram.find((s) => s.programId === program.id)?.snapshots ?? []),
          ].sort((a, b) => b.academicYear.localeCompare(a.academicYear));
          const usage = result.audit.filter((e) => e.programId === program.id).slice(0, 6);

          return (
            <PanelCard
              key={program.id}
              title={program.name}
              description={`${program.institution} · ${program.code}`}
              action={
                <Badge variant="outline" className="font-normal">
                  {cohorts.length} promotion(s)
                </Badge>
              }
            >
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="font-normal">
                  {running} en cours
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {planned} à venir
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {closed} terminée(s)
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {learners} apprenants
                </Badge>
              </div>

              {cohorts.length === 0 ? (
                <EmptyState>Aucune promotion programmée pour ce programme.</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {cohorts.map((cohort) => {
                    const phase = cohortPhase(cohort);
                    const percent = Math.round(cohortProgressRatio(cohort) * 100);
                    const remaining = daysUntil(cohort.endsOn);
                    return (
                      <li key={cohort.id} className="rounded-md border border-border px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{cohort.label}</span>
                          <Badge
                            variant={phase === "running" ? "secondary" : "outline"}
                            className="font-normal"
                          >
                            {COHORT_PHASE_LABELS_FR[phase]}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          Année {cohort.academicYear} · {cohort.learnerCount} apprenants ·{" "}
                          {formatFrDate(cohort.startsOn)} → {formatFrDate(cohort.endsOn)}
                        </p>
                        <Progress value={percent} className="mt-2" />
                        <p className="text-muted-foreground mt-1 text-xs">
                          Avancement calendaire {percent} %
                          {phase === "running"
                            ? ` · ${remaining} jour(s) restant(s)`
                            : phase === "planned"
                              ? ` · démarrage dans ${daysUntil(cohort.startsOn)} jour(s)`
                              : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium">Historique des promotions</p>
                {history.length === 0 ? (
                  <EmptyState>Aucun historique disponible pour ce programme.</EmptyState>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Année</TableHead>
                          <TableHead>Promotion</TableHead>
                          <TableHead className="text-right">Apprenants</TableHead>
                          <TableHead className="text-right">Achèvement</TableHead>
                          <TableHead className="text-right">Compétences réelles</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.academicYear}</TableCell>
                            <TableCell>{s.cohortLabel}</TableCell>
                            <TableCell className="text-right">{s.learnerCount}</TableCell>
                            <TableCell className="text-right">
                              {Math.round(s.completionRate * 100)} %
                            </TableCell>
                            <TableCell className="text-right">
                              {Math.round(s.realRate * 100)} %
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="text-muted-foreground text-xs">
                  Agrégats pluriannuels simulés, sans aucune donnée nominative.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Historique d'utilisation</p>
                {usage.length === 0 ? (
                  <EmptyState>Aucun événement enregistré pour ce programme.</EmptyState>
                ) : (
                  <ul className="text-muted-foreground space-y-1 text-xs">
                    {usage.map((e) => (
                      <li key={e.id}>
                        {formatFrDate(e.createdAt)} — {e.action}
                        {e.detail ? ` · ${e.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="text-muted-foreground space-y-1 text-xs">
                <p>
                  Administrateurs autorisés :{" "}
                  {admins.length > 0 ? admins.join(", ") : "aucun rôle attribué"}
                </p>
                {row ? (
                  <p>
                    {aiStateLabel(row.aiEnabled)} · {formatGo(row.storageBytes)} stockés
                  </p>
                ) : null}
                <p>Aucun dossier pédagogique n'est ouvrable depuis cette vue.</p>
              </div>
            </PanelCard>
          );
        })}
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
                {aiStateLabel(row.aiEnabled)}
              </Badge>
              <span className="text-muted-foreground">{formatGo(row.storageBytes)}</span>
            </li>
          ))}
          <li className="text-muted-foreground">
            Sauvegardes et conservation : {RETENTION_TBD_FR}. Le stockage affiché est mesuré ; l'IA
            reste éteinte sur tous les programmes.
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
          {result.audit.slice(0, 10).map((e) => (
            <li key={e.id}>
              {new Date(e.createdAt).toLocaleDateString("fr-FR")} — {e.action}
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  );
}
