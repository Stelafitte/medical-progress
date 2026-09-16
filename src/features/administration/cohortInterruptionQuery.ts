/**
 * LES CLÉS DE REQUÊTE DU PILOTAGE, dans leur propre fichier.
 *
 * Le Pilotage et chacun de ses panneaux lisent les MÊMES listes : deux clés
 * différentes donneraient deux vérités, et le bandeau de l'un resterait en
 * place quand l'autre vient de reprendre la promotion ou de clore l'incident.
 */
export function cleInterruptions(cohortId: string) {
  return ["interruptions-de-promotion", cohortId] as const;
}

export function cleIncidents(cohortId: string) {
  return ["incidents-de-promotion", cohortId] as const;
}

export function cleJournal(cohortId: string) {
  return ["journal-de-pilotage", cohortId] as const;
}
