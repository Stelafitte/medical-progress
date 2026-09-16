/**
 * LE JOURNAL DU PILOTAGE ET L'INCIDENT — le vocabulaire, côté client.
 *
 * Stef, 16/09 : « il faut imaginer ce qui se passe en cas de problème ».
 * L'incident est la pièce qui manquait : sans elle, l'écran n'offre que des
 * commandes, et il faut savoir LAQUELLE choisir face à un terrain fermé. Avec
 * elle, on part du problème, et les gestes correctifs se proposent.
 *
 * Un incident ne bloque rien par lui-même : il CONSTATE. Ce sont les gestes
 * pris ensuite — interrompre, décaler, retirer une épreuve — qui agissent, et
 * le journal les relie au même incident.
 */
import type { CohortId, IsoDateTime, PersonId } from "@/domain/types";

export type IncidentScope = "cohort" | "placement" | "milestone" | "learner";

export const INCIDENT_SCOPE_LABELS_FR: Record<IncidentScope, string> = {
  cohort: "Toute la promotion",
  placement: "Un terrain de stage",
  milestone: "Un jalon du calendrier",
  learner: "Un apprenant",
};

/** Ce qui arrive vraiment, et qu'on retrouve d'une promotion à l'autre. */
export const INCIDENT_EXEMPLES_FR: Record<IncidentScope, string> = {
  cohort: "Grève des transports, fermeture administrative, panne de la plateforme.",
  placement: "Service fermé pour travaux, encadrant absent, capacité réduite.",
  milestone: "Salle indisponible, intervenant empêché, épreuve reportée.",
  learner: "Arrêt maladie, congé maternité, mobilité interrompue.",
};

export interface ProgramIncident {
  readonly id: string;
  readonly cohortId: CohortId;
  readonly scope: IncidentScope;
  readonly scopeId?: string | null;
  readonly title: string;
  readonly reason: string;
  readonly occurredOn: string;
  readonly resolvedOn?: string | null;
  readonly resolution?: string | null;
  readonly declaredBy?: PersonId | null;
  readonly resolvedBy?: PersonId | null;
  readonly createdAt: IsoDateTime;
}

export type PilotDecisionKind =
  "interruption" | "reprise" | "decalage" | "incident" | "incident_resolu" | "parcours";

export const DECISION_KIND_LABELS_FR: Record<PilotDecisionKind, string> = {
  interruption: "interruption",
  reprise: "reprise",
  decalage: "calendrier",
  incident: "incident",
  incident_resolu: "incident clos",
  parcours: "parcours",
};

export interface PilotDecision {
  readonly id: string;
  readonly cohortId: CohortId;
  readonly kind: PilotDecisionKind;
  readonly summary: string;
  readonly reason: string;
  readonly details: Record<string, unknown>;
  readonly incidentId?: string | null;
  readonly decidedBy?: PersonId | null;
  readonly decidedAt: IsoDateTime;
}

export function incidentsOuverts(
  incidents: readonly ProgramIncident[],
): readonly ProgramIncident[] {
  return incidents.filter((i) => !i.resolvedOn);
}

/**
 * LES GESTES QUE CET INCIDENT APPELLE.
 *
 * C'est le cœur de la proposition : on ne présente pas les mêmes remèdes selon
 * ce qui est cassé. Un terrain fermé ne se répare pas en gelant les rendus de
 * toute la promotion, et un jalon manqué ne demande pas de suspendre qui que
 * ce soit. La liste est ORDONNÉE : le premier geste est celui qu'on prend le
 * plus souvent.
 */
export type GesteCorrectif = "interrompre" | "decaler" | "parcours" | "relancer";

export const GESTE_LABELS_FR: Record<GesteCorrectif, string> = {
  interrompre: "Interrompre le parcours",
  decaler: "Décaler le calendrier",
  parcours: "Retoucher le parcours de la promotion",
  relancer: "Écrire aux personnes concernées",
};

export function gestesPour(scope: IncidentScope): readonly GesteCorrectif[] {
  switch (scope) {
    /* Un terrain fermé touche le stage, pas les cours : on décale, on retouche
       le parcours, on prévient. Suspendre toute la promotion serait excessif. */
    case "placement":
      return ["decaler", "parcours", "relancer"];
    /* Un jalon manqué est une affaire de calendrier, et de prévenance. */
    case "milestone":
      return ["decaler", "relancer"];
    /* Un seul apprenant : rien de collectif ne doit bouger. */
    case "learner":
      return ["relancer", "parcours"];
    /* Toute la promotion : là, l'interruption a un sens. */
    default:
      return ["interrompre", "decaler", "parcours", "relancer"];
  }
}

/** Depuis combien de jours l'incident dure. */
export function joursDepuis(iso: string, aujourdhui: Date = new Date()): number {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((aujourdhui.getTime() - t) / 86_400_000));
}
