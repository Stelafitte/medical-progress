/**
 * Onglet 1 — « Vue d'ensemble » de la plateforme.
 *
 * Santé globale : programmes et leurs états, classes en cours, usage,
 * supports pédagogiques, intervenants et leurs interventions, stockage et IA.
 * Supervision uniquement : aucun dossier pédagogique n'est ouvrable ici.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { EmptyState, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import { RETENTION_TBD_FR } from "@/domain/administration";
import { formatGo } from "@/domain/operatingCost";
import {
  PLATFORM_ROLE_GROUP_LABELS_FR,
  buildPlatformDirectory,
  resolveNonLearnerRecipients,
} from "@/domain/platformDirectory";
import {
  COHORT_PHASE_LABELS_FR,
  cohortPhase,
  cohortProgressRatio,
  formatFrDate,
  sortCohortsForPilot,
} from "@/features/administration/adminProgramViewModel";

export function PlatformOverview() {
  const data = useDataAccess();
  const { data: result, isPending } = useQuery({
    queryKey: ["platform-overview"],
    queryFn: async () => {
      /* 21/09 : ni journal d'audit ni crédits IA ici — les deux n'étaient servis
         que par des données de démonstration. La consommation IA réelle et son
         coût sont dans « Coûts d'exploitation ». */
      const [rows, people, roles, programs, cohorts] = await Promise.all([
        data.administration.listPlatformSupervision(),
        data.administration.listPeople(),
        data.administration.listAllRoleAssignments(),
        data.programs.listPrograms(),
        data.programs.listCohorts(),
      ]);
      const media = await Promise.all(
        programs.map(async (p) => ({
          programId: p.id,
          items: await data.media.listMedia(p.id),
        })),
      );
      return { rows, people, roles, programs, cohorts, media };
    },
  });

  if (isPending || !result) return <Skeleton className="h-80 w-full" />;

  const directory = buildPlatformDirectory(result.people, result.roles);
  const staff = resolveNonLearnerRecipients(directory);
  const runningCohorts = sortCohortsForPilot(
    result.cohorts.filter((c) => cohortPhase(c) === "running"),
  );
  const mediaCount = result.media.reduce((n, m) => n + m.items.length, 0);
  const publishedMedia = result.media.reduce(
    (n, m) => n + m.items.filter((i) => i.status === "published").length,
    0,
  );
  const learners = result.rows.reduce((n, r) => n + r.learners, 0);

  const staffRows = [...staff];

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Campus Santé Augmenté"
        title="Vue d'ensemble de la plateforme"
        level={1}
        description="Programmes, promotions, supports, intervenants et stockage — tous programmes confondus."
      />

      <ScopeNotice>
        Vue de supervision, tous programmes confondus. Pour travailler dans un programme, ouvrez
        l'onglet « Programmes agrégés » ou choisissez-le dans le menu en haut à droite.
      </ScopeNotice>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Programmes" value={result.programs.length} />
        <StatCard label="Apprenants (tous programmes)" value={learners} />
        <StatCard
          label="Promotions ouvertes"
          value={runningCohorts.length}
          hint={`${result.cohorts.length} promotions au total`}
        />
        <StatCard
          label="Supports pédagogiques"
          value={mediaCount}
          hint={`${publishedMedia} publié(s)`}
        />
        <StatCard label="Intervenants" value={staff.length} hint="hors apprenants" />
        <StatCard label="Conservation" value="à définir" hint={RETENTION_TBD_FR} />
      </div>

      <PanelCard
        title="Programmes en cours et états"
        description="Un programme est « actif » dès qu'une promotion est ouverte."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Programme</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>État</TableHead>
                <TableHead className="text-right">Promotions</TableHead>
                <TableHead className="text-right">Apprenants</TableHead>
                <TableHead className="text-right">Supports</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.programs.map((program) => {
                const cohorts = result.cohorts.filter((c) => c.programId === program.id);
                const running = cohorts.filter((c) => cohortPhase(c) === "running").length;
                const items =
                  result.media.find((m) => m.programId === program.id)?.items.length ?? 0;
                return (
                  <TableRow key={program.id}>
                    <TableCell className="font-medium">{program.name}</TableCell>
                    <TableCell className="text-muted-foreground">{program.kind}</TableCell>
                    <TableCell>
                      <Badge
                        variant={running > 0 ? "secondary" : "outline"}
                        className="font-normal"
                      >
                        {running > 0
                          ? `${running} promotion(s) en cours`
                          : "aucune promotion ouverte"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{cohorts.length}</TableCell>
                    <TableCell className="text-right">
                      {cohorts.reduce((n, c) => n + c.learnerCount, 0)}
                    </TableCell>
                    <TableCell className="text-right">{items}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </PanelCard>

      <PanelCard
        title="Classes en cours et avancement"
        description="Promotions ouvertes, tous programmes confondus."
      >
        {runningCohorts.length === 0 ? (
          <EmptyState>Aucune promotion ouverte actuellement.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {runningCohorts.map((cohort) => {
              const program = result.programs.find((p) => p.id === cohort.programId);
              const percent = Math.round(cohortProgressRatio(cohort) * 100);
              return (
                <li key={cohort.id} className="border-border rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{cohort.label}</span>
                    <Badge variant="secondary" className="font-normal">
                      {COHORT_PHASE_LABELS_FR[cohortPhase(cohort)]}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {program?.name ?? cohort.programId} · {cohort.learnerCount} apprenants ·{" "}
                    {formatFrDate(cohort.startsOn)} → {formatFrDate(cohort.endsOn)}
                  </p>
                  <Progress value={percent} className="mt-2" />
                  <p className="text-muted-foreground mt-1 text-xs">
                    Avancement calendaire {percent} %
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          title="Intervenants"
          description="Personnes ayant un rôle hors apprenant, avec leurs rôles."
        >
          {staffRows.length === 0 ? (
            <EmptyState>Aucun intervenant enregistré.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {staffRows.map((row) => (
                <li
                  key={row.personId}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span>
                    <span className="font-medium">{row.fullName}</span>{" "}
                    <span className="text-muted-foreground text-xs">
                      {row.groups.map((g) => PLATFORM_ROLE_GROUP_LABELS_FR[g]).join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard
          title="Stockage par programme"
          description="Volume stocké par programme. La consommation IA réelle et son coût se lisent dans « Coûts d'exploitation »."
        >
          <ul className="space-y-2">
            {result.rows.map((row) => (
              <li key={row.programId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{row.programLabel}</span>
                <span className="text-muted-foreground text-xs">{formatGo(row.storageBytes)}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Sauvegardes et conservation : {RETENTION_TBD_FR}.
          </p>
        </PanelCard>
      </div>

      <PanelCard
        title="Aller plus loin"
        description="Chaque onglet du bandeau ouvre un niveau de détail différent."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/plateforme/programmes">
              Programmes agrégés
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/plateforme/couts">
              Coûts d'exploitation
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/plateforme/pilotage">
              Utilisateurs et réglages
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </PanelCard>
    </div>
  );
}
