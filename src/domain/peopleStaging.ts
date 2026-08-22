/**
 * Sas de pré-inscription réel (table `people`, décision D94).
 *
 * Distinct du modèle `Person` (un compte `profiles` déjà activé) : une ligne
 * ici représente une personne créée par un membre du programme mais qui ne
 * s'est pas encore connectée pour de vrai. Voir
 * docs/database/draft/004_people_pre_account.sql et
 * docs/database/draft/005_people_activation_link.sql pour le schéma complet.
 */
import type { CohortId, IsoDateTime, PersonId, ProgramId } from "@/domain/types";

export type PendingPersonId = string;

/**
 * Cycle de vie de l'INVITATION, distinct du statut de compte réel :
 *   pending   : créée, aucun e-mail envoyé pour l'instant ;
 *   invited   : e-mail d'invitation envoyé, en attente de première connexion ;
 *   activated : première connexion réelle effectuée ;
 *   cancelled : invitation annulée avant toute connexion.
 */
export type PendingPersonStatus = "pending" | "invited" | "activated" | "cancelled";

export interface PendingPerson {
  readonly id: PendingPersonId;
  readonly programId: ProgramId;
  readonly firstName: string;
  readonly lastName: string;
  readonly loginEmail: string;
  readonly institutionalId?: string;
  readonly origin: "individual" | "import";
  readonly intendedCohortId?: CohortId;
  readonly status: PendingPersonStatus;
  readonly invitedAt?: IsoDateTime;
  readonly cancelledAt?: IsoDateTime;
  readonly activatedProfileId?: PersonId;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface CreatePendingPersonInput {
  readonly programId: ProgramId;
  readonly firstName: string;
  readonly lastName: string;
  readonly loginEmail: string;
  readonly institutionalId?: string;
  readonly intendedCohortId?: CohortId;
}

export interface SendInvitationOutcome {
  readonly personId: PendingPersonId;
  readonly ok: boolean;
  readonly error?: string;
}

export const PENDING_PERSON_STATUS_LABELS_FR: Record<PendingPersonStatus, string> = {
  pending: "en attente d'envoi",
  invited: "invitée",
  activated: "activée",
  cancelled: "annulée",
};

export function fullNameOfPendingPerson(person: PendingPerson): string {
  return `${person.firstName} ${person.lastName}`.trim();
}
