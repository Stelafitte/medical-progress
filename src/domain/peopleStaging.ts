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

/**
 * Révision d'une personne du sas.
 *
 * Convention du projet : un champ absent est INCHANGÉ. Mais `null` est une
 * valeur pour l'identifiant institutionnel comme pour la promotion — « cette
 * personne n'en a pas » n'est pas « ne touche pas à ce champ ». D'où les deux
 * drapeaux : sans eux, on pourrait rattacher une personne à une promotion et
 * ne jamais pouvoir l'en détacher. C'est le piège déjà rencontré le 01/09 sur
 * `week_offset_end`, et la règle qui en découle : si `null` veut dire quelque
 * chose, il faut un drapeau pour l'écrire.
 *
 * `programId` n'y figure pas : déplacer une personne d'un programme à l'autre
 * laisserait son inscription, ses déclarations et son carnet rattachés au
 * premier.
 */
export interface UpdatePendingPersonInput {
  readonly personId: PendingPersonId;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly loginEmail?: string;
  readonly institutionalId?: string;
  readonly clearInstitutionalId?: boolean;
  readonly intendedCohortId?: CohortId;
  readonly clearIntendedCohortId?: boolean;
}

export type PendingPersonIssue =
  | "prenom_manquant"
  | "nom_manquant"
  | "email_invalide"
  | "email_fige_apres_activation"
  | "promotion_figee_apres_activation"
  | "retrait_impossible_apres_activation";

export const PENDING_PERSON_ISSUE_LABELS_FR: Record<PendingPersonIssue, string> = {
  prenom_manquant: "Le prénom est obligatoire.",
  nom_manquant: "Le nom est obligatoire.",
  email_invalide: "L'adresse de connexion n'est pas une adresse e-mail.",
  email_fige_apres_activation:
    "Le compte est déjà activé : changer l'adresse ici ne changerait pas son identifiant de connexion.",
  promotion_figee_apres_activation:
    "Le compte est déjà activé : son inscription existe et ne suivrait pas ce changement de promotion.",
  retrait_impossible_apres_activation:
    "Le compte est déjà activé : son inscription existe, elle se retire depuis la promotion.",
};

/** La forme que la base exige : `check (login_email = lower(btrim(login_email)))`. */
export function normalizeLoginEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Ce qui empêche d'enregistrer une révision. Liste vide = enregistrable.
 *
 * Les deux règles d'activation ne sont pas de la prudence : une fois le compte
 * activé, l'adresse de connexion vit dans `auth.users` et l'inscription dans
 * `enrollments`. Modifier la ligne du sas ne toucherait ni l'une ni l'autre —
 * l'écran afficherait une valeur que rien ne suit.
 */
export function validatePendingPersonUpdate(
  person: PendingPerson,
  input: UpdatePendingPersonInput,
): readonly PendingPersonIssue[] {
  const issues: PendingPersonIssue[] = [];

  if (input.firstName !== undefined && input.firstName.trim() === "")
    issues.push("prenom_manquant");
  if (input.lastName !== undefined && input.lastName.trim() === "") issues.push("nom_manquant");

  if (input.loginEmail !== undefined) {
    const email = normalizeLoginEmail(input.loginEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push("email_invalide");
    else if (person.status === "activated" && email !== person.loginEmail) {
      issues.push("email_fige_apres_activation");
    }
  }

  if (person.status === "activated") {
    const clears = input.clearIntendedCohortId === true && person.intendedCohortId !== undefined;
    const moves =
      input.intendedCohortId !== undefined && input.intendedCohortId !== person.intendedCohortId;
    if (clears || moves) issues.push("promotion_figee_apres_activation");
  }

  return issues;
}

/** Ce qui empêche de retirer une personne du sas, s'il y a lieu. */
export function pendingPersonRemovalIssue(person: PendingPerson): PendingPersonIssue | undefined {
  // La base le refuserait de toute façon : `people_status_activation_coherent`
  // lie le statut « activée » à la présence du profil. Le dire ici évite
  // d'envoyer une écriture dont on connaît déjà le sort.
  return person.status === "activated" ? "retrait_impossible_apres_activation" : undefined;
}

/**
 * Le statut à rendre à une personne qu'on remet dans la liste.
 *
 * Une invitation déjà partie ne se départ pas : la ramener à « en attente
 * d'envoi » ferait croire qu'aucun e-mail n'a été envoyé, et le bouton
 * proposerait de l'envoyer une première fois alors qu'il s'agirait d'un renvoi.
 */
export function statusAfterRestore(person: PendingPerson): PendingPersonStatus {
  return person.invitedAt === undefined ? "pending" : "invited";
}
