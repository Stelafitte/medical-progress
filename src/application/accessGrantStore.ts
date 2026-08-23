/**
 * Droits accordés LOCALEMENT pendant la session de maquette.
 * Rien n'est persisté : l'état disparaît au rechargement — c'est volontaire.
 */
import { useSyncExternalStore } from "react";
import {
  buildAccessGrantFromInput,
  validateNewAccessGrant,
  type LocalAccessGrant,
  type NewAccessGrantInput,
} from "@/domain/accessGrant";
import type { ProgramId, RoleAssignment } from "@/domain/types";

let current: readonly LocalAccessGrant[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly LocalAccessGrant[] {
  return current;
}

function emit(next: readonly LocalAccessGrant[]): void {
  current = next;
  for (const listener of listeners) listener();
}

export function resetLocalAccessGrants(): void {
  emit([]);
}

export function listLocalAccessGrants(): readonly LocalAccessGrant[] {
  return current;
}

export interface CreateLocalAccessGrantArgs {
  readonly input: NewAccessGrantInput;
  readonly programId: ProgramId;
  readonly existing: readonly RoleAssignment[];
  readonly now?: string;
}

/** Accorde le droit si la saisie est valide, sinon renvoie `null`. */
export function createLocalAccessGrant(
  args: CreateLocalAccessGrantArgs,
): LocalAccessGrant | null {
  const issues = validateNewAccessGrant(args.input, {
    programId: args.programId,
    existing: args.existing,
  });
  if (issues.length > 0) return null;
  const grant = buildAccessGrantFromInput(args.input, {
    programId: args.programId,
    now: args.now ?? new Date().toISOString(),
  });
  emit([...current, grant]);
  return grant;
}

export function useLocalAccessGrants(programId?: ProgramId): readonly LocalAccessGrant[] {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!programId) return all;
  return all.filter((item) => item.scope.kind !== "platform" && item.scope.programId === programId);
}
