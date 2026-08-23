/**
 * Connaissances créées LOCALEMENT pendant la session de maquette.
 * Même mécanique que le magasin des compétences : rien n'est persisté,
 * l'état disparaît au rechargement — c'est volontaire.
 */
import { useSyncExternalStore } from "react";
import {
  buildKnowledgeFromInput,
  validateNewKnowledge,
  type NewKnowledgeInput,
} from "@/domain/knowledgeDraft";
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

export function resetLocalKnowledge(): void {
  emit([]);
}

export function listLocalKnowledge(): readonly Outcome[] {
  return current;
}

export interface CreateLocalKnowledgeArgs {
  readonly input: NewKnowledgeInput;
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  readonly now?: string;
}

/** Crée la connaissance si la saisie est valide, sinon renvoie `null`. */
export function createLocalKnowledge(args: CreateLocalKnowledgeArgs): Outcome | null {
  if (validateNewKnowledge(args.input).length > 0) return null;
  const outcome = buildKnowledgeFromInput(args.input, {
    programId: args.programId,
    curriculumVersionId: args.curriculumVersionId,
    now: args.now ?? new Date().toISOString(),
    sequence: current.length + 1,
  });
  emit([...current, outcome]);
  return outcome;
}

export function useLocalKnowledge(programId?: ProgramId): readonly Outcome[] {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!programId) return all;
  return all.filter((outcome) => outcome.programId === programId);
}
