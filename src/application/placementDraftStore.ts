/**
 * Terrains de stage créés LOCALEMENT pendant la session de maquette.
 *
 * Une seule et même liste alimente l'onglet « Gestion des stages » et le
 * « Concepteur de programme » : un terrain créé d'un côté est immédiatement
 * visible de l'autre. Rien n'est envoyé ni persisté côté serveur ; l'état
 * disparaît au rechargement de la page — c'est volontaire.
 */
import { useSyncExternalStore } from "react";
import {
  buildPlacementFromInput,
  type LocalPlacement,
  type NewPlacementInput,
  validateNewPlacement,
} from "@/domain/placementDraft";
import type { ProgramId } from "@/domain/types";

let current: readonly LocalPlacement[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly LocalPlacement[] {
  return current;
}

function emit(next: readonly LocalPlacement[]): void {
  current = next;
  for (const listener of listeners) listener();
}

/** Vide la liste locale (tests et réinitialisation de session). */
export function resetLocalPlacements(): void {
  emit([]);
}

export function listLocalPlacements(): readonly LocalPlacement[] {
  return current;
}

export interface CreateLocalPlacementArgs {
  readonly input: NewPlacementInput;
  readonly programId: ProgramId;
  /** Injectable pour rendre la création déterministe dans les tests. */
  readonly now?: string;
}

/**
 * Crée le terrain de stage si la saisie est valide et renvoie l'objet créé.
 * Renvoie `null` quand la saisie est invalide (aucune mutation).
 */
export function createLocalPlacement(args: CreateLocalPlacementArgs): LocalPlacement | null {
  if (validateNewPlacement(args.input).length > 0) return null;
  const created = buildPlacementFromInput(args.input, {
    programId: args.programId,
    now: args.now ?? new Date().toISOString(),
    sequence: current.length + 1,
  });
  emit([...current, created]);
  return created;
}

/** Terrains locaux du programme courant. */
export function useLocalPlacements(programId?: ProgramId): readonly LocalPlacement[] {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!programId) return all;
  return all.filter((local) => local.placement.programId === programId);
}
