/**
 * Onglet 2 — « Programmes agrégés ».
 *
 * Un bloc détaillé par programme de la plateforme. Deux chemins explicites pour
 * ouvrir un programme complet : cliquer sur son bloc, ou utiliser le menu
 * déroulant « Tous les programmes » en haut à droite.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useDataAccess, useSession } from "@/application/session";
import { RETENTION_TBD_FR } from "@/domain/administration";
import {
  COHORT_PHASE_LABELS_FR,
  cohortPhase,
  cohortProgressRatio,
  daysUntil,
  formatFrDate,
  sortCohortsForPilot,
} from "@/features/administration/adminProgramViewModel";
import type { ProgramId } from "@/domain/types";

export function PlatformProgramsView() {
  const data = useDataAccess();
  const { setActiveProgramId } = useSession();
  const navigate = useNavigate();

  const { data: result, isPending } = useQuery({
    queryKey: ["platform-programs"],
    queryFn: async () => {
      const [rows, people, roles, audit, programs, cohorts] = await Promise.all([
        data.administration.listPlatformSupervision(),
        data.administration.listPeople(),
        data.administration.listAllRoleAssignments(),
        data.audit.listRecentEvents(200),
        data.programs.listPrograms(),
        data.programs.listCohorts(),
      ]);
      const detail = await Promise.all(
        programs.map(async (p) => ({
          programId: p.id,
          snapshots: await data.statistics.listCohortStatistics(p.id),
          media: await data.media.listMedia(p.id),
          placements: await data.placements.listPlacements(p.id),
          entries: await data.aiCredits.listEntries(p.id),
          budget: await data.aiCredits.getBudget(p.id),
          versions: await data.programs.listCurriculumVersions(p.id),
        })),
      );
      return { rows, people, roles, audit, programs, cohorts, detail };
    },
  });

  if (isPending || !result) return <Skeleton className="h-80 w-full" />;

  const openProgram = (programId: ProgramId) => {
    setActiveProgramId(programId);
    void navigate({ to: "/espace/administration" });
  };

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Programmes agrégés"
        level={1}
        action={<MockBadge label="Maquette limitée" />}
        description="Tous les programmes de la plateforme, agrégés bloc par bloc : promotions, supports, terrains de stage, crédits IA et administrateurs autorisés."
      />

      <ScopeNotice>
        Cette page reste une lecture agrégée. Pour voir un programme complet, cliquez sur son bloc
        ci-dessous, ou sélectionnez-le dans le menu déroulant en haut à droite (« Tous les
        programmes » ramène ici).
      </ScopeNotice>

      <div className="grid gap-4 xl:grid-cols-2">
        {result.programs.map((program) => {
          const cohorts = sortCohortsForPilot(
            result.cohorts.filter((c) => c.programId === program.id),
          );
          const row = result.rows.find((r) => r.programId === program.id);
          const detail = result.detail.find((d) => d.programId === program.id);
          const learners = cohorts.reduce((n, c) => n + c.learnerCount, 0);
          const admins = result.roles
            .filter(
              (r) =>
                r.role === "administrator" &&
                r.scope.kind === "program" &&
                r.scope.programId === program.id,
            )
            .map((r) => result.people.find((p) => p.id === r.personId)?.fullName ?? r.personId);
          const teachers = result.roles.filter(
            (r) =>
              r.role === "teacher" && "programId" in r.scope && r.scope.programId === program.id,
          ).length;
          const supervisors = result.roles.filter(
            (r) =>
              r.role === "placement_supervisor" &&
              "programId" in r.scope &&
              r.scope.programId === program.id,
          ).length;
          const running = cohorts.filter((c) => cohortPhase(c) === "running").length;
          const planned = cohorts.filter((c) => cohortPhase(c) === "planned").length;
          const closed = cohorts.filter((c) => cohortPhase(c) === "closed").length;
          const history = [...(detail?.snapshots ?? [])].sort((a, b) =>
            b.academicYear.localeCompare(a.academicYear),
          );
          const usage = result.audit.filter((e) => e.programId === program.id).slice(0, 6);
          const media = detail?.media ?? [];
          const published = media.filter((m) => m.status === "published").length;
          const needsReview = media.filter((m) => m.needsReview).length;
          const consumed = (detail?.entries ?? []).reduce((s, e) => s + e.credits, 0);
          const allocated = detail?.budget?.allocatedCredits ?? 0;
          const activeVersion = detail?.versions.find((v) => v.status === "active");

          return (
            <PanelCard
              key={program.id}
              title={program.name}
              description={`${program.institution} · ${program.code} · ${program.kind}`}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => openProgram(program.id)}
                >
                  Ouvrir ce programme
                  <ArrowRight className="ms-1 size-4" aria-hidden />
                </Button>
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
                <Badge variant="outline" className="font-normal">
                  {media.length} support(s) · {published} publié(s)
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {detail?.placements.length ?? 0} terrain(s)
                </Badge>
              </div>

              <div className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-2">
                <p>Version active : {activeVersion?.label ?? "aucune version active"}</p>
                <p>
                  Encadrement : {teachers} enseignant(s) · {supervisors} responsable(s) de stage
                </p>
                <p>
                  Crédits IA : {consumed} / {allocated || "—"} (simulé)
                </p>
                <p>Supports à réviser : {needsReview}</p>
              </div>

              {cohorts.length === 0 ? (
                <EmptyState>Aucune promotion programmée pour ce programme.</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {cohorts.map((cohort) => {
                    const phase = cohortPhase(cohort);
                    const percent = Math.round(cohortProgressRatio(cohort) * 100);
                    return (
                      <li key={cohort.id} className="border-border rounded-md border px-3 py-2">
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
                            ? ` · ${daysUntil(cohort.endsOn)} jour(s) restant(s)`
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
                    {row.aiQuotaLabel} · {row.storageLabel} · conservation : {RETENTION_TBD_FR}
                  </p>
                ) : null}
                <p>Aucun dossier pédagogique n'est ouvrable depuis cette vue agrégée.</p>
              </div>
            </PanelCard>
          );
        })}
      </div>
    </div>
  );
}
