/**
 * Journal de compétence : état LOCAL de session (maquette).
 *
 * Aucune écriture serveur, aucune persistance : l'état disparaît au
 * rechargement. La progression officielle reste dérivée des preuves.
 */
import { useSyncExternalStore } from "react";
import {
  appendMessage,
  emptyJournalEntry,
  setExperienceNote,
  toggleSelfDeclaration,
  type CompetenceJournalEntry,
  type JournalAuthor,
} from "@/domain/competenceJournal";
import type { OutcomeId } from "@/domain/types";

let current: readonly CompetenceJournalEntry[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly CompetenceJournalEntry[] {
  return current;
}

function emit(next: readonly CompetenceJournalEntry[]): void {
  current = next;
  for (const listener of listeners) listener();
}

export function resetCompetenceJournal(): void {
  emit([]);
}

export function getJournalEntry(outcomeId: OutcomeId): CompetenceJournalEntry {
  return current.find((e) => e.outcomeId === outcomeId) ?? emptyJournalEntry(outcomeId);
}

function update(
  outcomeId: OutcomeId,
  mutate: (entry: CompetenceJournalEntry) => CompetenceJournalEntry,
): void {
  const existing = current.find((e) => e.outcomeId === outcomeId);
  const next = mutate(existing ?? emptyJournalEntry(outcomeId));
  emit(existing ? current.map((e) => (e.outcomeId === outcomeId ? next : e)) : [...current, next]);
}

export function declareCompetence(outcomeId: OutcomeId, acquired: boolean, now?: string): void {
  update(outcomeId, (entry) =>
    toggleSelfDeclaration(entry, acquired, now ?? new Date().toISOString()),
  );
}

export function saveExperienceNote(outcomeId: OutcomeId, note: string): void {
  update(outcomeId, (entry) => setExperienceNote(entry, note));
}

export function sendJournalMessage(
  outcomeId: OutcomeId,
  author: JournalAuthor,
  body: string,
  now?: string,
): void {
  const timestamp = now ?? new Date().toISOString();
  update(outcomeId, (entry) =>
    appendMessage(entry, author, body, timestamp, `${outcomeId}-${entry.messages.length + 1}`),
  );
}

/** Journal complet de la session. */
export function useCompetenceJournal(): readonly CompetenceJournalEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
