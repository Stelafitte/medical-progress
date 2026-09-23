/**
 * Modèle de vue (présentation pure) de l'administration d'un programme.
 *
 * Rien ici ne touche au domaine ni à l'infrastructure : ce module dérive
 * uniquement, de façon déterministe, ce que les écrans doivent afficher —
 * phase d'une cohorte, avancement calendaire, chronologie mixte
 * programme + cohorte, et blocs de la vue « Tous les programmes ».
 *
 * Règle métier structurante : un programme peut être rejoué par plusieurs
 * cohortes, en parallèle ou en séquence. Le pilotage se fait donc TOUJOURS
 * cohorte par cohorte, jamais sur « le programme » dans son ensemble.
 */
import type { PlanScheduleEntry } from "@/domain/acquisitionPlan";
import type { Cohort, Program, ProgramId } from "@/domain/types";

/* ------------------------------------------------------------------ */
/* Cohortes                                                            */
/* ------------------------------------------------------------------ */

export type CohortPhase = "planned" | "running" | "closed";

export const COHORT_PHASE_LABELS_FR: Record<CohortPhase, string> = {
  planned: "à venir",
  running: "en cours",
  closed: "terminée",
};

const ms = (iso: string) => new Date(iso).getTime();

export function cohortPhase(cohort: Cohort, now: Date = new Date()): CohortPhase {
  const t = now.getTime();
  if (t < ms(cohort.startsOn)) return "planned";
  if (t > ms(cohort.endsOn)) return "closed";
  return "running";
}

/** Avancement calendaire de la cohorte (0 → 1), borné. */
export function cohortProgressRatio(cohort: Cohort, now: Date = new Date()): number {
  const start = ms(cohort.startsOn);
  const end = ms(cohort.endsOn);
  if (!(end > start)) return 0;
  const ratio = (now.getTime() - start) / (end - start);
  return Math.min(1, Math.max(0, ratio));
}

/** Jours restants avant la clôture (négatif si la cohorte est terminée). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.round((ms(iso) - now.getTime()) / 86_400_000);
}

const PHASE_ORDER: Record<CohortPhase, number> = { running: 0, planned: 1, closed: 2 };

/**
 * Ordre du sélecteur de cohorte : les cohortes en cours d'abord (la plus
 * récemment lancée en tête), puis celles à venir par ordre de démarrage,
 * puis les cohortes terminées de la plus récente à la plus ancienne.
 */
/**
 * DÉPARTAGER DEUX PROMOTIONS AUX MÊMES DATES — le statut, puis le nom.
 *
 * ⚠️ Stef, 16/09 : « je trouve bizarre que seule la promotion 2026-2027
 * apparaisse alors que celle qui est activée c'est la promotion test SL ».
 * Les deux promotions du DFASM ont EXACTEMENT les mêmes dates : le tri par
 * phase puis par date était donc à égalité, et c'est l'ordre de la base qui
 * tranchait. Arbitraire, et incompréhensible pour qui regarde l'écran.
 *
 * On départage désormais par le STATUT — une promotion en cours passe devant
 * une promotion seulement ouverte, qui passe devant un brouillon — puis, en
 * dernier recours, par le nom. Le nom n'est pas un critère pertinent, mais il
 * est STABLE : mieux vaut un ordre arbitraire et constant qu'un ordre qui
 * change d'un rechargement à l'autre.
 */
const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  open: 1,
  draft: 2,
  completed: 3,
  archived: 4,
};

export function sortCohortsForPilot(
  cohorts: readonly Cohort[],
  now: Date = new Date(),
): readonly Cohort[] {
  return [...cohorts].sort((a, b) => {
    const pa = PHASE_ORDER[cohortPhase(a, now)];
    const pb = PHASE_ORDER[cohortPhase(b, now)];
    if (pa !== pb) return pa - pb;

    const parDate =
      cohortPhase(a, now) === "planned"
        ? ms(a.startsOn) - ms(b.startsOn)
        : ms(b.startsOn) - ms(a.startsOn);
    if (parDate !== 0) return parDate;

    const sa = STATUS_ORDER[a.status] ?? 9;
    const sb = STATUS_ORDER[b.status] ?? 9;
    if (sa !== sb) return sa - sb;

    return a.label.localeCompare(b.label, "fr");
  });
}

/** Cohorte proposée par défaut au pilotage (jamais implicite : elle est affichée). */
export function defaultPilotCohortId(
  cohorts: readonly Cohort[],
  now: Date = new Date(),
): string | undefined {
  return sortCohortsForPilot(cohorts, now)[0]?.id;
}

/* ------------------------------------------------------------------ */
/* Chronologie mixte programme + cohorte                               */
/* ------------------------------------------------------------------ */

export type TimelineOrigin = "program" | "cohort";
export type TimelineState = "done" | "current" | "upcoming";

export interface PilotTimelineItem {
  readonly id: string;
  readonly label: string;
  readonly date: string;
  readonly origin: TimelineOrigin;
  readonly official: boolean;
  readonly state: TimelineState;
  readonly detail?: string;
}

const CURRENT_WINDOW_DAYS = 21;

function stateFor(iso: string, now: Date): TimelineState {
  const d = daysUntil(iso, now);
  if (d < 0) return "done";
  return d <= CURRENT_WINDOW_DAYS ? "current" : "upcoming";
}

/**
 * Jalons de la cohorte pilotée : lancement, rétrocalendrier de préparation,
 * mi-parcours et clôture. Ils encadrent les jalons du programme.
 */
export function cohortMilestones(cohort: Cohort, now: Date = new Date()): PilotTimelineItem[] {
  const start = ms(cohort.startsOn);
  const end = ms(cohort.endsOn);
  const iso = (t: number) => new Date(t).toISOString();
  const retro = iso(start - 30 * 86_400_000);
  const mid = iso(start + (end - start) / 2);
  const items: readonly Omit<PilotTimelineItem, "state" | "origin" | "official">[] = [
    {
      id: `${cohort.id}-retro`,
      label: "Rétrocalendrier : préparation et convocations",
      date: retro,
      detail: "J-30 avant le lancement de la cohorte",
    },
    {
      id: `${cohort.id}-launch`,
      label: `Lancement de ${cohort.label}`,
      date: cohort.startsOn,
      detail: `${cohort.learnerCount} apprenants attendus`,
    },
    { id: `${cohort.id}-mid`, label: "Point de mi-parcours", date: mid },
    {
      id: `${cohort.id}-end`,
      label: `Clôture de ${cohort.label}`,
      date: cohort.endsOn,
      detail: "Validations et attestations",
    },
  ];
  return items.map((item) => ({
    ...item,
    origin: "cohort" as const,
    official: true,
    state: stateFor(item.date, now),
  }));
}

/**
 * Chronologie du pilotage : jalons du programme (modèle réutilisable) fondus
 * avec les jalons de la cohorte choisie, dans un seul axe temporel.
 */
export function buildPilotTimeline(
  planSchedule: readonly PlanScheduleEntry[],
  cohort: Cohort | undefined,
  now: Date = new Date(),
): readonly PilotTimelineItem[] {
  const programItems: PilotTimelineItem[] = planSchedule.map((entry) => ({
    id: `${entry.outcomeId}-${entry.dueOn}`,
    label: entry.milestoneLabel,
    date: entry.dueOn,
    origin: "program",
    official: entry.official,
    state: stateFor(entry.dueOn, now),
  }));
  const items = cohort ? [...programItems, ...cohortMilestones(cohort, now)] : programItems;
  return items.sort((a, b) => ms(a.date) - ms(b.date));
}

/** Prochain jalon non passé, utilisé comme échéance affichée. */
export function nextMilestone(items: readonly PilotTimelineItem[]): PilotTimelineItem | undefined {
  return items.find((item) => item.state !== "done");
}

/* ------------------------------------------------------------------ */
/* Vue « Tous les programmes » (programmes administrés par la personne) */
/* ------------------------------------------------------------------ */

export interface AdministeredProgramCard {
  readonly program: Program;
  readonly cohortCount: number;
  /** Toutes les cohortes du programme, triées pour le pilotage (filtres, dates). */
  readonly cohorts: readonly Cohort[];
  readonly activeCohort: Cohort | undefined;
  readonly phase: CohortPhase | undefined;
  readonly progressPercent: number;
  readonly nextDeadline: { readonly label: string; readonly date: string } | undefined;
  readonly learnerCount: number;
}

/**
 * Blocs de la vue « Tous les programmes » : uniquement les programmes où la
 * personne connectée possède réellement un rôle d'administrateur.
 */
export function buildAdministeredProgramCards(
  programs: readonly Program[],
  cohorts: readonly Cohort[],
  isAdministratorOf: (programId: ProgramId) => boolean,
  now: Date = new Date(),
): readonly AdministeredProgramCard[] {
  return programs
    .filter((program) => isAdministratorOf(program.id))
    .map((program) => {
      const scoped = sortCohortsForPilot(
        cohorts.filter((c) => c.programId === program.id),
        now,
      );
      const activeCohort = scoped[0];
      const timeline = buildPilotTimeline([], activeCohort, now);
      const next = nextMilestone(timeline);
      return {
        program,
        cohortCount: scoped.length,
        cohorts: scoped,
        activeCohort,
        phase: activeCohort ? cohortPhase(activeCohort, now) : undefined,
        progressPercent: activeCohort
          ? Math.round(cohortProgressRatio(activeCohort, now) * 100)
          : 0,
        nextDeadline: next ? { label: next.label, date: next.date } : undefined,
        learnerCount: scoped.reduce((n, c) => n + c.learnerCount, 0),
      };
    });
}

export const formatFrDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/**
 * LES ÉTUDIANTS EN STAGE, PAS LES LIGNES D'AFFECTATION (23/09).
 *
 * `list_placement_assignments` DÉRIVE ses lignes du croisement
 * membres du groupe x encadrants du groupe : 18 étudiants suivis par
 * 6 encadrants font 108 lignes. Compter ces lignes, c'est compter des couples,
 * et la « Vue d'ensemble » annonçait 108 stages pour 18 étudiants. Tout
 * compteur qui parle d'ÉTUDIANTS passe donc par ici.
 */
export function etudiantsAffectes(
  assignments: readonly { readonly enrollmentId: string }[],
): number {
  return new Set(assignments.map((a) => a.enrollmentId)).size;
}
