/**
 * LE SIGNALEMENT D'UNE QUESTION — vocabulaire partagé étudiant / équipe.
 *
 * L'étudiant signale depuis la correction (motif + message libre) ; le
 * signalement remonte à TOUTE l'équipe d'encadrement du programme —
 * responsables de stage et administrateurs compris (décision de Stef,
 * 15/09) — et n'importe lequel d'entre eux le traite. Les valeurs sont
 * celles des contraintes CHECK de `question_reports`.
 */

export const RAISONS_SIGNALEMENT: readonly { readonly value: string; readonly label: string }[] = [
  { value: "erreur", label: "La réponse me semble fausse" },
  { value: "recommandation", label: "Une recommandation plus récente dit autre chose" },
  { value: "ambigu", label: "L'énoncé ou une proposition est ambigu" },
  { value: "hors_programme", label: "Hors programme" },
  { value: "autre", label: "Autre" },
];

export const libelleRaison = (value: string): string =>
  RAISONS_SIGNALEMENT.find((r) => r.value === value)?.label ?? value;

/** Les décisions possibles de l'équipe, dans l'ordre où on les propose. */
export const DECISIONS_SIGNALEMENT = [
  {
    value: "en_revue",
    label: "Prendre en charge",
    aide: "je regarde, le signalement reste ouvert",
  },
  { value: "corrige", label: "Corrigé", aide: "la question a été corrigée dans la banque" },
  { value: "confirme", label: "Confirmé", aide: "la question est juste, la réponse tient" },
  { value: "rejete", label: "Rejeté", aide: "signalement sans suite" },
] as const;

export const STATUTS_SIGNALEMENT_FR: Readonly<Record<string, string>> = {
  nouveau: "Nouveau",
  en_revue: "En cours",
  corrige: "Corrigé",
  confirme: "Confirmé",
  rejete: "Rejeté",
};

/** Un signalement « à traiter » attend encore une décision finale. */
export const estATraiter = (status: string): boolean =>
  status === "nouveau" || status === "en_revue";
