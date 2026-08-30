/**
 * État LOCAL de démonstration de l'annuaire (personnes / comptes / inscriptions).
 *
 * Store minimal en mémoire du navigateur : les mutations mettent à jour la liste
 * affichée sans rechargement, et rien n'est envoyé ni persisté côté serveur.
 * L'état est perdu au rechargement de la page — c'est volontaire : la maquette
 * ne prétend à aucune persistance.
 */
import { useSyncExternalStore } from "react";
import type { DirectoryState } from "@/domain/directory";
import { buildInitialDirectoryState } from "@/infrastructure/mock/directoryFixtures";

let current: DirectoryState = buildInitialDirectoryState();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): DirectoryState {
  return current;
}

export function setDirectoryState(next: DirectoryState): void {
  current = next;
  for (const listener of listeners) listener();
}

/** Réinitialise l'annuaire local sur le jeu de démonstration. */
export function resetDirectoryState(): void {
  setDirectoryState(buildInitialDirectoryState());
}

export function useDirectoryState(): DirectoryState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
