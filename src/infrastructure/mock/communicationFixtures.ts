/**
 * Fixtures LOCALES du module de communication (démonstration uniquement).
 *
 * Aucune de ces données n'est envoyée, persistée ni synchronisée. Les modèles
 * sont transversaux : `programId: null` = modèle de plateforme réutilisable par
 * DIU, DFASM, DPC ou tout autre programme configuré.
 */
import type { CommMessageTemplate, CommunicationPreference } from "@/domain/communication";
import type { PersonId } from "@/domain/types";

export const communicationTemplates: readonly CommMessageTemplate[] = [
  {
    id: "tpl-annonce-ouverture",
    programId: null,
    category: "announcement",
    allowedChannels: ["email", "in_app"],
    subject: "{{programTitle}} — ouverture de votre espace",
    body:
      "Bonjour {{firstName}} {{lastName}},\n\n" +
      "Votre espace {{programTitle}} ({{cohortTitle}}) est ouvert : {{accessLink}}.\n\n" +
      "{{coordinatorName}}",
    declaredVariables: [
      "firstName",
      "lastName",
      "programTitle",
      "cohortTitle",
      "accessLink",
      "coordinatorName",
    ],
    version: 1,
    provenance: { sourceSystem: "native" },
    status: "validated",
  },
  {
    id: "tpl-relance-echeance",
    programId: null,
    category: "reminder",
    allowedChannels: ["email", "in_app"],
    subject: "Rappel — échéance du {{nextDeadline}}",
    body:
      "Bonjour {{firstName}},\n\n" +
      "Une échéance de {{programTitle}} est fixée au {{nextDeadline}}.\n" +
      "Accès : {{accessLink}}\n\n{{coordinatorName}}",
    declaredVariables: [
      "firstName",
      "programTitle",
      "nextDeadline",
      "accessLink",
      "coordinatorName",
    ],
    version: 2,
    provenance: { sourceSystem: "native" },
    status: "validated",
  },
  {
    id: "tpl-convocation-seance",
    programId: null,
    category: "convocation",
    allowedChannels: ["email"],
    subject: "Convocation — {{programTitle}}",
    body:
      "Bonjour {{firstName}},\n\n" +
      "Vous êtes convoqué(e) pour une séance de {{programTitle}} ({{cohortTitle}}).\n" +
      "Détails et documents : {{accessLink}}\n\n{{coordinatorName}}",
    declaredVariables: [
      "firstName",
      "programTitle",
      "cohortTitle",
      "accessLink",
      "coordinatorName",
    ],
    version: 1,
    provenance: { sourceSystem: "native" },
    status: "validated",
  },
  {
    id: "tpl-brouillon-non-valide",
    programId: null,
    category: "free",
    allowedChannels: ["email"],
    subject: "Brouillon non validé",
    body: "Ce modèle est au statut brouillon : il bloque volontairement l'approbation.",
    declaredVariables: [],
    version: 1,
    provenance: { sourceSystem: "native" },
    status: "draft",
  },
];

/**
 * Préférences de canal SIMULÉES : la démonstration exige au moins un opt-out
 * pour rendre visible le retrait automatique d'un destinataire.
 */
export function buildDemoPreferences(
  personIds: readonly PersonId[],
): readonly CommunicationPreference[] {
  const target = [...personIds].sort()[0];
  if (target === undefined) return [];
  return [
    {
      personId: target,
      channel: "email",
      optedOut: true,
      source: "learner",
      updatedAt: "2026-01-05T00:00:00.000Z",
    },
  ];
}
