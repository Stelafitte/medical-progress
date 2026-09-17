/**
 * Pièces exigées par un programme — LUES ET ÉCRITES EN BASE depuis le 17/09.
 *
 * Ce fichier disait de lui-même, hier encore : « Rien n'est persisté : l'état
 * disparaît au rechargement — c'est volontaire. » Ce n'était volontaire que
 * faute de table. `admin_document_requirements` existe désormais, avec ce que
 * le domaine décrivait déjà : qui fournit, qui valide, quand c'est attendu.
 *
 * L'instantané local reste, et il sert à deux choses : afficher la pièce à
 * peine créée sans attendre un aller-retour, et alimenter le Concepteur de
 * programme qui lit la même liste que l'onglet Documents. Il est SEMÉ par la
 * lecture du programme (`useProgramAdmin`), jamais inventé.
 */
import { useSyncExternalStore } from "react";
import { getSelectedDataAccess } from "@/application/dataAccess";
import {
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

/**
 * Sème l'instantané avec ce que la base rend pour un programme. Les pièces des
 * AUTRES programmes déjà chargées sont conservées : deux onglets peuvent
 * regarder deux programmes.
 */
export function hydrateDocumentRequirements(
  programId: ProgramId,
  rows: readonly DocumentRequirement[],
): void {
  const autres = current.filter((item) => item.programId !== programId);
  emit([...autres, ...rows]);
}

export interface CreateLocalDocumentRequirementArgs {
  readonly input: NewDocumentRequirementInput;
  readonly programId: ProgramId;
}

/**
 * Déclare la pièce exigée EN BASE si la saisie est valide, sinon renvoie
 * `null`. La fonction est la seule porte : c'est la base qui attribue
 * l'identifiant et la date, jamais l'écran.
 */
export async function createDocumentRequirement(
  args: CreateLocalDocumentRequirementArgs,
): Promise<DocumentRequirement | null> {
  if (validateNewDocumentRequirement(args.input).length > 0) return null;
  const requirement = await getSelectedDataAccess().administration.declareDocumentRequirement({
    programId: args.programId,
    code: args.input.code.trim(),
    label: args.input.label.trim(),
    mandatory: args.input.mandatory,
    provider: args.input.provider,
    validator: args.input.validator,
    due: args.input.due,
    notes: args.input.notes.trim(),
  });
  /* Une correction remplace sa ligne : la clé est stable, elle ne s'empile pas. */
  const sansDoublon = current.filter(
    (item) => !(item.programId === args.programId && item.code === requirement.code),
  );
  emit([...sansDoublon, requirement]);
  return requirement;
}

export function useLocalDocumentRequirements(
  programId?: ProgramId,
): readonly DocumentRequirement[] {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!programId) return all;
  return all.filter((item) => item.programId === programId);
}
