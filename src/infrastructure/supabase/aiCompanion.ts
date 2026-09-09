import { getBrowserSupabaseClient } from "@/infrastructure/supabase/client";

/**
 * LE CONNECTEUR DU COMPAGNON IA.
 *
 * POURQUOI CE FICHIER EXISTE, ET PAS UNE METHODE DE PLUS DANS LE DEPOT.
 * `ai-companion-chat` n'est pas une lecture de donnees : c'est un appel
 * facture, lent, et qui peut echouer a mi-parcours. Le passer par le port
 * `DataAccess` obligerait a decrire dans le mock un comportement qu'aucun mock
 * ne peut simuler honnetement — et le depot rendrait alors du faux succes,
 * exactement le mode de panne que ce projet traque partout ailleurs.
 *
 * LE DEPLIAGE DE `error.context` EST INDISPENSABLE. `functions.invoke` ne
 * rend, sur une reponse non-2xx, qu'un generique « Edge Function returned a
 * non-2xx status code ». Le message metier — plafond atteint, IA fermee, fil
 * introuvable — est dans le corps de la reponse, accessible seulement par
 * `error.context`. Sans ce depliage, toute erreur de l'assistant devient
 * indistinctement « ca ne marche pas ».
 */

/**
 * CE TYPE EST LA MOITIE CLIENTE D'UN CONTRAT ECRIT DEUX FOIS.
 *
 * L'autre moitie vit dans `supabase/functions/ai-companion-chat/index.ts`, et
 * RIEN NE VERIFIE QUE LES DEUX CONCORDENT : la fonction edge se deploie a part,
 * `tsc` ne la voit pas. Le 09/09, la bascule sur le texte 2026 a change le
 * format des citations cote serveur sans toucher a ce type : le champ
 * `resourceTitle` arrivait `undefined`, `titreLisible` appelait `.includes` sur
 * rien, et l'exception pendant le rendu TUAIT LA PAGE — Safari affichait
 * « Page did not load » en plein ecran, sans rien qui pointe vers la cause.
 *
 * TOUTE MODIFICATION DE CE TYPE DOIT ETRE FAITE DANS LE MEME SOUFFLE QUE LA
 * FONCTION EDGE, et l'ecran doit tolerer un champ absent plutot que de s'y fier.
 */
export type AiCitation = {
  /** Section de `course_sections` citee par le modele. */
  readonly sectionId: string;
  /** Libelle d'affichage : « I.E.1 — Epidemiologie ». Peut etre vide. */
  readonly label: string;
  readonly excerpt?: string;
};

export type AiAnswer = {
  readonly answer: string;
  readonly citations: readonly AiCitation[];
  readonly grounded: boolean;
  readonly credits: number;
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number };
};

export type AiThreadScope = "knowledge" | "competence";

function client() {
  const c = getBrowserSupabaseClient();
  if (!c) throw new Error("L'assistant nécessite une session connectée.");
  return c;
}

/** Récupère le message métier caché derrière une erreur `functions.invoke`. */
async function messageReel(error: unknown): Promise<string> {
  const contexte = (error as { context?: unknown }).context;
  if (contexte instanceof Response) {
    try {
      const corps = (await contexte.clone().json()) as { error?: unknown };
      if (typeof corps.error === "string" && corps.error !== "") return corps.error;
    } catch {
      /* le corps n'est pas du JSON : on retombe sur le message generique */
    }
  }
  return error instanceof Error ? error.message : "L'assistant n'a pas répondu.";
}

/**
 * Ouvre un fil, ou rend celui qui existe deja pour cet acquis.
 *
 * `start_ai_thread` leve si le programme n'a pas de `program_ai_settings`
 * activee : c'est voulu, l'IA est FERMEE PAR DEFAUT. Le message remonte tel
 * quel a l'ecran plutot que d'etre traduit en « une erreur est survenue ».
 */
export async function startAiThread(input: {
  enrollmentId: string;
  scope: AiThreadScope;
  title: string;
  outcomeId?: string;
}): Promise<string> {
  const { data, error } = await client().rpc("start_ai_thread", {
    p_enrollment_id: input.enrollmentId,
    p_scope: input.scope,
    p_title: input.title,
    p_outcome_id: input.outcomeId ?? null,
  });
  if (error) throw new Error(error.message);
  const fil = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
  if (!fil?.id) throw new Error("Le fil n'a pas pu être ouvert.");
  return fil.id;
}

/**
 * Ouvre un fil sur un CHAPITRE plutot que sur un acquis (09/09).
 *
 * Fonction distincte et non un parametre de plus sur `start_ai_thread` : un
 * parametre supplementaire aurait cree une surcharge en base, et PostgREST ne
 * saurait plus laquelle des deux appeler. Le fil ainsi cree porte un
 * `resource_id` et AUCUN `outcome_id` — c'est exactement ce que la fonction edge
 * lit pour choisir entre le chapitre entier et les sections d'un acquis.
 */
export async function startAiThreadForResource(input: {
  enrollmentId: string;
  resourceId: string;
  title: string;
}): Promise<string> {
  const { data, error } = await client().rpc("start_ai_thread_for_resource", {
    p_enrollment_id: input.enrollmentId,
    p_resource_id: input.resourceId,
    p_title: input.title,
  });
  if (error) throw new Error(error.message);
  const fil = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
  if (!fil?.id) throw new Error("Le fil n'a pas pu être ouvert.");
  return fil.id;
}

/** Envoie un tour. `newSubject` force une nouvelle recherche dans le corpus. */
export async function askCompanion(input: {
  threadId: string;
  question: string;
  mode?: string;
  newSubject?: boolean;
}): Promise<AiAnswer> {
  const { data, error } = await client().functions.invoke<AiAnswer>("ai-companion-chat", {
    body: {
      threadId: input.threadId,
      question: input.question,
      mode: input.mode ?? "ask",
      newSubject: input.newSubject ?? false,
    },
  });
  if (error) throw new Error(await messageReel(error));
  if (!data) throw new Error("L'assistant n'a rien renvoyé.");
  return data;
}
