/**
 * « Pilotage de programme » — l'EXPLOITATION d'une promotion précise.
 *
 * Un même programme peut être rejoué par plusieurs promotions, parallèles ou
 * successives : le pilotage se fait donc toujours promotion par promotion.
 * Aucun rappel des trois étapes ici (il reste sur le concepteur).
 */
import { useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Notebook,
  UserRound,
  Users,
} from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { AdminCommunications } from "@/features/administration/AdminCommunications";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { AssessmentModalitySection } from "@/features/administration/AssessmentModalitySection";
import { PlacementSection } from "@/features/administration/PlacementSection";
import { useLocalPlacements } from "@/application/placementDraftStore";
import { mergePlacements } from "@/domain/placementDraft";
import { LearnerTrackingSection } from "@/features/administration/LearnerTrackingSection";
import { personNameFor, useProgramAdmin } from "@/features/administration/useProgramAdmin";
import {
  COHORT_PHASE_LABELS_FR,
  buildPilotTimeline,
  cohortPhase,
  cohortProgressRatio,
  defaultPilotCohortId,
  formatFrDate,
  nextMilestone,
} from "@/features/administration/adminProgramViewModel";
import {
  LEARNER_MARKER_LABELS_FR,
  PROGRAMMING_ACTION_LABELS_FR,
  PROGRAMMING_STATE_LABELS_FR,
  allowedProgrammingActions,
  buildLearnerActivityRows,
  buildSuggestedNotifications,
  nextProgrammingState,
  summarizeGroupActivity,
  type GroupActivitySummary,
  type LearnerActivityRow,
  type ProgrammingState,
} from "@/features/administration/pilotSectionsViewModel";
import { ROLE_LABELS_FR } from "@/domain/roles";
import { buildLearnerCompetenceRows } from "@/features/administration/competenceTrackingViewModel";
import type { LearnerCompetenceRow } from "@/features/administration/competenceTrackingViewModel";
import type { CohortPhase } from "@/features/administration/adminProgramViewModel";

const STATE_STYLES = {
  done: "border-border text-muted-foreground",
  current: "border-primary bg-primary/5",
  upcoming: "border-border",
} as const;

export function AdminProgramPilot() {
  const { data, isPending } = useProgramAdmin();
  const { promotion } = useSearch({ from: "/espace/administration/pilotage" });
  const [cohortId, setCohortId] = useState<string | null>(null);
  const localPlacements = useLocalPlacements(data?.program?.id);

  const cohorts = data?.cohorts ?? [];
  // Priorité : choix explicite de l'utilisateur, puis lien profond venu de « Classes ».
  const selectedId = cohortId ?? promotion ?? defaultPilotCohortId(cohorts);
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
  const progress = selected ? Math.round(cohortProgressRatio(selected) * 100) : 0;

  const learnerRows = buildLearnerActivityRows({
    enrollments: cohortEnrollments,
    people: data.people,
    logs: cohortLogs,
    alerts: cohortAlerts,
    expectedLogsPerLearner: data.templates.length,
  });
  const groupSummary = summarizeGroupActivity(learnerRows);
  /** Suivi NOMINATIF des compétences : il appartient au pilotage, pas au référentiel. */
  const competenceRows = buildLearnerCompetenceRows(cohortEnrollments, data.outcomes).map((row) => ({
    ...row,
    personName: personNameFor(data, row.enrollmentId),
  }));

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Pilotage de programme"
        level={1}
        action={<MockBadge />}
        description="Suivez une promotion en cours : calendrier daté, inscriptions, carnets, alertes et intervenants."
      />

      <ScopeNotice>
        Cet onglet est celui du <strong>suivi</strong> : avancement, retards, relances sur la
        promotion sélectionnée. La composition des classes (inscriptions, imports, archivage) se
        traite dans « Classes d'apprenants », et le modèle pédagogique dans « Concepteur de
        programme ».
      </ScopeNotice>

      <CohortSelector cohorts={cohorts} value={selectedId} onChange={setCohortId} label="Promotion pilotée" />

      {!selected ? (
        <EmptyState>Aucune promotion rattachée à ce programme.</EmptyState>
      ) : (
        <>
          {/* Bandeau d'état de la promotion */}
          <section className="border-border bg-card space-y-3 rounded-lg border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selected.label}</h2>
                <p className="text-muted-foreground text-sm">
                  {formatFrDate(selected.startsOn)} → {formatFrDate(selected.endsOn)}
                </p>
              </div>
              <Badge variant="secondary" className="font-normal">
                {COHORT_PHASE_LABELS_FR[cohortPhase(selected)]}
              </Badge>
            </div>
            <Progress value={progress} />
            <p className="text-muted-foreground text-xs">
              Avancement calendaire {progress} %
              {upcoming
                ? ` · prochaine échéance : ${upcoming.label} le ${formatFrDate(upcoming.date)}`
                : " · tous les jalons connus sont passés"}
            </p>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {[
                { icon: Users, label: "Inscriptions", value: cohortEnrollments.length },
                { icon: Notebook, label: "Carnets reçus", value: cohortLogs.length },
                { icon: AlertTriangle, label: "Alertes ouvertes", value: cohortAlerts.length },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="border-border rounded-md border p-3">
                  <Icon className="text-muted-foreground size-4" aria-hidden />
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                </div>
              ))}
            </dl>
          </section>

          <PanelCard
            title="Calendrier daté de la promotion"
            description="Jalons du modèle repositionnés sur les dates réelles de cette promotion."
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
                    {item.origin === "cohort" ? "promotion" : "programme"}
                  </Badge>
                  {item.detail ? (
                    <span className="text-muted-foreground text-xs">{item.detail}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </PanelCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard
              title="Signaux à traiter"
              description="Retards et absences d'activité sur cette promotion."
            >
              {cohortAlerts.length === 0 ? (
                <EmptyState>Aucun signal sur cette promotion.</EmptyState>
              ) : (
                <ul className="space-y-2 text-sm">
                  {cohortAlerts.map((alert) => (
                    <li
                      key={alert.id}
                      className="border-border flex flex-wrap items-center gap-2 rounded-md border p-3"
                    >
                      <AlertTriangle className="text-muted-foreground size-4" aria-hidden />
                      <span className="font-medium">{personNameFor(data, alert.enrollmentId)}</span>
                      <span className="text-muted-foreground">{alert.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            <PanelCard
              title="Intervenants et rôles"
              description="Rôles contextualisés au programme : aucun rôle global."
            >
              {scopedRoles.length === 0 ? (
                <EmptyState>Aucun intervenant rattaché.</EmptyState>
              ) : (
                <ul className="space-y-2 text-sm">
                  {scopedRoles.map((role, index) => (
                    <li
                      key={`${role.personId}-${role.role}-${index}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <UserRound className="text-muted-foreground size-4" aria-hidden />
                      <span className="font-medium">
                        {data.people.find((p) => p.id === role.personId)?.fullName ?? role.personId}
                      </span>
                      <Badge variant="outline" className="font-normal">
                        {ROLE_LABELS_FR[role.role]}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        portée : {role.scope.kind}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>
          </div>

          {/* Stages : MÊME bloc que l'onglet « Gestion des stages », en mode suivi
              (aucune création de terrain ici, le modèle reste dans l'onglet dédié). */}
          {data.program ? (
            <PlacementSection
              programId={data.program.id}
              programName={data.program.name}
              placements={mergePlacements(data.placements, localPlacements)}
              localPlacements={localPlacements}
              assignments={data.assignments}
              enrollments={data.enrollments}
              people={data.people}
              cohorts={data.cohorts}
              templates={data.templates}
              competencesExpected={Math.max(
                1,
                data.outcomes.filter((outcome) => outcome.nature === "real_competence").length,
              )}
              cohortId={selectedId}
              showCohortSelector={false}
              showCreation={false}
            />
          ) : null}

          {/* Table de suivi croisée : même composant que dans « Classes d'apprenants ». */}
          <LearnerTrackingSection
            data={data}
            cohortId={selectedId}
            showCohortSelector={false}
            description="Bases théoriques, compétences, stage et évaluations pour chaque apprenant de la promotion pilotée. Vue identique à celle de l'onglet « Classes d'apprenants »."
          />

          {/* Évaluation : même bloc que l'onglet « Évaluations ». */}
          {data.program ? (
            <AssessmentModalitySection
              programId={data.program.id}
              cohorts={data.cohorts}
              cohortId={selectedId}
              showCohortSelector={false}
              showCreation={false}
            />
          ) : null}



          <PilotTools
            phase={cohortPhase(selected)}
            rows={learnerRows}
            summary={groupSummary}
            competenceRows={competenceRows}
            activity={{
              milestonesTotal: timeline.length,
              milestonesPassed: timeline.filter((i) => i.state === "done").length,
              progressPercent: progress,
              outcomes: data.outcomes.length,
              resources: data.resources.length,
              evaluations: data.ecosScenarios.length,
              stagePlacements: data.placements.length,
              logbookTemplates: data.templates.length,
              mediaItems: data.media.length,
              versions: data.versions.length,
              nextMilestoneLabel: upcoming
                ? `${upcoming.label} le ${formatFrDate(upcoming.date)}`
                : "tous les jalons connus sont passés",
            }}
          />

        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Programmation (simulée)                                             */
/* ------------------------------------------------------------------ */

const PHASE_TO_PROGRAMMING: Record<CohortPhase, ProgrammingState> = {
  planned: "planned",
  running: "active",
  closed: "closed",
};

function ProgrammingPanel({ phase }: { phase: CohortPhase }) {
  const [state, setState] = useState<ProgrammingState>(PHASE_TO_PROGRAMMING[phase]);
  const [journal, setJournal] = useState<readonly string[]>([]);

  const apply = (action: keyof typeof PROGRAMMING_ACTION_LABELS_FR) => {
    const next = nextProgrammingState(state, action);
    if (!next) return;
    setState(next);
    setJournal((entries) => [
      `${PROGRAMMING_ACTION_LABELS_FR[action]} → ${PROGRAMMING_STATE_LABELS_FR[next]}`,
      ...entries,
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">État de la programmation</span>
        <Badge variant="secondary" className="font-normal">
          {PROGRAMMING_STATE_LABELS_FR[state]}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {allowedProgrammingActions(state).map((action) => (
          <Button
            key={action}
            variant="outline"
            className="min-h-11"
            onClick={() => apply(action)}
          >
            {PROGRAMMING_ACTION_LABELS_FR[action]}
          </Button>
        ))}
      </div>

      <div className="border-border grid gap-2 rounded-md border p-3 sm:grid-cols-2">
        <Button variant="outline" className="min-h-11 justify-start" disabled>
          Modifier le calendrier (prévu)
        </Button>
        <Button variant="outline" className="min-h-11 justify-start" disabled>
          Message d'urgence à la promotion (prévu)
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        Aucune action réelle : les changements d'état restent locaux à cette maquette.
      </p>

      {journal.length > 0 ? (
        <ul className="text-muted-foreground space-y-1 text-xs">
          {journal.map((entry, index) => (
            <li key={`${entry}-${index}`}>· {entry}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Activité DU PROGRAMME (jamais des apprenants)                       */
/* ------------------------------------------------------------------ */

function MarkerBadge({ row }: { row: LearnerActivityRow }) {
  return (
    <Badge variant="outline" className="font-normal">
      {LEARNER_MARKER_LABELS_FR[row.marker]}
    </Badge>
  );
}

function GroupStats({ summary }: { summary: GroupActivitySummary }) {
  const stats = [
    { label: "Apprenants", value: summary.learners },
    { label: "Avancement moyen", value: `${summary.averageProgressPercent} %` },
    { label: "Carnets moyens", value: summary.averageLogs },
    { label: "Observations moyennes", value: summary.averageEntries },
    { label: "Sans activité", value: summary.idleLearners },
    { label: "En retard", value: summary.lateLearners },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="border-border rounded-md border p-3">
          <dd className="text-xl font-semibold tabular-nums">{stat.value}</dd>
          <dt className="text-muted-foreground text-xs">{stat.label}</dt>
        </div>
      ))}
    </dl>
  );
}

export interface ProgramActivity {
  readonly milestonesTotal: number;
  readonly milestonesPassed: number;
  readonly progressPercent: number;
  readonly outcomes: number;
  readonly resources: number;
  readonly evaluations: number;
  readonly stagePlacements: number;
  readonly logbookTemplates: number;
  readonly mediaItems: number;
  readonly versions: number;
  readonly nextMilestoneLabel: string;
}

/** Actions portant sur le PROGRAMME : aucune action apprenant ici. */
const PROGRAM_ACTIONS: readonly { readonly label: string; readonly to: string }[] = [
  { label: "Calendrier et jalons", to: "/espace/administration/concepteur" },
  { label: "Contenus et connaissances", to: "/espace/administration/connaissances" },
  { label: "Compétences visées", to: "/espace/administration/competences" },
  { label: "Évaluations du programme", to: "/espace/administration/evaluations" },
  { label: "Gestion des stages", to: "/espace/administration/stages" },
  { label: "Documents et certificats", to: "/espace/administration/documents" },
  { label: "Administration et sécurité", to: "/espace/administration/securite" },
  { label: "Vue d'ensemble du programme", to: "/espace/administration" },
];

function ActivityPanel({ activity }: { activity: ProgramActivity }) {
  const stats = [
    { label: "Avancement calendaire", value: `${activity.progressPercent} %` },
    {
      label: "Jalons franchis",
      value: `${activity.milestonesPassed}/${activity.milestonesTotal}`,
    },
    { label: "Versions du programme", value: activity.versions },
    { label: "Compétences et connaissances visées", value: activity.outcomes },
    { label: "Ressources publiées", value: activity.resources },
    { label: "Évaluations configurées", value: activity.evaluations },
    { label: "Terrains de stage ouverts", value: activity.stagePlacements },
    { label: "Modèles de carnet actifs", value: activity.logbookTemplates },
    { label: "Médias de la médiathèque", value: activity.mediaItems },
  ];

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        Cet outil ne porte que sur le programme lui-même : dispositif, contenus, jalons et
        ouvertures. L'activité des apprenants est dans « Gestion des apprenants ».
      </p>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="border-border rounded-md border p-3">
            <dd className="text-xl font-semibold tabular-nums">{stat.value}</dd>
            <dt className="text-muted-foreground text-xs">{stat.label}</dt>
          </div>
        ))}
      </dl>

      <p className="text-muted-foreground text-sm">
        Prochaine étape du programme : {activity.nextMilestoneLabel}
      </p>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Actions sur le programme</h4>
        <div className="flex flex-wrap gap-2">
          {PROGRAM_ACTIONS.map((action) => (
            <Button key={action.to} asChild variant="outline" size="sm" className="min-h-11">
              <Link to={action.to}>
                {action.label}
                <ArrowRight className="ms-1 size-4" aria-hidden />
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Gestion des apprenants et notifications                             */
/* ------------------------------------------------------------------ */

function LearnerManagementPanel({
  rows,
  summary,
  competenceRows,
}: {
  rows: readonly LearnerActivityRow[];
  summary: GroupActivitySummary;
  competenceRows: readonly (LearnerCompetenceRow & { readonly personName: string })[];
}) {
  const notifications = buildSuggestedNotifications(rows);
  if (rows.length === 0) return <EmptyState>Aucune inscription sur cette promotion.</EmptyState>;
  return (
    <div className="space-y-5">
      {/* Frontière b : ici on suit, on ne compose pas. Toute action d'inscription part vers Classes. */}
      <div className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
        <p className="text-muted-foreground text-xs">
          Liste en lecture seule : inscrire, retirer, importer ou archiver un apprenant se fait dans
          « Classes d'apprenants ».
        </p>
        <Button asChild variant="outline" size="sm" className="min-h-11">
          <Link to="/espace/administration/classes">
            Modifier les inscriptions
            <ArrowRight className="ms-1 size-4" aria-hidden />
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Activité des apprenants</h3>
        <GroupStats summary={summary} />
        <ul className="space-y-2 text-sm">
          {rows.map((row) => (
            <li
              key={`activity-${row.enrollmentId}`}
              className="border-border flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-3"
            >
              <span className="font-medium">{row.personName}</span>
              <MarkerBadge row={row} />
              <span className="text-muted-foreground text-xs">
                {row.logCount} carnet(s) · {row.entryCount} observation(s) · {row.validatedCount}{" "}
                validé(s)
              </span>
              {row.lastActivityAt ? (
                <span className="text-muted-foreground font-mono text-xs">
                  dernier dépôt {formatFrDate(row.lastActivityAt)}
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">aucun dépôt</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Marqueurs d'avancement</h3>

        <ul className="space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.enrollmentId} className="border-border space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.personName}</span>
                <MarkerBadge row={row} />
                <span className="text-muted-foreground text-xs">
                  inscription : {row.status}
                </span>
                {row.alertCount > 0 ? (
                  <span className="text-muted-foreground text-xs">
                    {row.alertCount} signal(s) ouvert(s)
                  </span>
                ) : null}
              </div>
              <Progress value={row.progressPercent} />
              <p className="text-muted-foreground text-xs">
                Avancement {row.progressPercent} % · {row.awaitingCount} en attente de validation
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* Suivi NOMINATIF des compétences : déplacé ici depuis l'onglet Compétences,
          qui ne porte plus que le référentiel et sa couverture. */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Acquisition des compétences, apprenant par apprenant</h3>
        <p className="text-muted-foreground text-xs">
          Une compétence en situation réelle n'est comptée acquise qu'après validation par un tiers
          habilité. Le référentiel lui-même se règle dans l'onglet « Compétences ».
        </p>
        {competenceRows.length === 0 ? (
          <EmptyState>Aucune compétence à suivre sur cette promotion.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {competenceRows.map((row) => (
              <li
                key={`competence-${row.enrollmentId}`}
                className="border-border space-y-2 rounded-md border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.personName}</span>
                  <Badge variant="secondary" className="font-normal">
                    {row.validated} validée(s)
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    {row.declared} en attente de validation
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    {row.notStarted} non commencée(s)
                  </Badge>
                </div>
                <Progress value={row.percent} />
                <p className="text-muted-foreground text-xs">
                  {row.percent} % des {row.total} compétence(s) du référentiel
                </p>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="outline" size="sm" className="min-h-11">
          <Link to="/espace/administration/competences">
            Référentiel et couverture des compétences
            <ArrowRight className="ms-1 size-4" aria-hidden />
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Synthèse de groupe</h3>
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(summary.markerCounts).map(([marker, count]) => (
            <Badge key={marker} variant="secondary" className="font-normal">
              {LEARNER_MARKER_LABELS_FR[marker as LearnerActivityRow["marker"]]} : {count}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Notifications</h3>
        <p className="text-muted-foreground text-xs">
          Actions qui découlent des marqueurs d'avancement. Aucun envoi réel dans cette maquette.
        </p>
        {notifications.length === 0 ? (
          <EmptyState>Aucune notification déclenchée par les marqueurs actuels.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className="border-border space-y-2 rounded-md border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Bell className="text-muted-foreground size-4" aria-hidden />
                  <span className="font-medium">{notification.label}</span>
                  <Badge variant="outline" className="font-normal">
                    {notification.recipients.length} destinataire(s)
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">{notification.rationale}</p>
                <p className="text-muted-foreground text-xs">
                  {notification.recipients.join(", ")}
                </p>
                <Button variant="outline" className="min-h-11" disabled>
                  Préparer la notification (simulé)
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-border space-y-2 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Outil de communication complet</h3>
        <p className="text-muted-foreground text-xs">
          L'intégralité de l'outil de communication est disponible ici, sans quitter la gestion des
          apprenants. La même page existe en plein écran pour un travail de rédaction long.
        </p>
        <Button asChild variant="outline" size="sm" className="min-h-11">
          <Link to="/espace/administration/communications">
            Ouvrir en plein écran
            <ArrowRight className="ms-1 size-4" aria-hidden />
          </Link>
        </Button>
        <AdminCommunications />
      </div>

    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Outils de pilotage : boutons en tête, contenu déplié en dessous      */
/* ------------------------------------------------------------------ */

type ToolKey = "programmation" | "activite" | "apprenants" | "documents";

const TOOLS: readonly {
  readonly key: ToolKey;
  readonly label: string;
  readonly icon: typeof CalendarClock;
  readonly hint: string;
}[] = [
  {
    key: "programmation",
    label: "Programmation",
    icon: CalendarClock,
    hint: "Activation, pause, fin, modification, urgence — pour le programme en cours.",
  },
  {
    key: "activite",
    label: "Activité du programme",
    icon: Activity,
    hint: "Dispositif, contenus, jalons et ouvertures du programme — hors apprenants.",
  },
  {
    key: "apprenants",
    label: "Gestion des apprenants",
    icon: Users,
    hint: "Activité des apprenants, marqueurs, notifications et outil de communication complet.",
  },

  {
    key: "documents",
    label: "Documents et certificats",
    icon: FileCheck,
    hint: "Pièces administratives et certificats de complétude.",
  },
];

function PilotTools({
  phase,
  rows,
  summary,
  activity,
  competenceRows,
}: {
  phase: CohortPhase;
  rows: readonly LearnerActivityRow[];
  summary: GroupActivitySummary;
  activity: ProgramActivity;
  competenceRows: readonly (LearnerCompetenceRow & { readonly personName: string })[];
}) {
  const [open, setOpen] = useState<readonly ToolKey[]>([]);
  const toggle = (key: ToolKey) =>
    setOpen((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));

  const badgeFor = (key: ToolKey): string | null => {
    if (key === "activite")
      return `${activity.milestonesPassed}/${activity.milestonesTotal} jalons`;
    if (key === "apprenants")
      return `${summary.lateLearners + summary.idleLearners} à traiter`;
    if (key === "programmation") return PROGRAMMING_STATE_LABELS_FR[PHASE_TO_PROGRAMMING[phase]];
    return null;
  };


  return (
    <PanelCard
      title="Outils de pilotage"
      description="Chaque outil se déplie directement dans la liste, sans quitter la promotion pilotée."
      action={<MockBadge />}
    >
      <div className="divide-border border-border divide-y rounded-lg border">
        {TOOLS.map((tool) => {
          const isOpen = open.includes(tool.key);
          const badge = badgeFor(tool.key);
          return (
            <section key={tool.key} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <tool.icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                  <div>
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {tool.label}
                      {badge ? (
                        <span className="rounded-full border px-2 py-0.5 text-xs font-normal">
                          {badge}
                        </span>
                      ) : null}
                    </h3>
                    <p className="text-muted-foreground text-xs">{tool.hint}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-9"
                  aria-expanded={isOpen}
                  aria-controls={`pilot-tool-${tool.key}`}
                  onClick={() => toggle(tool.key)}
                >
                  {isOpen ? "Replier" : "Déplier"}
                  {isOpen ? (
                    <ChevronUp className="ms-1 size-4" aria-hidden />
                  ) : (
                    <ChevronDown className="ms-1 size-4" aria-hidden />
                  )}
                </Button>
              </div>
              {isOpen ? (
                <div id={`pilot-tool-${tool.key}`} className="mt-3 space-y-3">
                  {tool.key === "programmation" ? <ProgrammingPanel phase={phase} /> : null}
                  {tool.key === "activite" ? <ActivityPanel activity={activity} /> : null}
                  {tool.key === "apprenants" ? (
                    <LearnerManagementPanel
                      rows={rows}
                      summary={summary}
                      competenceRows={competenceRows}
                    />
                  ) : null}
                  {tool.key === "documents" ? <DocumentsPanel /> : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </PanelCard>
  );
}

function DocumentsPanel() {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Pièces administratives et certificats de complétude de ce programme.
      </p>
      <Button asChild variant="outline" className="min-h-11">
        <Link to="/espace/administration/documents">
          Ouvrir documents et certificats
          <ArrowRight className="ms-1 size-4" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
