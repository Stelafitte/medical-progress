/**
 * Compétences créées LOCALEMENT pendant la session de maquette.
 *
 * Une seule et même liste alimente l'onglet « Compétences » et le « Concepteur
 * de programme ». Rien n'est envoyé ni persisté côté serveur ; l'état disparaît
 * au rechargement de la page — c'est volontaire.
 */
import { useSyncExternalStore } from "react";
import {
  buildCompetenceFromInput,
  type NewCompetenceInput,
  validateNewCompetence,
} from "@/domain/competenceDraft";
import type { CurriculumVersionId, Outcome, ProgramId } from "@/domain/types";

let current: readonly Outcome[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly Outcome[] {
  return current;
}

function emit(next: readonly Outcome[]): void {
  current = next;
  for (const listener of listeners) listener();
}

/** Vide la liste locale (tests et réinitialisation de session). */
export function resetLocalCompetences(): void {
  emit([]);
}

export function listLocalCompetences(): readonly Outcome[] {
  return current;
}

export interface CreateLocalCompetenceArgs {
  readonly input: NewCompetenceInput;
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  /** Injectable pour rendre la création déterministe dans les tests. */
  readonly now?: string;
}

/**
 * Crée la compétence si la saisie est valide et renvoie l'objet créé.
 * Renvoie `null` quand la saisie est invalide (aucune mutation).
 */
export function createLocalCompetence(args: CreateLocalCompetenceArgs): Outcome | null {
  if (validateNewCompetence(args.input).length > 0) return null;
  const outcome = buildCompetenceFromInput(args.input, {
    programId: args.programId,
    curriculumVersionId: args.curriculumVersionId,
    now: args.now ?? new Date().toISOString(),
    sequence: current.length + 1,
  });
  emit([...current, outcome]);
  return outcome;
}

/** Compétences locales du programme courant. */
export function useLocalCompetences(programId?: ProgramId): readonly Outcome[] {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!programId) return all;
  return all.filter((outcome) => outcome.programId === programId);
}
