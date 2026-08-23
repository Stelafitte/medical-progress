/**
 * Classes créées LOCALEMENT pendant la session de maquette.
 *
 * Une seule et même liste alimente le « Concepteur de programme » et l'onglet
 * « Classes d'apprenants » : une classe créée d'un côté est immédiatement
 * visible de l'autre. Rien n'est envoyé ni persisté côté serveur ; l'état
 * disparaît au rechargement de la page — c'est volontaire.
 */
import { useSyncExternalStore } from "react";
import {
  buildCohortFromInput,
  type NewCohortInput,
  validateNewCohort,
} from "@/domain/cohortDraft";
import type { Cohort, CurriculumVersionId, ProgramId } from "@/domain/types";

let current: readonly Cohort[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly Cohort[] {
  return current;
}

function emit(next: readonly Cohort[]): void {
  current = next;
  for (const listener of listeners) listener();
}

/** Vide la liste locale (utilisé par les tests et la réinitialisation de session). */
export function resetLocalCohorts(): void {
  emit([]);
}

export function listLocalCohorts(): readonly Cohort[] {
  return current;
}

export interface CreateLocalCohortArgs {
  readonly input: NewCohortInput;
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  /** Injectable pour rendre la création déterministe dans les tests. */
  readonly now?: string;
}

/**
 * Crée la classe si la saisie est valide, et renvoie l'objet créé.
 * Renvoie `null` quand la saisie est invalide (aucune mutation).
 */
export function createLocalCohort(args: CreateLocalCohortArgs): Cohort | null {
  if (validateNewCohort(args.input).length > 0) return null;
  const cohort = buildCohortFromInput(args.input, {
    programId: args.programId,
    curriculumVersionId: args.curriculumVersionId,
    now: args.now ?? new Date().toISOString(),
    sequence: current.length + 1,
  });
  emit([...current, cohort]);
  return cohort;
}

/** Classes locales du programme courant. */
export function useLocalCohorts(programId?: ProgramId): readonly Cohort[] {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!programId) return all;
  return all.filter((cohort) => cohort.programId === programId);
}
