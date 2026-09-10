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
  /**
   * `sync` : rapportee par une source d equipe externe (UMCV, 10/09). Le type
   * l ignorait alors que la base l accepte depuis la migration
   * 20260910160000 -- une valeur qui existe en base et pas dans le type est un
   * mensonge qui finit par surprendre a l ecran.
   */
  readonly origin: "individual" | "import" | "sync";
  readonly intendedCohortId?: CohortId;
  /**
   * CE QUE LA PERSONNE DEVIENDRA A L ACTIVATION de son compte (migration
   * 20260910200000). `placement_supervisor` : elle sera encadrante du terrain
   * et rattachee a TOUS ses groupes, sans geste d administration.
   */
  readonly intendedRole?: "learner" | "placement_supervisor";
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

/**
 * Une personne déjà présente dans ce programme avec la même adresse.
 *
 * La base a le dernier mot — contrainte `people_program_id_login_email_key` —
 * mais elle répond « duplicate key value violates unique constraint », ce qui
 * ne dit à personne QUI occupe l'adresse ni ce qu'il faut faire. Ce contrôle
 * sert à le dire AVANT d'écrire ; il ne remplace pas la contrainte, il la rend
 * lisible.
 *
 * L'unicité couvre TOUTES les lignes du programme : une personne annulée, ou
 * rattachée à une autre promotion, occupe l'adresse tout autant. C'est
 * précisément le cas où l'écran doit orienter plutôt que refuser sèchement.
 */
export function findPersonByLoginEmail(
  people: readonly PendingPerson[],
  loginEmail: string,
): PendingPerson | undefined {
  const email = normalizeLoginEmail(loginEmail);
  return people.find((person) => person.loginEmail === email);
}

/**
 * Ce que dit une erreur d'écriture de la base, en français.
 *
 * Recopier `reason.message` mettait « duplicate key value violates unique
 * constraint "people_program_id_login_email_key" » sous les yeux de
 * l'utilisateur. Le message d'origine reste en dessous : quand une erreur n'est
 * pas reconnue, la masquer serait pire que la montrer.
 */
export function describePendingPersonWriteError(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason);
  if (raw.includes("people_program_id_login_email_key")) {
    return "Cette adresse de connexion est déjà utilisée par une personne de ce programme — y compris si elle a été retirée ou si elle est rattachée à une autre promotion.";
  }
  if (raw.includes("people_cohort_same_program")) {
    return "Cette promotion n'appartient pas au programme de la personne.";
  }
  if (raw.includes("login_email")) {
    return "L'adresse de connexion n'est pas acceptée : elle doit être en minuscules, sans espaces autour.";
  }
  return raw;
}
