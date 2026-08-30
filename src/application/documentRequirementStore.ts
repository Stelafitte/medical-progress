/**
 * Pièces exigées créées LOCALEMENT pendant la session de maquette.
 *
 * Une seule liste alimente l'onglet « Documents et certificats » et le
 * « Concepteur de programme ». Rien n'est persisté : l'état disparaît au
 * rechargement — c'est volontaire.
 */
import { useSyncExternalStore } from "react";
import {
  buildDocumentRequirementFromInput,
  validateNewDocumentRequirement,
  type DocumentRequirement,
  type NewDocumentRequirementInput,
} from "@/domain/documentRequirement";
import type { ProgramId } from "@/domain/types";

let current: readonly DocumentRequirement[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly DocumentRequirement[] {
  return current;
}

function emit(next: readonly DocumentRequirement[]): void {
  current = next;
  for (const listener of listeners) listener();
}

export function resetLocalDocumentRequirements(): void {
  emit([]);
}

export function listLocalDocumentRequirements(): readonly DocumentRequirement[] {
  return current;
}

export interface CreateLocalDocumentRequirementArgs {
  readonly input: NewDocumentRequirementInput;
  readonly programId: ProgramId;
  readonly now?: string;
}

/** Crée la pièce exigée si la saisie est valide, sinon renvoie `null`. */
export function createLocalDocumentRequirement(
  args: CreateLocalDocumentRequirementArgs,
): DocumentRequirement | null {
  if (validateNewDocumentRequirement(args.input).length > 0) return null;
  const requirement = buildDocumentRequirementFromInput(args.input, {
    programId: args.programId,
    now: args.now ?? new Date().toISOString(),
    sequence: current.length + 1,
  });
  emit([...current, requirement]);
  return requirement;
}

export function useLocalDocumentRequirements(
  programId?: ProgramId,
): readonly DocumentRequirement[] {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!programId) return all;
  return all.filter((item) => item.programId === programId);
}
