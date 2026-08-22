/**
 * « Structure du programme » — un seul écran, deux temps de travail :
 * Création (le modèle réutilisable) et Pilotage (une cohorte donnée).
 * Le rappel des trois étapes n'apparaît QUE sur cet écran.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { AdminWorkLevelBanner } from "@/features/administration/AdminWorkLevel";
import { StageLogTemplatesSection } from "@/features/administration/StageLogTemplatesSection";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { personNameFor, useProgramAdmin } from "@/features/administration/useProgramAdmin";
import {
  COHORT_PHASE_LABELS_FR,
  buildPilotTimeline,
  cohortPhase,
  defaultPilotCohortId,
  formatFrDate,
  nextMilestone,
} from "@/features/administration/adminProgramViewModel";
import { NATURE_LABELS_FR } from "@/domain/mastery";
import { ROLE_LABELS_FR } from "@/domain/roles";

const STATE_STYLES = {
  done: "border-border text-muted-foreground",
  current: "border-primary bg-primary/5",
  upcoming: "border-border",
} as const;

export function AdminProgramStructure() {
  const { data, isPending } = useProgramAdmin();
  const [cohortId, setCohortId] = useState<string | null>(null);

  const cohorts = data?.cohorts ?? [];
  const selectedId = cohortId ?? defaultPilotCohortId(cohorts);
  const selected = cohorts.find((c) => c.id === selectedId);

  const timeline = useMemo(
    () => buildPilotTimeline(data?.planSchedule ?? [], selected),
    [data?.planSchedule, selected],
  );

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const upcoming = nextMilestone(timeline);
  const cohortEnrollments = data.enrollments.filter((e) => e.cohortId === selectedId);
  const cohortLogs = data.logsReceived.filter((log) =>
    cohortEnrollments.some((e) => e.id === log.enrollmentId),
  );
  const cohortAlerts = data.alerts.filter((alert) =>
    cohortEnrollments.some((e) => e.id === alert.enrollmentId),
  );
  const scopedRoles = data.roleAssignments.filter(
    (r) =>
      r.scope.kind !== "platform" &&
      "programId" in r.scope &&
      r.scope.programId === data.program?.id,
  );
  const byNature = (nature: string) => data.outcomes.filter((o) => o.nature === nature);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Structure du programme"
        level={1}
        action={<MockBadge />}
        description="Créez le programme une fois, puis pilotez chacune de ses cohortes — parallèles ou successives."
      />

      <AdminWorkLevelBanner
        level="program"
        programName={data.program?.name ?? "Programme sélectionné"}
        cohortCount={cohorts.length}
      />

      <Tabs defaultValue="creation" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="creation" className="min-h-11 flex-none text-xs sm:text-sm">
            Création du programme
          </TabsTrigger>
          <TabsTrigger value="pilotage" className="min-h-11 flex-none text-xs sm:text-sm">
            Pilotage d'une cohorte
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------ Création ------------------------------ */}
        <TabsContent value="creation" className="space-y-6">
          <ScopeNotice>
            Cette partie décrit le programme lui-même : identité, versions de référentiel,
            objectifs, chronologie type et carnets. Rien ici n'est daté pour une promotion
            particulière.
          </ScopeNotice>

          <PanelCard
            title={data.program?.name ?? "Programme"}
            description={`${data.program?.institution ?? ""} · ≈ ${data.program?.annualLearnerEstimate ?? 0} apprenants/an`}
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Versions de référentiel" value={data.versions.length} />
              <StatCard label="Objectifs et compétences" value={data.outcomes.length} />
              <StatCard label="Jalons type" value={data.planSchedule.length} />
              <StatCard label="Cohortes rattachées" value={cohorts.length} />
            </div>
          </PanelCard>

          <PanelCard
            title="Versions de référentiel"
            description="Une version encadre les objectifs et les cohortes qui s'y rattachent."
          >
            {data.versions.length === 0 ? (
              <EmptyState>Aucune version de référentiel.</EmptyState>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.versions.map((version) => (
                  <li key={version.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{version.label}</span>
                    <Badge variant="outline" className="font-normal">
                      {version.status}
                    </Badge>
                    <span className="text-muted-foreground">
                      en vigueur depuis {formatFrDate(version.effectiveFrom)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>

          <PanelCard
            title="Objectifs du programme"
            description="Trois natures distinctes : connaissance, compétence simulée, compétence en situation réelle."
          >
            <div className="grid gap-3 md:grid-cols-3">
              {(["knowledge", "simulated_competence", "real_competence"] as const).map((nature) => (
                <div key={nature} className="border-border rounded-md border p-3">
                  <p className="text-sm font-medium">{NATURE_LABELS_FR[nature]}</p>
                  <p className="text-2xl font-semibold">{byNature(nature).length}</p>
                  <p className="text-muted-foreground text-xs">
                    {nature === "knowledge"
                      ? "Détail dans « Base de connaissances »"
                      : "Détail dans « Compétences »"}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <Link to="/espace/administration/connaissances">Base de connaissances</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <Link to="/espace/administration/competences">Compétences</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <Link to="/espace/administration/evaluations">Évaluations</Link>
              </Button>
            </div>
          </PanelCard>

          <PanelCard
            title="Chronologie type du programme"
            description="Jalons réutilisables, indépendants des dates d'une cohorte."
          >
            {data.planSchedule.length === 0 ? (
              <EmptyState>Aucun jalon type défini.</EmptyState>
            ) : (
              <ol className="space-y-2 text-sm">
                {data.planSchedule.map((entry) => (
                  <li
                    key={`${entry.outcomeId}-${entry.dueOn}`}
                    className="border-border flex flex-wrap items-center gap-2 rounded-md border p-3"
                  >
                    <span className="font-medium">{entry.milestoneLabel}</span>
                    {entry.official ? (
                      <Badge variant="secondary" className="font-normal">
                        échéance institutionnelle
                      </Badge>
                    ) : null}
                    <span className="text-muted-foreground">
                      {formatFrDate(entry.startsOn)} → {formatFrDate(entry.dueOn)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </PanelCard>

          <StageLogTemplatesSection />
        </TabsContent>

        {/* ------------------------------ Pilotage ------------------------------ */}
        <TabsContent value="pilotage" className="space-y-6">
          <ScopeNotice>
            Le pilotage porte sur une cohorte précise. Un même programme peut être joué par
            plusieurs cohortes simultanées : changez de cohorte ci-dessous pour changer de
            périmètre.
          </ScopeNotice>

          <CohortSelector
            cohorts={cohorts}
            value={selectedId}
            onChange={setCohortId}
          />

          {!selected ? (
            <EmptyState>Aucune cohorte rattachée à ce programme.</EmptyState>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Inscriptions" value={cohortEnrollments.length} />
                <StatCard label="Carnets reçus" value={cohortLogs.length} />
                <StatCard label="Alertes ouvertes" value={cohortAlerts.length} />
                <StatCard
                  label="Phase"
                  value={COHORT_PHASE_LABELS_FR[cohortPhase(selected)]}
                />
              </div>

              <PanelCard
                title="Chronologie de la cohorte"
                description={
                  upcoming
                    ? `Prochaine échéance : ${upcoming.label} le ${formatFrDate(upcoming.date)}`
                    : "Tous les jalons connus sont passés."
                }
              >
                <ol className="space-y-2 text-sm">
                  {timeline.map((item) => (
                    <li
                      key={item.id}
                      aria-current={item.state === "current" ? "step" : undefined}
                      className={`flex flex-wrap items-center gap-2 rounded-md border p-3 ${STATE_STYLES[item.state]}`}
                    >
                      <span className="font-mono text-xs">{formatFrDate(item.date)}</span>
                      <span className="font-medium">{item.label}</span>
                      <Badge variant="outline" className="bg-background font-normal">
                        {item.origin === "cohort" ? "cohorte" : "programme"}
                      </Badge>
                      {item.detail ? (
                        <span className="text-muted-foreground text-xs">{item.detail}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </PanelCard>

              <PanelCard
                title="Intervenants et rôles sur ce programme"
                description="Rôles contextualisés : aucun rôle global."
              >
                {scopedRoles.length === 0 ? (
                  <EmptyState>Aucun intervenant rattaché.</EmptyState>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {scopedRoles.map((role, index) => (
                      <li
                        key={`${role.personId}-${role.role}-${index}`}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <span className="font-medium">
                          {data.people.find((p) => p.id === role.personId)?.fullName ??
                            role.personId}
                        </span>
                        <Badge variant="outline" className="font-normal">
                          {ROLE_LABELS_FR[role.role]}
                        </Badge>
                        <span className="text-muted-foreground">portée : {role.scope.kind}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </PanelCard>

              <PanelCard
                title="Signaux à traiter"
                description="Retards et absences d'activité de la cohorte pilotée."
              >
                {cohortAlerts.length === 0 ? (
                  <EmptyState>Aucun signal sur cette cohorte.</EmptyState>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {cohortAlerts.map((alert) => (
                      <li key={alert.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{personNameFor(data, alert.enrollmentId)}</span>
                        <span className="text-muted-foreground">{alert.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </PanelCard>

              <PanelCard
                title="Outils de pilotage"
                description="Communications, statistiques et documents restent des écrans dédiés."
              >
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="min-h-11">
                    <Link to="/espace/administration/communications">Communications</Link>
                  </Button>
                  <Button asChild variant="outline" className="min-h-11">
                    <Link to="/espace/statistiques">Statistiques</Link>
                  </Button>
                  <Button asChild variant="outline" className="min-h-11">
                    <Link to="/espace/administration/documents">Documents et certificats</Link>
                  </Button>
                  <Button asChild variant="outline" className="min-h-11">
                    <Link to="/espace/administration/classes">Classes d'apprenants</Link>
                  </Button>
                </div>
              </PanelCard>
            </>
          )}
      </TabsContent>
      </Tabs>
    </div>
  );
}
