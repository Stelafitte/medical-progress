/**
 * Journal de compétence de l'apprenant : logique métier pure.
 *
 * L'apprenant peut DÉCLARER une compétence acquise, commenter son expérience
 * d'acquisition et échanger avec son tuteur. Ces éléments ne modifient JAMAIS
 * le niveau de maîtrise calculé (`src/domain/mastery.ts`) : une compétence en
 * situation réelle reste soumise à une validation humaine tierce.
 */
import type { IsoDateTime, OutcomeId } from "./types";

export type JournalAuthor = "learner" | "tutor";

export interface JournalMessage {
  readonly id: string;
  readonly author: JournalAuthor;
  readonly body: string;
  readonly sentAt: IsoDateTime;
  /** Maquette : aucun envoi réel, aucune persistance serveur. */
  readonly simulated: true;
}

export interface CompetenceJournalEntry {
  readonly outcomeId: OutcomeId;
  /** Auto-déclaration de l'apprenant, en attente de validation tierce. */
  readonly selfDeclaredAcquired: boolean;
  readonly declaredAt?: IsoDateTime;
  /** Récit de l'expérience d'acquisition (contexte, gestes, difficultés). */
  readonly experienceNote: string;
  readonly messages: readonly JournalMessage[];
}

export type SelfDeclarationState = "none" | "awaiting_validation" | "confirmed";

/**
 * État lisible d'une auto-déclaration croisée avec le calcul de progression.
 * `confirmed` signifie que le niveau cible est atteint par des preuves : la
 * déclaration de l'apprenant n'y suffit jamais à elle seule.
 */
export function selfDeclarationState(
  entry: CompetenceJournalEntry | undefined,
  meetsTarget: boolean,
): SelfDeclarationState {
  if (meetsTarget) return "confirmed";
  return entry?.selfDeclaredAcquired ? "awaiting_validation" : "none";
}

export function emptyJournalEntry(outcomeId: OutcomeId): CompetenceJournalEntry {
  return { outcomeId, selfDeclaredAcquired: false, experienceNote: "", messages: [] };
}

export function toggleSelfDeclaration(
  entry: CompetenceJournalEntry,
  acquired: boolean,
  now: IsoDateTime,
): CompetenceJournalEntry {
  return {
    ...entry,
    selfDeclaredAcquired: acquired,
    declaredAt: acquired ? now : undefined,
  };
}

export function setExperienceNote(
  entry: CompetenceJournalEntry,
  note: string,
): CompetenceJournalEntry {
  return { ...entry, experienceNote: note };
}

/** Un message vide n'est jamais ajouté. */
export function appendMessage(
  entry: CompetenceJournalEntry,
  author: JournalAuthor,
  body: string,
  now: IsoDateTime,
  id: string,
): CompetenceJournalEntry {
  if (body.trim().length === 0) return entry;
  const message: JournalMessage = { id, author, body: body.trim(), sentAt: now, simulated: true };
  return { ...entry, messages: [...entry.messages, message] };
}
