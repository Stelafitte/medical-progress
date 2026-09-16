/**
 * LA CLÉ DE REQUÊTE des interruptions d'une promotion, dans son propre fichier.
 *
 * Le Pilotage et le panneau d'interruption lisent la MÊME liste : deux clés
 * différentes donneraient deux vérités, et le bandeau de l'un resterait en
 * place quand l'autre vient de reprendre la promotion.
 */
export function cleInterruptions(cohortId: string) {
  return ["interruptions-de-promotion", cohortId] as const;
}
