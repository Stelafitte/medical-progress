/**
 * L'INTERRUPTION D'UNE PROMOTION — le vocabulaire, côté client.
 *
 * Stef, 16/09 : « il faut des boutons pour chaque situation que tu envisages
 * avec la Pause ». Une pause n'est donc pas UN comportement, c'est un CHOIX
 * entre trois degrés, et chaque degré a son bouton.
 *
 * Ce fichier ne décide de rien : la base tranche (migration
 * `20260916230000_interruption_de_promotion`, fonctions `pause_cohort` et
 * `resume_cohort`, et un trigger qui refuse les écritures d'apprenant). Il
 * nomme, il explique, et il calcule ce que l'écran doit montrer.
 */
import type { CohortId, IsoDateTime, PersonId } from "@/domain/types";

/** Les trois degrés, du plus fermé au plus discret. */
export type CohortInterruptionMode = "suspended" | "frozen" | "flagged";

export const INTERRUPTION_MODES: readonly CohortInterruptionMode[] = [
  "suspended",
  "frozen",
  "flagged",
];

/** Le libellé du BOUTON : ce qu'on fait, à l'infinitif. */
export const INTERRUPTION_ACTION_LABELS_FR: Record<CohortInterruptionMode, string> = {
  suspended: "Suspendre le parcours",
  frozen: "Geler les rendus",
  flagged: "Signaler une interruption",
};

/** Le libellé de l'ÉTAT : ce que la promotion est devenue. */
export const INTERRUPTION_STATE_LABELS_FR: Record<CohortInterruptionMode, string> = {
  suspended: "parcours suspendu",
  frozen: "rendus gelés",
  flagged: "interruption signalée",
};

/**
 * CE QUE LE BOUTON FAIT, dit à l'administrateur AVANT qu'il clique. Un geste
 * qui ferme un parcours à des dizaines d'étudiants ne se choisit pas sur son
 * seul titre.
 */
export const INTERRUPTION_EFFECT_FR: Record<CohortInterruptionMode, string> = {
  suspended:
    "L'apprenant ne voit plus le programme ; un message lui dit qu'il est suspendu et jusqu'à quand. L'encadrant ne valide plus rien.",
  frozen:
    "Tout reste visible et relisible. Plus aucun rendu n'est possible : ni QCM, ni carnet, ni dépôt de pièce. L'encadrant consulte sans valider.",
  flagged:
    "Rien ne change pour l'apprenant ni pour l'encadrant : le parcours continue. L'interruption est tracée pour l'équipe, et se lira dans le bilan.",
};

/** Ce que l'APPRENANT lit, à la première personne du parcours. */
export const INTERRUPTION_LEARNER_NOTICE_FR: Record<CohortInterruptionMode, string> = {
  suspended: "Votre parcours est suspendu.",
  frozen: "Votre parcours est consultable, mais aucun rendu n'est possible pour le moment.",
  flagged: "",
};

export interface CohortInterruption {
  readonly id: string;
  readonly cohortId: CohortId;
  readonly mode: CohortInterruptionMode;
  readonly reason: string;
  readonly startedOn: string;
  readonly expectedUntil?: string | null;
  readonly endedOn?: string | null;
  readonly endedNote?: string | null;
  readonly shiftWeeks: number;
  readonly declaredBy?: PersonId | null;
  readonly endedBy?: PersonId | null;
  readonly createdAt: IsoDateTime;
}

/** L'interruption EN COURS, s'il y en a une. Il ne peut y en avoir qu'une. */
export function interruptionEnCours(
  interruptions: readonly CohortInterruption[],
): CohortInterruption | undefined {
  return interruptions.find((i) => !i.endedOn);
}

/**
 * Le parcours accepte-t-il encore un rendu ?
 *
 * MÊME RÈGLE QUE LE TRIGGER, écrite deux fois exprès : la base refuse, l'écran
 * prévient. Un bouton qui part vers un refus certain est un bouton qui ment.
 */
export function rendusPossibles(interruption: CohortInterruption | undefined): boolean {
  return interruption === undefined || interruption.mode === "flagged";
}

/** Le parcours est-il seulement visible ? */
export function parcoursVisible(interruption: CohortInterruption | undefined): boolean {
  return interruption === undefined || interruption.mode !== "suspended";
}

/**
 * LE DÉCALAGE PROPOSÉ À LA REPRISE, en semaines pleines écoulées depuis le
 * début de l'interruption. C'est une PROPOSITION : l'équipe peut décider que
 * la promotion rattrape, et remettre zéro.
 */
export function decalagePropose(
  interruption: CohortInterruption,
  aujourdhui: Date = new Date(),
): number {
  const debut = Date.parse(`${interruption.startedOn}T00:00:00Z`);
  if (Number.isNaN(debut)) return 0;
  const jours = Math.floor((aujourdhui.getTime() - debut) / 86_400_000);
  return Math.max(0, Math.min(104, Math.floor(jours / 7)));
}

/** Combien de jours dure l'interruption à ce jour. */
export function joursEcoules(
  interruption: CohortInterruption,
  aujourdhui: Date = new Date(),
): number {
  const debut = Date.parse(`${interruption.startedOn}T00:00:00Z`);
  if (Number.isNaN(debut)) return 0;
  return Math.max(0, Math.floor((aujourdhui.getTime() - debut) / 86_400_000));
}

/**
 * La fin prévue est-elle dépassée ? Une pause qu'on a oublié de lever est le
 * scénario le plus coûteux : personne ne rend rien et personne ne sait pourquoi.
 */
export function finPrevueDepassee(
  interruption: CohortInterruption,
  aujourdhui: Date = new Date(),
): boolean {
  if (!interruption.expectedUntil) return false;
  const fin = Date.parse(`${interruption.expectedUntil}T23:59:59Z`);
  return !Number.isNaN(fin) && aujourdhui.getTime() > fin;
}
