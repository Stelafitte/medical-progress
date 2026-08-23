/**
 * Filtres de la vue « Tous les programmes » (présentation pure, déterministe).
 *
 * Trois axes indépendants, toujours visibles dans le bandeau de la page :
 *  - la FILIÈRE : formation initiale (DFASM) ou formation continue (DIU, DPC…) ;
 *  - l'ÉTAT du programme, dérivé de ses cohortes (jamais saisi à la main) ;
 *  - une FENÊTRE DE DATES, appliquée aux cohortes du programme.
 *
 * Aucun état n'est stocké ici : les fonctions dérivent tout des données.
 */
import type { AdministeredProgramCard } from "@/features/administration/adminProgramViewModel";
import { cohortPhase } from "@/features/administration/adminProgramViewModel";
import type { ProgramKind } from "@/domain/types";

/** Filière de formation. « toutes » n'est pas une filière : c'est l'absence de filtre. */
export type ProgramTrack = "initial" | "continuing";

export const PROGRAM_TRACK_LABELS_FR: Record<ProgramTrack, string> = {
  initial: "Formation initiale",
  continuing: "Formation continue",
};

/** DFASM relève de la formation initiale ; DIU, DPC et autres de la continue. */
export function programTrack(kind: ProgramKind): ProgramTrack {
  return kind === "dfasm" ? "initial" : "continuing";
}

/**
 * État du programme, dérivé de ses cohortes :
 *  - construction : aucune cohorte programmée ;
 *  - lancement : uniquement des cohortes à venir ;
 *  - en cours : au moins une cohorte en cours ;
 *  - clos : toutes les cohortes sont terminées ;
 *  - archivé : clos depuis plus d'un an (aucune reprise prévue).
 */
export type ProgramLifecycle = "construction" | "launching" | "running" | "closed" | "archived";

export const PROGRAM_LIFECYCLE_LABELS_FR: Record<ProgramLifecycle, string> = {
  construction: "En construction",
  launching: "En lancement",
  running: "En cours",
  closed: "Clos",
  archived: "Archivé",
};

const ARCHIVE_AFTER_DAYS = 365;
const ms = (iso: string) => new Date(iso).getTime();

export function programLifecycle(
  card: AdministeredProgramCard,
  now: Date = new Date(),
): ProgramLifecycle {
  if (card.cohorts.length === 0) return "construction";
  const phases = card.cohorts.map((cohort) => cohortPhase(cohort, now));
  if (phases.includes("running")) return "running";
  if (phases.includes("planned")) return "launching";
  const lastEnd = Math.max(...card.cohorts.map((cohort) => ms(cohort.endsOn)));
  const days = (now.getTime() - lastEnd) / 86_400_000;
  return days > ARCHIVE_AFTER_DAYS ? "archived" : "closed";
}

export interface AllProgramsFilterState {
  readonly tracks: readonly ProgramTrack[];
  readonly lifecycles: readonly ProgramLifecycle[];
  /** Bornes inclusives au format ISO court (AAAA-MM-JJ), vides si non renseignées. */
  readonly from: string;
  readonly to: string;
}

export const EMPTY_ALL_PROGRAMS_FILTERS: AllProgramsFilterState = {
  tracks: [],
  lifecycles: [],
  from: "",
  to: "",
};

export function hasActiveFilters(filters: AllProgramsFilterState): boolean {
  return (
    filters.tracks.length > 0 ||
    filters.lifecycles.length > 0 ||
    filters.from !== "" ||
    filters.to !== ""
  );
}

/** Bascule d'une valeur dans une liste de filtres (sélection multiple). */
export function toggleFilterValue<T>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/**
 * Fenêtre de dates : le programme est retenu si au moins une de ses cohortes
 * chevauche l'intervalle demandé (une cohorte en cours reste visible même si
 * elle a démarré avant la borne basse).
 */
function matchesDateWindow(card: AdministeredProgramCard, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (card.cohorts.length === 0) return false;
  const lower = from ? ms(`${from}T00:00:00.000Z`) : Number.NEGATIVE_INFINITY;
  const upper = to ? ms(`${to}T23:59:59.999Z`) : Number.POSITIVE_INFINITY;
  if (Number.isNaN(lower) || Number.isNaN(upper)) return true;
  return card.cohorts.some(
    (cohort) => ms(cohort.startsOn) <= upper && ms(cohort.endsOn) >= lower,
  );
}

export function filterProgramCards(
  cards: readonly AdministeredProgramCard[],
  filters: AllProgramsFilterState,
  now: Date = new Date(),
): readonly AdministeredProgramCard[] {
  return cards.filter((card) => {
    if (
      filters.tracks.length > 0 &&
      !filters.tracks.includes(programTrack(card.program.kind))
    ) {
      return false;
    }
    if (
      filters.lifecycles.length > 0 &&
      !filters.lifecycles.includes(programLifecycle(card, now))
    ) {
      return false;
    }
    return matchesDateWindow(card, filters.from, filters.to);
  });
}

/** Compteurs affichés dans le bandeau, calculés avant filtrage. */
export function countByLifecycle(
  cards: readonly AdministeredProgramCard[],
  now: Date = new Date(),
): Record<ProgramLifecycle, number> {
  const counts: Record<ProgramLifecycle, number> = {
    construction: 0,
    launching: 0,
    running: 0,
    closed: 0,
    archived: 0,
  };
  for (const card of cards) counts[programLifecycle(card, now)] += 1;
  return counts;
}
