/**
 * ANNUAIRE DES DESTINATAIRES — couche de domaine PURE.
 *
 * Ce module ne connaît ni Supabase, ni React : il décrit ce qu'est une ligne
 * d'annuaire, et surtout QUEL GESTE S'APPLIQUE À ELLE. C'est là tout son
 * intérêt : la règle est testable sans écran et sans base.
 *
 * ⚠️ POURQUOI CE FICHIER N'IMPORTE PAS `RoleName` DE `domain/types.ts`.
 * Le 10/09 au soir, `types.ts` était ouvert dans un autre chantier. Une union
 * locale évite un conflit sur un fichier partagé, et se réconcilie en une ligne
 * le jour où `RoleName` connaîtra `placement_manager`. Les trois valeurs
 * ci-dessous sont un SOUS-ENSEMBLE de `RoleName` : `teacher` et `administrator`
 * n'ont pas leur place dans un écran d'envoi aux apprenants et aux terrains.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Les trois populations de l'écran, dans l'ordre où elles s'affichent. */
export type DirectoryAudience = "learner" | "placement_supervisor" | "placement_manager";

export const AUDIENCE_ORDER: readonly DirectoryAudience[] = [
  "learner",
  "placement_supervisor",
  "placement_manager",
];

export const AUDIENCE_LABELS_FR: Record<DirectoryAudience, string> = {
  learner: "Apprenants",
  placement_supervisor: "Encadrants de stage",
  placement_manager: "Responsables de terrain de stage",
};

/**
 * L'ÉTAT D'UNE LIGNE — le champ qui décide de tout.
 *
 * - `active`          : compte existant, déjà connecté au moins une fois ;
 * - `never_signed_in` : compte existant, jamais utilisé ;
 * - `invited`         : dans le vivier, invitation déjà partie ;
 * - `staged`          : dans le vivier, aucune invitation envoyée ;
 * - `no_account`      : rattaché au programme mais sans compte d'authentification ;
 * - `no_address`      : compte sans adresse — injoignable.
 */
export type DirectoryAccountState =
  "active" | "never_signed_in" | "invited" | "staged" | "no_account" | "no_address";

export const ACCOUNT_STATE_LABELS_FR: Record<DirectoryAccountState, string> = {
  active: "compte actif",
  never_signed_in: "jamais connecté",
  invited: "invité, en attente",
  staged: "à inviter",
  no_account: "sans compte",
  no_address: "sans adresse",
};

export interface DirectoryRow {
  /** Identifiant stable de la ligne, rendu par `program_directory`. */
  readonly rowKey: string;
  readonly kind: DirectoryAudience;
  /** Identifiant de profil — absent tant que la personne n'a pas de compte. */
  readonly personId?: string | undefined;
  /** Identifiant dans le vivier `people` — absent dès qu'elle en a un. */
  readonly stagingId?: string | undefined;
  readonly fullName: string;
  readonly groupId?: string | undefined;
  /** Promotion pour un apprenant, terrain de stage pour les deux autres. */
  readonly groupLabel: string;
  readonly accountState: DirectoryAccountState;
  /** Adresse masquée (`d***s@chu.fr`). Jamais l'adresse en clair. */
  readonly emailMasked: string;
  readonly optedOut: boolean;
  readonly lastSignInAt?: string | undefined;
}

/* ------------------------------------------------------------------ */
/* Regroupement pour l'affichage                                       */
/* ------------------------------------------------------------------ */

export interface DirectoryGroup {
  readonly groupId: string;
  readonly label: string;
  readonly rows: readonly DirectoryRow[];
}

export interface DirectoryBlock {
  readonly kind: DirectoryAudience;
  readonly label: string;
  readonly groups: readonly DirectoryGroup[];
  readonly total: number;
}

/**
 * Trois blocs, chacun découpé par promotion ou par terrain.
 *
 * LES BLOCS VIDES SONT CONSERVÉS. Un écran qui masque « Responsables de terrain »
 * parce qu'il n'y en a aucun ne dit pas qu'il n'y en a aucun : il laisse croire
 * que la notion n'existe pas. Le bloc reste, et affiche son vide.
 */
export function groupDirectory(rows: readonly DirectoryRow[]): readonly DirectoryBlock[] {
  return AUDIENCE_ORDER.map((kind) => {
    const mine = rows.filter((row) => row.kind === kind);
    const byGroup = new Map<string, DirectoryRow[]>();
    for (const row of mine) {
      const key = row.groupId ?? `__sans__${row.groupLabel}`;
      const bucket = byGroup.get(key);
      if (bucket) bucket.push(row);
      else byGroup.set(key, [row]);
    }
    const groups = [...byGroup.entries()]
      .map(([groupId, groupRows]) => ({
        groupId,
        label: groupRows[0]?.groupLabel ?? "Sans rattachement",
        rows: [...groupRows].sort((a, b) => a.fullName.localeCompare(b.fullName, "fr")),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
    return { kind, label: AUDIENCE_LABELS_FR[kind], groups, total: mine.length };
  });
}

/* ------------------------------------------------------------------ */
/* Geste 1 — le mail de première connexion                             */
/* ------------------------------------------------------------------ */

/**
 * DEUX FONCTIONS EDGE DERRIÈRE UN SEUL BOUTON, et c'est l'état qui tranche.
 *
 * `invite-person` travaille sur le VIVIER (`people`) et appelle
 * `generateLink({ type: "invite" })` — cet appel ÉCHOUE si le compte existe déjà.
 * `resend-first-login` fait l'inverse : il vise un compte existant et génère un
 * lien `recovery`. Envoyer l'un à la place de l'autre ne produit pas un message
 * imparfait, il produit une erreur.
 *
 * `no_address` est le seul refus définitif : sans adresse, aucun lien n'a de
 * destination.
 */
export type FirstLoginAction = "invite" | "resend" | "impossible";

export interface FirstLoginDecision {
  readonly action: FirstLoginAction;
  /** Motif affiché à l'écran quand l'action est `impossible`. */
  readonly reason?: string;
}

export function firstLoginActionFor(row: DirectoryRow): FirstLoginDecision {
  if (row.accountState === "no_address")
    return { action: "impossible", reason: "aucune adresse connue" };
  if (row.stagingId) return { action: "invite" };
  if (row.personId) return { action: "resend" };
  return { action: "impossible", reason: "ni compte ni ligne de vivier" };
}

export interface FirstLoginPlan {
  /** Identifiants `people.id` à passer à `invite-person`. */
  readonly toInvite: readonly string[];
  /** Identifiants `profiles.id` à passer à `resend-first-login`. */
  readonly toResend: readonly string[];
  readonly skipped: readonly { readonly row: DirectoryRow; readonly reason: string }[];
}

/**
 * ⚠️ LA DÉDUPLICATION N'EST PAS UNE PRÉCAUTION, C'EST UNE CORRECTION.
 *
 * Depuis que le vivier sait porter plusieurs rôles (10/09), une même personne
 * apparaît dans DEUX blocs — Marina Dijos est encadrante et responsable de
 * terrain. Deux lignes, deux `rowKey` distincts, mais UN SEUL `stagingId`.
 * Sans le `Set` ci-dessous, cocher les deux blocs lui enverrait deux
 * invitations : deux courriels reçus, et deux liens dont un seul reste valide.
 */
export function planFirstLogin(rows: readonly DirectoryRow[]): FirstLoginPlan {
  const toInvite = new Set<string>();
  const toResend = new Set<string>();
  const skipped: { row: DirectoryRow; reason: string }[] = [];
  const vus = new Set<string>();
  for (const row of rows) {
    const decision = firstLoginActionFor(row);
    if (decision.action === "invite" && row.stagingId) toInvite.add(row.stagingId);
    else if (decision.action === "resend" && row.personId) toResend.add(row.personId);
    else {
      /* Une personne écartée deux fois n'est signalée qu'une fois : répéter le
         même motif à l'écran ferait croire à deux problèmes distincts. */
      const cle = row.personId ?? row.stagingId ?? row.rowKey;
      if (!vus.has(cle)) {
        vus.add(cle);
        skipped.push({ row, reason: decision.reason ?? "cas non traité" });
      }
    }
  }
  return { toInvite: [...toInvite], toResend: [...toResend], skipped };
}

/* ------------------------------------------------------------------ */
/* Geste 2 — le message libre                                          */
/* ------------------------------------------------------------------ */

/**
 * ⚠️ LA CONTRAINTE QUI SURPREND, ET QU'IL FAUT DIRE À L'ÉCRAN.
 *
 * `communication_deliveries.person_id` est une clé étrangère vers `profiles`.
 * Une personne du VIVIER n'a pas de profil : aucune ligne de trace ne peut donc
 * exister pour elle, et `send-campaign` ne saura jamais lui écrire. Ce n'est pas
 * un manque à combler par un contournement — c'est la garantie que tout message
 * envoyé laisse une trace attribuable.
 *
 * Conséquence pour l'usage : au vivier on envoie une INVITATION (geste 1), et
 * le message libre devient possible une fois le compte créé. L'écran doit
 * l'expliquer plutôt que d'ignorer silencieusement la moitié d'une sélection.
 */
export type MailBlockReason = "vivier" | "desabonne" | "sans_adresse";

export const MAIL_BLOCK_LABELS_FR: Record<MailBlockReason, string> = {
  vivier: "pas encore de compte — envoyer d'abord une première connexion",
  desabonne: "désabonné des e-mails",
  sans_adresse: "aucune adresse connue",
};

export interface CampaignPlan {
  /** Identifiants `profiles.id` pour l'audience `persons` de `send-campaign`. */
  readonly personIds: readonly string[];
  readonly excluded: readonly { readonly row: DirectoryRow; readonly reason: MailBlockReason }[];
}

/**
 * Même raison que ci-dessus : quelqu'un qui cumule deux rôles ne doit pas
 * recevoir le message en double, ni figurer deux fois dans la liste des exclus.
 */
export function planCampaign(rows: readonly DirectoryRow[]): CampaignPlan {
  const personIds = new Set<string>();
  const excluded: { row: DirectoryRow; reason: MailBlockReason }[] = [];
  const ecartes = new Set<string>();
  const ecarter = (row: DirectoryRow, reason: MailBlockReason) => {
    const cle = row.personId ?? row.stagingId ?? row.rowKey;
    if (ecartes.has(cle)) return;
    ecartes.add(cle);
    excluded.push({ row, reason });
  };
  for (const row of rows) {
    if (!row.personId) ecarter(row, "vivier");
    else if (row.accountState === "no_address") ecarter(row, "sans_adresse");
    else if (row.optedOut) ecarter(row, "desabonne");
    else personIds.add(row.personId);
  }
  return { personIds: [...personIds], excluded };
}

/* ------------------------------------------------------------------ */
/* Sélection                                                           */
/* ------------------------------------------------------------------ */

/** Vrai si toutes les lignes fournies sont sélectionnées (faux si aucune ligne). */
export function allSelected(
  rows: readonly DirectoryRow[],
  selection: ReadonlySet<string>,
): boolean {
  return rows.length > 0 && rows.every((row) => selection.has(row.rowKey));
}

/** Vrai si une partie seulement l'est — l'état intermédiaire d'une case à cocher. */
export function someSelected(
  rows: readonly DirectoryRow[],
  selection: ReadonlySet<string>,
): boolean {
  return rows.some((row) => selection.has(row.rowKey)) && !allSelected(rows, selection);
}

/** Ajoute ou retire un ensemble de lignes d'un coup, sans toucher au reste. */
export function toggleMany(
  selection: ReadonlySet<string>,
  rows: readonly DirectoryRow[],
  next: boolean,
): ReadonlySet<string> {
  const copy = new Set(selection);
  for (const row of rows) {
    if (next) copy.add(row.rowKey);
    else copy.delete(row.rowKey);
  }
  return copy;
}

/** Les lignes retenues, dans l'ordre de l'annuaire. */
export function selectedRows(
  rows: readonly DirectoryRow[],
  selection: ReadonlySet<string>,
): readonly DirectoryRow[] {
  return rows.filter((row) => selection.has(row.rowKey));
}
