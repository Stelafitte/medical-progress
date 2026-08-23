/**
 * Modalités d'évaluation créées LOCALEMENT pendant la session de maquette.
 *
 * Une seule liste alimente l'onglet « Évaluations » et la partie Évaluation du
 * pilotage de programme. Rien n'est persisté côté serveur.
 */
import { useSyncExternalStore } from "react";
import {
  buildModalityFromInput,
  validateNewModality,
  type AssessmentModality,
  type NewAssessmentModalityInput,
} from "@/domain/assessmentModality";
import type { ProgramId } from "@/domain/types";

let current: readonly AssessmentModality[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly AssessmentModality[] {
  return current;
}

function emit(next: readonly AssessmentModality[]): void {
  current = next;
  for (const listener of listeners) listener();
}

export function resetLocalModalities(): void {
  emit([]);
}

export function listLocalModalities(): readonly AssessmentModality[] {
  return current;
}

export interface CreateLocalModalityArgs {
  readonly input: NewAssessmentModalityInput;
  readonly programId: ProgramId;
  readonly now?: string;
}

export function createLocalModality(args: CreateLocalModalityArgs): AssessmentModality | null {
  if (validateNewModality(args.input).length > 0) return null;
  const modality = buildModalityFromInput(args.input, {
    programId: args.programId,
    now: args.now ?? new Date().toISOString(),
    sequence: current.length + 1,
  });
  emit([...current, modality]);
  return modality;
}

export function useLocalModalities(programId?: ProgramId): readonly AssessmentModality[] {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!programId) return all;
  return all.filter((modality) => modality.programId === programId);
}
