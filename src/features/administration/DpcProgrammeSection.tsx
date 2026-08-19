/**
 * Administration du module DPC : grille versionnée, calendrier relatif,
 * participation aux deux tours, conformité agrégée, relances, intervenants.
 * Maquette : aucune écriture, aucune donnée patient, aucun appel IA.
 */
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess, useSession } from "@/application/session";
import { EmptyState, MockBadge, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import {
  DPC_NO_PATIENT_DATA_NOTICE_FR,
  DPC_ROUND_LABELS_FR,
  aggregateRound,
  criterionStats,
  dpcCriterionCount,
  reminderTargets,
  sectionConformity,
} from "@/domain/dpc";

export function DpcProgrammeSection() {
  const data = useDataAccess();
  const { activeProgram } = useSession();

  const { data: scope, isPending } = useQuery({
    queryKey: ["dpc-admin", activeProgram.id],
    queryFn: async () => {
      const [grids, setup, rounds, entries, enrollments, sessions] = await Promise.all([
        data.dpc.listGrids(activeProgram.id),
        data.dpc.getSetup(activeProgram.id),
        data.dpc.listRounds(activeProgram.id),
        data.dpc.listEntries(activeProgram.id),
        data.administration.listAllEnrollments(activeProgram.id),
        data.dpc.listSessions(activeProgram.id),
      ]);
      return { grids, setup, rounds, entries, enrollments, sessions };
    },
  });

  if (isPending || !scope) return <Skeleton className="h-72 w-full" />;

  if (!activeProgram.config.dpcEnabled)
    return (
      <PanelCard
        title="Programme DPC"
        description="Module optionnel"
        action={<MockBadge label="Désactivé" />}
      >
        <EmptyState>
          Le module DPC n'est pas activé pour <strong>{activeProgram.name}</strong>. Il s'active par
          programme dans la configuration, sans dupliquer l'application.
        </EmptyState>
      </PanelCard>
    );

  const grid = scope.grids.find((g) => g.status === "published");
  if (!grid || !scope.setup)
    return <EmptyState>Aucune grille d'audit publiée pour ce programme.</EmptyState>;

  const enrollmentIds = scope.enrollments.map((e) => e.id);
  const aggregates = scope.rounds.map((round) =>
    aggregateRound(grid, round, scope.entries, enrollmentIds.length),
  );
  const t0 = aggregates.find((a) => a.phase === "t0");
  const t1 = aggregates.find((a) => a.phase === "t1");
  const submitted = scope.entries.filter((e) => e.status === "submitted");
  const sections = sectionConformity(grid, submitted);
  const weakest = [...criterionStats(grid, submitted)]
    .sort((a, b) => a.conformityPercent - b.conformityPercent)
    .slice(0, 6);
  const openRound = scope.rounds.find((r) => r.status === "open");
  const toChase = openRound ? reminderTargets(grid, openRound, scope.entries, enrollmentIds) : [];

  return (
    <div className="space-y-6">
      <ScopeNotice>
        Programme intégré DPC : <strong>configuration</strong> du socle, pas une application séparée.{" "}
        {DPC_NO_PATIENT_DATA_NOTICE_FR}
      </ScopeNotice>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Participation audit 1"
          value={`${t0?.participationPercent ?? 0} %`}
          hint={`${t0?.submitted ?? 0}/${enrollmentIds.length} participants`}
        />
        <StatCard
          label="Participation audit 2"
          value={`${t1?.participationPercent ?? 0} %`}
          hint={`${t1?.inProgress ?? 0} en cours · ${t1?.notStarted ?? 0} non démarrés`}
        />
        <StatCard
          label="Conformité moyenne"
          value={`${t0?.meanConformityPercent ?? 0} % → ${t1?.meanConformityPercent ?? 0} %`}
          hint={`Cible ${grid.targetConformityPercent} %`}
        />
        <StatCard
          label="Grille"
          value={grid.version}
          hint={`${dpcCriterionCount(grid)} critères · ${grid.recordsPerRound} dossiers par tour`}
        />
      </div>

      <PanelCard
        title="Grilles et versions"
        description="Une grille publiée est immuable tant qu'un tour l'utilise : la comparaison avant/après reste valide."
        action={<MockBadge />}
      >
        <ul className="space-y-2">
          {scope.grids.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{item.title}</span>
              <Badge variant={item.status === "published" ? "default" : "outline"}>
                {item.version}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {dpcCriterionCount(item)} critères · {item.sections.length} parties
              </span>
            </li>
          ))}
        </ul>
      </PanelCard>

      <PanelCard title="Calendrier relatif du programme" description="J-30 à J0, jour J, J+90.">
        <ol className="space-y-2">
          {scope.setup.timeline.map((step) => (
            <li key={step.key} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{step.window}</Badge>
                <span className="font-medium">{step.description}</span>
              </div>
              <p className="text-muted-foreground text-xs">{step.requirement}</p>
            </li>
          ))}
        </ol>
      </PanelCard>

      <PanelCard title="Tours d'audit" description="Deux tours de la même grille.">
        <ul className="space-y-3">
          {scope.rounds.map((round) => {
            const agg = aggregates.find((a) => a.roundId === round.id);
            return (
              <li key={round.id} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{DPC_ROUND_LABELS_FR[round.phase]}</span>
                  <Badge variant="outline">{round.status}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {round.window} · du {new Date(round.opensOn).toLocaleDateString("fr-FR")} au{" "}
                    {new Date(round.closesOn).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                {agg ? (
                  <>
                    <Progress value={agg.participationPercent} className="h-2" />
                    <p className="text-muted-foreground text-xs">
                      {agg.submitted} transmis · {agg.inProgress} en cours · conformité moyenne{" "}
                      {agg.meanConformityPercent} %
                    </p>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </PanelCard>

      <PanelCard title="Conformité par partie" description="Agrégat de promotion, jamais nominatif.">
        <ul className="space-y-2">
          {sections.map((row) => (
            <li key={row.section.id} className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{row.section.label}</span>
                <span className="text-muted-foreground text-xs">
                  {row.conformity.conformityPercent} %
                </span>
              </div>
              <Progress value={row.conformity.conformityPercent} className="h-2" />
            </li>
          ))}
        </ul>
      </PanelCard>

      <PanelCard
        title="Critères les moins conformes"
        description="Sert à cibler les cas cliniques de la formation présentielle."
      >
        <ul className="space-y-2">
          {weakest.map((row) => (
            <li key={row.criterion.id} className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Badge variant="secondary" className="mr-2 font-mono text-[10px]">
                    {row.criterion.number}
                  </Badge>
                  {row.criterion.label}
                </span>
                <span className="text-muted-foreground text-xs">
                  {row.conformityPercent} % · {row.notApplicable} N/A
                </span>
              </div>
              <Progress value={row.conformityPercent} className="h-2" />
            </li>
          ))}
        </ul>
      </PanelCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          title="Relances du tour ouvert"
          description={`Rappels prévus à J-${scope.setup.reminderDaysBeforeClose.join(", J-")} de la clôture.`}
        >
          {toChase.length === 0 ? (
            <EmptyState>Aucun participant à relancer.</EmptyState>
          ) : (
            <ul className="space-y-1">
              {toChase.map((target) => (
                <li key={target.enrollmentId} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{target.enrollmentId}</span>
                  <Badge variant="outline">{target.status}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {target.percentComplete} % saisi
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard
          title="Intervenants et liens d'intérêt"
          description="Exigence HAS : indépendance des supports et déclaration des liens d'intérêt."
        >
          <ul className="space-y-2">
            {scope.setup.faculty.map((member) => (
              <li key={member.personId}>
                <p className="font-medium">
                  {member.fullName}{" "}
                  <Badge variant={member.interestsDeclared ? "default" : "destructive"}>
                    {member.interestsDeclared ? "liens déclarés" : "à compléter"}
                  </Badge>
                </p>
                <p className="text-muted-foreground text-xs">
                  {member.role} — {member.interestsSummary}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Orientations : {scope.setup.orientations.join(" · ")}
          </p>
        </PanelCard>
      </div>
    </div>
  );
}
