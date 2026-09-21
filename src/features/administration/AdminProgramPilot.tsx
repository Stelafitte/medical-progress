/**
 * « Pilotage de programme » — l'EXPLOITATION d'une promotion précise.
 *
 * Un même programme peut être rejoué par plusieurs promotions, parallèles ou
 * successives : le pilotage se fait donc toujours promotion par promotion.
 * Aucun rappel des trois étapes ici (il reste sur le concepteur).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearch } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  Send,
  ChevronDown,
  ChevronUp,
  History,
} from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { CohortInterruptionPanel } from "@/features/administration/CohortInterruptionPanel";
import { IncidentsPanel } from "@/features/administration/IncidentsPanel";
import { CalendarShiftPanel } from "@/features/administration/CalendarShiftPanel";
import { PilotJournalPanel } from "@/features/administration/PilotJournalPanel";
import { RelancePanel } from "@/features/administration/RelancePanel";
import { cleIncidents } from "@/features/administration/cohortInterruptionQuery";
import { incidentsOuverts as ouverts, type ProgramIncident } from "@/domain/pilotDecision";
import { cleInterruptions } from "@/features/administration/cohortInterruptionQuery";
import {
  INTERRUPTION_STATE_LABELS_FR,
  interruptionEnCours,
  type CohortInterruption,
} from "@/domain/cohortInterruption";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { AssessmentModalitySection } from "@/features/administration/AssessmentModalitySection";
import { LearnerTrackingSection } from "@/features/administration/LearnerTrackingSection";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { useDataAccess } from "@/application/session";
import { setCohortFocus, useCohortFocus } from "@/application/cohortFocusStore";
import { useQuery } from "@tanstack/react-query";
import { AdminChargement } from "@/features/administration/AdminChargement";
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
  buildLearnerActivityRows,
  summarizeGroupActivity,
  type GroupActivitySummary,
  type LearnerActivityRow,
} from "@/features/administration/pilotSectionsViewModel";
import type { PilotTimelineItem } from "@/features/administration/adminProgramViewModel";
import type { CohortId, Placement } from "@/domain/types";

const STATE_STYLES = {
  done: "border-border text-muted-foreground",
  current: "border-primary bg-primary/5",
  upcoming: "border-border",
} as const;

export function AdminProgramPilot() {
  const { data, isPending, error, refetch } = useProgramAdmin();
  const dataAccess = useDataAccess();
  const { promotion } = useSearch({ from: "/espace/administration/pilotage" });
  /*
   * LA PROMOTION EST CHOISIE UNE FOIS, PAS UNE FOIS PAR ONGLET (17/09).
   * Chaque écran gardait son propre `useState` : on choisissait une promotion
   * dans Évaluations, et le Pilotage l'ignorait. Sept écrans, sept vérités.
   */
  const cohortId = useCohortFocus();

  const cohorts = data?.cohorts ?? [];
  // Priorité : choix explicite de l'utilisateur, puis lien profond venu de « Classes ».
  const selectedId = cohortId ?? promotion ?? defaultPilotCohortId(cohorts);

  /*
   * UN LIEN PROFOND VENU DE « CLASSES » DÉSIGNE UNE PROMOTION PRÉCISE : il doit
   * gagner sur le choix courant, ET le remplacer — sinon on piloterait celle du
   * lien tout en montrant l'autre dans les onglets voisins.
   */
  useEffect(() => {
    if (promotion && promotion !== cohortId) setCohortFocus(promotion);
  }, [promotion, cohortId]);
  const selected = cohorts.find((c) => c.id === selectedId);

  /*
   * L'ÉTAT RÉEL DE LA PROMOTION, LU EN BASE. L'ancien panneau le déduisait des
   * dates ; il ne pouvait donc pas savoir qu'une promotion était en pause.
   */
  const interruptions = useQuery({
    queryKey: cleInterruptions(selectedId ?? "aucune"),
    enabled: Boolean(selectedId),
    queryFn: () => dataAccess.programs.listCohortInterruptions(selectedId as CohortId),
  });

  const incidents = useQuery({
    queryKey: cleIncidents(selectedId ?? "aucune"),
    enabled: Boolean(selectedId),
    queryFn: () => dataAccess.programs.listIncidents(selectedId as CohortId),
  });

  const timeline = useMemo(
    () => buildPilotTimeline(data?.planSchedule ?? [], selected),
    [data?.planSchedule, selected],
  );

  if (isPending || !data) return <AdminChargement error={error} />;

  const upcoming = nextMilestone(timeline);
  const cohortEnrollments = data.enrollments.filter((e) => e.cohortId === selectedId);
  const cohortLogs = data.logsReceived.filter((log) =>
    cohortEnrollments.some((e) => e.id === log.enrollmentId),
  );
  const cohortAlerts = data.alerts.filter((alert) =>
    cohortEnrollments.some((e) => e.id === alert.enrollmentId),
  );
  const progress = selected ? Math.round(cohortProgressRatio(selected) * 100) : 0;
  /*
   * LA SEMAINE OU EN EST LA PROMOTION — meme calcul que partout ailleurs dans
   * le produit (floor(jours / 7) depuis le debut). Elle sert de defaut au
   * decalage : ce qui precede a ete tenu, le decaler reecrirait le passe.
   */
  const semainesEcoulees = selected
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - Date.parse(`${selected.startsOn.slice(0, 10)}T00:00:00Z`)) / 604_800_000,
        ),
      )
    : 0;

  const learnerRows = buildLearnerActivityRows({
    enrollments: cohortEnrollments,
    people: data.people,
    logs: cohortLogs,
    alerts: cohortAlerts,
    expectedLogsPerLearner: data.templates.length,
  });
  const groupSummary = summarizeGroupActivity(learnerRows);
  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={data.program?.name ?? "Programme"}
        title="Pilotage de programme"
        level={1}
        description="Où en est la promotion, qui décroche, et les gestes pour agir."
      />

      {/*
        LE MÉNAGE DU 21/09 (Stef : « trois listes des mêmes étudiants »).
        La page montrait les mêmes étudiants dans « Apprenants de la promotion »,
        « Suivi des stages », « Suivi de la promotion », puis encore trois fois
        dans « Gestion des apprenants » (activité, marqueurs, compétences). Il
        n'en reste qu'UNE : la matrice, qui porte désormais aussi le carnet de
        stage réel et le rattachement au groupe. Sont partis, parce qu'ils ont
        leur onglet : terrains et groupes (Gestion des stages), intervenants
        (Équipe d'encadrement), consultation des évaluations (l'atelier en
        écriture reste dans les outils), chiffres du programme (Vue d'ensemble),
        lien vers les documents (barre de navigation), notifications simulées.
      */}
      <ScopeNotice>
        On suit et on agit sur la promotion choisie. Les inscriptions se gèrent dans « Classes
        d'apprenants », les terrains et groupes d'encadrement dans « Gestion des stages », le
        référentiel dans « Concepteur de programme ».
      </ScopeNotice>

      <CohortSelector
        cohorts={cohorts}
        value={selectedId}
        onChange={setCohortFocus}
        label="Promotion pilotée"
        details={false}
      />

      {!selected ? (
        <EmptyState>Aucune promotion rattachée à ce programme.</EmptyState>
      ) : (
        <>
          {/* 1. Où en est la promotion */}
          <section className="border-border bg-card space-y-3 rounded-lg border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selected.label}</h2>
                <p className="text-muted-foreground text-sm">
                  {formatFrDate(selected.startsOn)} → {formatFrDate(selected.endsOn)} ·{" "}
                  {cohortEnrollments.length} inscrit(s)
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
          </section>

          {/* 2. Qui décroche : LA liste des étudiants, une seule. */}
          <LearnerTrackingSection
            data={data}
            cohortId={selectedId}
            showCohortSelector={false}
            description="Une ligne par étudiant : connexion, bases théoriques, compétences, stage, évaluations, carnet de stage réel et signaux. Triez par retard pour voir d'abord qui décroche."
          />

          {/* 3. Agir */}
          <PilotTools
            cohortId={selected.id}
            cohortLabel={selected.label}
            interruption={interruptionEnCours(interruptions.data ?? [])}
            incidentsOuverts={ouverts(incidents.data ?? [])}
            placements={data.placements}
            jalons={timeline}
            finActuelle={selected.endsOn}
            semainesEcoulees={semainesEcoulees}
            onChanged={() => {
              void refetch();
              void incidents.refetch();
            }}
            rows={learnerRows}
            summary={groupSummary}
            atelier={
              !data.program ? null : (
                <AssessmentModalitySection
                  programId={data.program.id}
                  modalities={data.assessmentModalities}
                  sessions={data.assessmentSessions}
                  links={data.cohortAssessmentLinks}
                  cohorts={data.cohorts}
                  banques={data.questionBanks}
                  themes={data.outcomeThemes}
                  cohortFilter={selectedId}
                  editable
                  onChanged={() => void refetch()}
                />
              )
            }
            relance={
              !data.program ? null : (
                <RelancePanel
                  programId={data.program.id}
                  cohortLabel={selected.label}
                  rows={learnerRows}
                  personIdPour={(enrollmentId) =>
                    data.enrollments.find((e) => e.id === enrollmentId)?.personId
                  }
                />
              )
            }
          />

          {/* 4. Le calendrier, replié : on l'ouvre quand on en a besoin. */}
          <PanelCard
            title="Calendrier daté de la promotion"
            description="Jalons du modèle repositionnés sur les dates réelles de cette promotion."
            collapsible
            action={
              <Badge variant="outline" className="font-normal">
                {timeline.length} jalon(s)
              </Badge>
            }
          >
            <ol className="space-y-2 text-sm">
              {timeline.map((item) => (
                <li
                  key={item.id}
                  aria-current={item.state === "current" ? "step" : undefined}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border p-4 ${STATE_STYLES[item.state]}`}
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
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Programmation                                                      */
/* ------------------------------------------------------------------ */

/*
  CE QUE CE FICHIER PORTAIT ICI, ET POURQUOI C'EST PARTI (Stef, 16/09 : « quand
  on parle de Pilotage, on est censé agir… ici rien à faire on dirait »).

  `ProgrammingPanel` tenait une machine à états correcte — activer, pause,
  reprendre, terminer, réouvrir — dans un `useState`. On cliquait, la pastille
  changeait, on rechargeait, tout était revenu. Son état de départ n'était même
  pas lu en base : il était déduit des DATES de la promotion. Le pied du
  panneau l'avouait : « les changements d'état restent locaux ».

  Il est remplacé par `CohortInterruptionPanel`, qui écrit réellement par
  `pause_cohort` / `resume_cohort`, et dont les effets sont tenus par un trigger
  de base — pas par l'écran.
*/

/* ------------------------------------------------------------------ */
/* Outils de pilotage : boutons en tête, contenu déplié en dessous      */
/* ------------------------------------------------------------------ */

type ToolKey = "incidents" | "programmation" | "relance" | "parcours" | "journal";

const TOOLS: readonly {
  readonly key: ToolKey;
  readonly label: string;
  readonly icon: typeof CalendarClock;
  readonly hint: string;
}[] = [
  /*
    L'INCIDENT PASSE EN TETE, ET CE N'EST PAS DECORATIF. On ne pilote pas en
    parcourant un tableau de commandes : on part de ce qui ne va pas, et les
    gestes correctifs se proposent depuis lui (Stef, 16/09 : « il faut imaginer
    ce qui se passe en cas de probleme »).
  */
  {
    key: "incidents",
    label: "En cas de problème",
    icon: AlertTriangle,
    hint: "Déclarer ce qui s'est passé, puis prendre les gestes que cela appelle.",
  },
  {
    key: "relance",
    label: "Relancer des étudiants",
    icon: Send,
    hint: "Écrire aux étudiants en retard ou sans activité, repérés dans le tableau ci-dessus.",
  },
  {
    key: "programmation",
    label: "Interrompre ou décaler",
    icon: CalendarClock,
    hint: "Suspendre ou reprendre le parcours, décaler la fin et les jalons.",
  },
  {
    key: "parcours",
    label: "Évaluations de cette promotion",
    icon: ClipboardCheck,
    hint: "Retenir, retirer ou dater les évaluations pour cette promotion seulement.",
  },
  {
    key: "journal",
    label: "Journal des décisions",
    icon: History,
    hint: "Ce qui a été décidé sur cette promotion, par qui, quand, et pourquoi.",
  },
];

function PilotTools({
  cohortId,
  cohortLabel,
  interruption,
  incidentsOuverts,
  placements,
  jalons,
  finActuelle,
  semainesEcoulees,
  rows,
  summary,
  atelier,
  relance,
  onChanged,
}: {
  cohortId: CohortId;
  cohortLabel: string;
  interruption: CohortInterruption | undefined;
  incidentsOuverts: readonly ProgramIncident[];
  placements: readonly Placement[];
  jalons: readonly PilotTimelineItem[];
  finActuelle: string;
  semainesEcoulees: number;
  rows: readonly LearnerActivityRow[];
  summary: GroupActivitySummary;
  /** L'atelier des évaluations, borné à cette promotion et en ÉCRITURE. */
  atelier: ReactNode;
  /** La relance nominative, qui écrit un vrai brouillon de campagne. */
  relance: ReactNode;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<readonly ToolKey[]>([]);
  const toggle = (key: ToolKey) =>
    setOpen((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));

  const badgeFor = (key: ToolKey): string | null => {
    if (key === "relance") {
      const n = summary.lateLearners + summary.idleLearners;
      return n > 0 ? `${n} à relancer` : null;
    }
    if (key === "programmation")
      return interruption ? INTERRUPTION_STATE_LABELS_FR[interruption.mode] : "en cours";
    if (key === "incidents")
      return incidentsOuverts.length > 0 ? `${incidentsOuverts.length} ouvert(s)` : null;
    return null;
  };

  return (
    <PanelCard
      title="Outils de pilotage"
      description="Chaque outil se déplie directement dans la liste, sans quitter la promotion pilotée."
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
                  {tool.key === "incidents" ? (
                    <IncidentsPanel
                      cohortId={cohortId}
                      placements={placements}
                      jalons={jalons}
                      apprenants={rows.map((r) => ({ id: r.enrollmentId, nom: r.personName }))}
                      onGeste={(geste) => {
                        /* Le geste ouvre l'outil qui l'exécute, sans quitter la
                           promotion pilotée : c'est ce qui relie le problème au
                           remède. */
                        const cible: ToolKey =
                          geste === "relancer"
                            ? "relance"
                            : geste === "parcours"
                              ? "parcours"
                              : "programmation";
                        setOpen((keys) => (keys.includes(cible) ? keys : [...keys, cible]));
                        /* Le panneau n'existe qu'après le rendu qui suit
                           `setOpen` : on attend deux images (audit 21/09). */
                        requestAnimationFrame(() =>
                          requestAnimationFrame(() =>
                            document
                              .getElementById(`pilot-tool-${cible}`)
                              ?.scrollIntoView({ behavior: "smooth", block: "center" }),
                          ),
                        );
                      }}
                    />
                  ) : null}
                  {tool.key === "programmation" ? (
                    <div className="space-y-6">
                      <CohortInterruptionPanel
                        cohortId={cohortId}
                        cohortLabel={cohortLabel}
                        onChanged={onChanged}
                      />
                      <div className="border-t pt-5">
                        <p className="font-display mb-2 text-[17px] font-medium">
                          Décaler le calendrier
                        </p>
                        <CalendarShiftPanel
                          cohortId={cohortId}
                          finActuelle={finActuelle}
                          semainesEcoulees={semainesEcoulees}
                          onChanged={onChanged}
                        />
                      </div>
                    </div>
                  ) : null}
                  {tool.key === "journal" ? <PilotJournalPanel cohortId={cohortId} /> : null}
                  {tool.key === "parcours" ? (
                    <div className="space-y-3">
                      {/*
                        PROCHE DE LA CONCEPTION, MAIS EN SIMPLIFIE (Stef, 16/09).
                        Le Pilotage n'INVENTE aucun objet : il ne cree ni
                        modalite, ni terrain, ni carnet -- ca, c'est le
                        Concepteur. Mais pour CETTE promotion il peut toujours
                        dire « pas celle-ci », « decalee », « rattrapage ouvert ».
                      */}
                      <p className="text-muted-foreground text-[13px] leading-relaxed">
                        Cochez, décochez, datez pour cette promotion seulement. Une modalité créée
                        ici rejoint le catalogue du programme.
                      </p>
                      {atelier}
                    </div>
                  ) : null}
                  {tool.key === "relance" ? relance : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </PanelCard>
  );
}
