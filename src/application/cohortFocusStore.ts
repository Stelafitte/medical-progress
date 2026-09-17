/**
 * LA PROMOTION SUR LAQUELLE ON TRAVAILLE — une seule, partagée par les onglets.
 *
 * ⚠️ LE DÉFAUT QUE CE FICHIER CORRIGE (Stef, 16/09) : « je trouve bizarre que
 * seule la promotion 2026-2027 apparaisse alors que celle qui est activée c'est
 * la promotion test SL ».
 *
 * Il avait raison, et la cause était double.
 *
 * 1. CHAQUE ÉCRAN AVAIT SON PROPRE `useState`. On choisissait « test SL » dans
 *    Évaluations, on passait au Pilotage, et le Pilotage ne le savait pas. Sept
 *    écrans, sept vérités.
 *
 * 2. LE DÉFAUT SE CALCULAIT SUR LES SEULES DATES. Or les deux promotions du
 *    DFASM ont exactement les mêmes : le tri était à égalité, et c'est l'ordre
 *    de la base qui tranchait. Arbitraire, donc incompréhensible pour qui
 *    regarde l'écran.
 *
 * POURQUOI UN STORE ET PAS L'URL. La promotion suit l'administrateur d'un
 * onglet à l'autre ; la mettre dans l'URL obligerait chaque lien de navigation
 * à la reporter, et le premier lien qui l'oublierait ramènerait au défaut sans
 * prévenir. Le lien profond existe déjà pour le cas où l'on veut pointer une
 * promotion précise (`?promotion=` sur le pilotage) : il reste prioritaire.
 *
 * POURQUOI `sessionStorage` ET PAS `localStorage`. C'est un contexte de
 * travail, pas une préférence : retrouver dans trois semaines la promotion
 * qu'on regardait un mardi soir n'aide personne, et tromperait sur ce qu'on
 * est en train de piloter.
 */
import { useSyncExternalStore } from "react";

const CLE = "mpe.cohort-focus.v1";

let current: string | null = null;
const listeners = new Set<() => void>();

function lireStockage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const brut = window.sessionStorage.getItem(CLE);
    return brut && brut.length > 0 ? brut : null;
  } catch {
    /* Navigation privée, stockage refusé : on travaille sans mémoire. */
    return null;
  }
}

let amorce = false;
function amorcer(): void {
  if (amorce) return;
  amorce = true;
  current = lireStockage();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string | null {
  amorcer();
  return current;
}

/** Le serveur ne connaît aucune promotion choisie : il rend la même valeur. */
function getServerSnapshot(): string | null {
  return null;
}

export function setCohortFocus(cohortId: string | null): void {
  amorcer();
  if (current === cohortId) return;
  current = cohortId;
  try {
    if (typeof window !== "undefined") {
      if (cohortId) window.sessionStorage.setItem(CLE, cohortId);
      else window.sessionStorage.removeItem(CLE);
    }
  } catch {
    /* Sans stockage, le choix vit le temps de la page — ça reste mieux que rien. */
  }
  for (const listener of listeners) listener();
}

export function resetCohortFocus(): void {
  setCohortFocus(null);
}

/**
 * La promotion choisie, ou `null`. L'appelant décide du défaut : lui seul sait
 * quelles promotions il a sous la main.
 */
export function useCohortFocus(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
