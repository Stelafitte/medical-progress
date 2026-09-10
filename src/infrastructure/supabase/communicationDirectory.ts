/**
 * LE CONNECTEUR DE L'ANNUAIRE DES DESTINATAIRES.
 *
 * POURQUOI CE FICHIER EXISTE PLUTÔT QU'UNE MÉTHODE DE PLUS DANS `DataAccess`.
 * Deux raisons, l'une de fond, l'autre de circonstance.
 *
 * 1. FOND : `program_directory` lit `auth.users` — l'adresse et la dernière
 *    connexion, que la RLS ne rend qu'à leur titulaire. Aucun mock ne peut
 *    simuler honnêtement ce que rend cette fonction : il rendrait un annuaire
 *    plausible là où le vrai dirait « sans compte ». Le dépôt traque partout
 *    ailleurs ce mode de panne ; on ne l'introduit pas ici. Même raisonnement
 *    que `aiCompanion.ts`, qui vit déjà hors du port pour cette raison.
 * 2. CIRCONSTANCE : `supabaseDataAccess.ts` était ouvert dans un autre chantier
 *    le 10/09. Un fichier neuf ne peut pas entrer en conflit.
 *
 * CE QUI N'ARRIVE JAMAIS ICI : L'ADRESSE EN CLAIR. La fonction SQL ne rend
 * qu'un masque (`d***s@chu.fr`). Un écran qui afficherait vingt-sept adresses
 * serait un fichier d'adresses qu'il suffit de copier.
 */
import { getBrowserSupabaseClient } from "@/infrastructure/supabase/client";
import type {
  DirectoryAccountState,
  DirectoryAudience,
  DirectoryRow,
} from "@/domain/communicationDirectory";

function client() {
  const c = getBrowserSupabaseClient();
  if (!c) throw new Error("L'annuaire nécessite une session connectée.");
  return c;
}

/**
 * FORME BRUTE RENDUE PAR `program_directory`, en `snake_case`.
 *
 * ⚠️ C'EST LA MOITIÉ CLIENTE D'UN CONTRAT ÉCRIT DEUX FOIS : l'autre vit dans
 * `supabase/migrations/20260910221000_annuaire_et_garde_fous.sql`, et `tsc` ne
 * la voit pas. Toute modification de la signature SQL doit passer ici dans le
 * même souffle — et la conversion ci-dessous tolère un champ absent plutôt que
 * de s'y fier.
 */
interface DirectoryRowRaw {
  row_key: string;
  kind: string;
  person_id: string | null;
  staging_id: string | null;
  full_name: string | null;
  group_id: string | null;
  group_label: string | null;
  account_state: string | null;
  email_masked: string | null;
  opted_out: boolean | null;
  last_sign_in_at: string | null;
}

const AUDIENCES: readonly string[] = ["learner", "placement_supervisor", "placement_manager"];
const ETATS: readonly string[] = [
  "active",
  "never_signed_in",
  "invited",
  "staged",
  "no_account",
  "no_address",
];

/**
 * Une ligne dont le rôle ou l'état serait inconnu n'est PAS ignorée : elle
 * remonte avec un repli explicite. Filtrer en silence ferait disparaître des
 * gens d'un écran d'envoi — c'est exactement ce qu'on ne veut pas.
 */
function versLigne(brut: DirectoryRowRaw): DirectoryRow {
  const kind = (AUDIENCES.includes(brut.kind) ? brut.kind : "learner") as DirectoryAudience;
  const accountState = (
    brut.account_state && ETATS.includes(brut.account_state) ? brut.account_state : "no_account"
  ) as DirectoryAccountState;
  return {
    rowKey: brut.row_key,
    kind,
    personId: brut.person_id ?? undefined,
    stagingId: brut.staging_id ?? undefined,
    fullName: brut.full_name?.trim() || "Sans nom",
    groupId: brut.group_id ?? undefined,
    groupLabel: brut.group_label?.trim() || "Sans rattachement",
    accountState,
    emailMasked: brut.email_masked ?? "***",
    optedOut: brut.opted_out === true,
    lastSignInAt: brut.last_sign_in_at ?? undefined,
  };
}

/** Les trois populations du programme, vivier compris. */
export async function fetchProgramDirectory(programId: string): Promise<readonly DirectoryRow[]> {
  const { data, error } = await client().rpc("program_directory", { p_program_id: programId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DirectoryRowRaw[]).map(versLigne);
}

/* ------------------------------------------------------------------ */
/* Écriture d'une campagne                                             */
/* ------------------------------------------------------------------ */

export interface NouvelleCampagne {
  readonly programId: string;
  readonly subject: string;
  readonly body: string;
  /** `{ kind: "persons", personIds: [...] }` pour une sélection nominative. */
  readonly audience: Record<string, unknown>;
  readonly templateId?: string | undefined;
  readonly maxRecipients?: number | undefined;
}

/**
 * Crée un BROUILLON, et rien d'autre.
 *
 * Le passage à `running` puis `completed` reste le monopole de `send-campaign` :
 * elle seule a vu le résultat SMTP. C'est la règle posée le 04/09, et la raison
 * pour laquelle aucune policy `insert` n'existe sur `communication_campaigns`.
 */
export async function createCampaign(campagne: NouvelleCampagne): Promise<string> {
  const { data, error } = await client().rpc("create_communication_campaign", {
    p_program_id: campagne.programId,
    p_subject: campagne.subject,
    p_body: campagne.body,
    p_audience: campagne.audience,
    p_template_id: campagne.templateId ?? null,
    p_max_recipients: campagne.maxRecipients ?? 200,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string") throw new Error("La campagne n'a pas été créée.");
  return data;
}

/** Lève le garde-fou 428 de `send-campaign` — un second geste, après le mode essai. */
export async function confirmCampaign(campaignId: string): Promise<void> {
  const { error } = await client().rpc("confirm_communication_campaign", {
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Appels des fonctions edge                                           */
/* ------------------------------------------------------------------ */

/** Récupère le message métier caché derrière une erreur `functions.invoke`. */
async function messageReel(error: unknown): Promise<string> {
  const contexte = (error as { context?: unknown }).context;
  if (contexte instanceof Response) {
    try {
      const corps = (await contexte.clone().json()) as { error?: unknown };
      if (typeof corps.error === "string" && corps.error !== "") return corps.error;
    } catch {
      /* le corps n'est pas du JSON : on retombe sur le message générique */
    }
  }
  return error instanceof Error ? error.message : "La fonction n'a pas répondu.";
}

export interface ResultatEnvoi {
  readonly dryRun: boolean;
  readonly recipientCount?: number;
  readonly sent?: number;
  readonly failed?: number;
  readonly excludedOptedOut?: number;
  readonly excludedNoAddress?: number;
  readonly recipients?: readonly {
    readonly personId: string;
    readonly fullName: string;
    readonly email: string;
    readonly cohortLabel: string;
  }[];
  readonly subjectPreview?: string;
  readonly unresolvedVariables?: readonly string[];
}

export async function runCampaign(campaignId: string, dryRun: boolean): Promise<ResultatEnvoi> {
  const { data, error } = await client().functions.invoke<ResultatEnvoi>("send-campaign", {
    body: { campaignId, dryRun },
  });
  if (error) throw new Error(await messageReel(error));
  if (!data) throw new Error("Réponse vide de send-campaign.");
  return data;
}

export interface ResultatParPersonne {
  readonly personId: string;
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Vivier : les identifiants sont ceux de `people`, PAS de `profiles`.
 *
 * ⚠️ LES DEUX FONCTIONS ATTENDENT UN PARAMÈTRE DU MÊME NOM, `personIds`, ET CE
 * NE SONT PAS LES MÊMES IDENTIFIANTS. `invite-person` lit `people.id` (le sas),
 * `resend-first-login` lit `profiles.id` (les comptes). Se tromper de liste ne
 * donne pas une erreur de type : la fonction répond « introuvable ou hors
 * périmètre » pour chaque ligne, ce qui ressemble à un problème de droits.
 * C'est `planFirstLogin` du domaine qui garantit que chaque identifiant part
 * vers la bonne fonction.
 */
export async function invitePeople(
  peopleIds: readonly string[],
): Promise<readonly ResultatParPersonne[]> {
  const { data, error } = await client().functions.invoke<{
    results: readonly ResultatParPersonne[];
  }>("invite-person", { body: { personIds: peopleIds } });
  if (error) throw new Error(await messageReel(error));
  return data?.results ?? [];
}

/** Comptes existants : `profiles.id`. Renvoie un lien de première connexion. */
export async function resendFirstLogin(
  personIds: readonly string[],
): Promise<readonly ResultatParPersonne[]> {
  const { data, error } = await client().functions.invoke<{
    results: readonly ResultatParPersonne[];
  }>("resend-first-login", { body: { personIds } });
  if (error) throw new Error(await messageReel(error));
  return data?.results ?? [];
}

/* ------------------------------------------------------------------ */
/* Modèles de message                                                  */
/* ------------------------------------------------------------------ */

export interface ModeleMessage {
  readonly id: string;
  readonly label: string;
  readonly subject: string;
  readonly body: string;
  readonly status: string;
}

/**
 * Modèles du programme ET modèles de plateforme (`program_id is null`) : c'est
 * la policy `message_templates_select` qui le prévoit, pas une invention d'ici.
 */
export async function fetchMessageTemplates(programId: string): Promise<readonly ModeleMessage[]> {
  const { data, error } = await client()
    .from("message_templates")
    .select("id, label, subject, body, status, program_id")
    .or(`program_id.eq.${programId},program_id.is.null`)
    .neq("status", "archived")
    .order("label");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: (row.label as string) ?? "Sans titre",
    subject: (row.subject as string) ?? "",
    body: (row.body as string) ?? "",
    status: (row.status as string) ?? "draft",
  }));
}

/**
 * LES SEULES VARIABLES QUE `send-campaign` SAIT RÉSOUDRE.
 *
 * Toute autre est laissée TELLE QUELLE dans le message reçu — choix délibéré de
 * la fonction edge : un `{{prenom}}` visible est un défaut qu'on voit, là où une
 * chaîne vide passe inaperçue. L'écran doit donc afficher cette liste.
 */
export const VARIABLES_CONNUES = ["firstName", "lastName", "programTitle", "cohortTitle"] as const;
