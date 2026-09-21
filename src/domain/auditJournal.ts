/**
 * Le journal d'audit, lu en base depuis le 21/09 (`list_audit_events`).
 * Les types d'événements sont ceux qu'écrivent les fonctions serveur ; un type
 * inconnu s'affiche tel quel plutôt que d'être masqué.
 */
export const LIBELLES_EVENEMENT_FR: Readonly<Record<string, string>> = {
  "role_assignment.granted": "Droit accordé",
  "cohort.created": "Promotion créée",
  "cohort.updated": "Promotion modifiée",
  "cohort.archived": "Promotion archivée",
  "cohort.restored": "Promotion désarchivée",
  "curriculum_version.created": "Version du référentiel créée",
  "outcome.updated": "Acquis modifié",
  "program.placements_module": "Module stages ouvert ou fermé",
};

export function libelleEvenement(type: string): string {
  return LIBELLES_EVENEMENT_FR[type] ?? type;
}

/** « 21/09/2026 14:05 », en heure locale. */
export function horodatageFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
