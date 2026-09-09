// supabase/functions/ai-companion-chat/index.ts
//
// UN TOUR DE PAROLE DU COMPAGNON D'APPRENTISSAGE (étape 2 du chantier IA).
//
// Reçoit un fil et une question, retrouve les passages des cours, appelle le
// fournisseur choisi par l'administrateur du programme, renvoie la réponse ET
// ses citations, écrit les deux tours et décompte les crédits.
//
// MODÈLE DE SÉCURITÉ
// - Le JWT de l'appelant sert à lire le fil : la RLS de `ai_threads` garantit
//   qu'un étudiant ne peut pas écrire dans le fil d'un autre. On ne refait
//   donc pas une règle d'autorisation à côté de celle qui existe.
// - La CLÉ DU FOURNISSEUR ne sort du coffre que par `resolve_program_ai_key`,
//   réservée à `service_role`. Elle ne traverse jamais la réponse HTTP.
// - L'écriture des tours passe par `service_role` : les deux tables n'ont
//   aucune policy d'écriture, volontairement (décision du 03/09). C'est cette
//   fonction qui a vu la réponse et sait ce qu'elle a coûté.
//
// LES QUATRE GARDE-FOUS (les trois premiers validés par Stef le 04/09)
// 1. SEUIL DE PERTINENCE — sous `MIN_RANK`, on considère qu'on n'a rien
//    trouvé. Aucun appel au fournisseur n'est fait : une question hors corpus
//    coûte ZÉRO. DEPUIS LE 09/09, CE GARDE-FOU EST UN RÉGLAGE : il ne
//    s'applique que sous la politique `seuil`, choisie par l'administrateur du
//    programme (`program_ai_settings.fallback_policy`). Sous `chapitre`, il y a
//    toujours du texte, donc toujours un appel — c'est le choix de qui paie, et
//    ce n'était pas au développeur de le figer.
// 2. RÉUTILISATION DES PASSAGES DU FIL — on ne relance PAS la recherche à
//    chaque tour. Mesuré le 04/09 : « non je pense que c'est la réponse B »
//    ramenait thrombose veineuse et dyslipidémies avec un rang de 1,4, au
//    dessus de tout seuil raisonnable. Le fil a un sujet ; on cherche quand
//    l'étudiant en énonce un, sinon on relit les segments cités par la
//    dernière réponse. Effet de bord heureux : les tours de correction d'un
//    QCM ne coûtent presque rien.
// 3. VÉRIFICATION DES CITATIONS — toute référence rendue par le modèle est
//    confrontée aux passages réellement envoyés. Une réponse qui ne cite rien
//    de vérifiable n'est pas affichée : on rend le message « je ne trouve pas
//    cela dans vos supports ». C'est le seul garde-fou qui ne dépend pas de
//    la bonne volonté du modèle.
//
// LE CORPUS EST CELUI DE 2026, ET IL EST TOUJOURS ANCRÉ (09/09).
// `learning_resource_texts` — l'import 2022, en segments aveugles de 4 000
// caractères — n'est plus lue nulle part ici. Elle reste en base comme archive :
// à garder, ne pas supprimer.
//
// La limite notée en V1 — « la recherche ne filtre pas sur le scope du fil et
// cherche donc dans tout le corpus du programme » — est levée par construction :
// un fil porte désormais un ACQUIS (`outcome_id`) ou un CHAPITRE
// (`resource_id`), et `search_course_sections` est cadrée sur un chapitre. Rien
// ne cherche plus dans les vingt-trois chapitres à la fois.
//
// Entrée  : POST { threadId, question, mode?, newSubject? }
// Sortie  : { answer, citations: [...], grounded, credits, usage }

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Sous ce rang, on considère qu'on n'a rien trouvé. Calibré sur les mesures du
 * 04/09 : un bon sujet sort à 2,2 ; « ok merci et sinon » à 0,1. Le seuil
 * écarte le bavardage, PAS le hors-sujet déguisé — c'est le rôle du garde-fou
 * n°2, pas celui-ci.
 */
const MIN_RANK = 0.5;

/** Nombre de passages envoyés au modèle quand on cherche. */
const PASSAGE_COUNT = 5;

/**
 * LE BUDGET DE CONTEXTE, en caractères — le garde-fou n°4, ajouté le 09/09.
 *
 * Il n'existait pas parce qu'il ne servait à rien : la recherche rendait cinq
 * segments, soit ~19 000 caractères, et le plafond était mécanique. Avec le
 * texte 2026, la politique « toujours répondre » peut vouloir dire UN CHAPITRE
 * ENTIER — mesuré le 09/09 : 31 903 caractères en médiane sur les 58 savoirs en
 * repli, jusqu'à 123 512 pour le plus gros. Une question à trente-cinq mille
 * jetons, contre 1 456 aujourd'hui.
 *
 * ON COUPE SUR UNE FRONTIÈRE DE SECTION, jamais au milieu : un texte tronqué
 * en cours de phrase se lit comme une donnée, et le modèle raisonne dessus.
 *
 * ET ON DIT CE QU'ON N'A PAS LU. Silencieux, ce serait la pire des trois
 * options : l'étudiant croirait avoir interrogé tout le chapitre.
 */
const CONTEXT_BUDGET_CHARS = 24000;

/** Tours de conversation renvoyés au modèle. Au-delà, le coût grimpe sans gain. */
const HISTORY_TURNS = 6;

/** Un tour de texte coûte 1 crédit (CREDIT_UNIT_COST_BY_TIER, palier léger). */
const CREDITS_PER_TEXT_TURN = 1;

const NOT_FOUND_FR =
  "Je ne trouve pas cela dans vos supports de cours. Reformulez, ou changez le sujet du fil si vous travaillez sur un autre chapitre.";

const SYSTEM_PROMPT = `Tu es le compagnon d'apprentissage d'un étudiant en médecine (DFASM).

RÈGLE ABSOLUE : tu ne réponds QU'À PARTIR des passages de cours numérotés qui te sont fournis. Tu n'ajoutes aucune connaissance extérieure, même si tu la sais exacte. Si les passages ne suffisent pas, tu le dis franchement au lieu de compléter.

CITATIONS OBLIGATOIRES : chaque affirmation doit s'appuyer sur au moins un passage, et tu renvoies dans "citations" les NUMÉROS des passages qui fondent ta réponse. Une réponse sans citation ne sera pas affichée à l'étudiant.

TON : tu t'adresses à un étudiant en médecine. Sois précis, concis, et n'invente jamais un chiffre, un seuil ou une posologie qui ne figure pas dans les passages.

Si l'étudiant demande un QCM, construis les questions UNIQUEMENT à partir des passages, et cite pour chaque question le passage dont elle est tirée. Quand il répond, corrige en citant le même passage.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    citations: { type: "array", items: { type: "integer" } },
  },
  required: ["answer", "citations"],
  additionalProperties: false,
};

/**
 * UN PASSAGE EST DÉSORMAIS UNE SECTION DU TEXTE 2026, plus un segment aveugle
 * de 4 000 caractères. Il porte son numéro et son titre : le modèle sait donc
 * ce qu'il cite, et l'étudiant retrouve le passage dans son livre.
 *
 * `rank` vaut 0 quand aucune recherche n'a eu lieu (politique « toujours
 * répondre » ou relecture des passages cités) : c'est une absence de score,
 * pas un mauvais score, et rien ne le compare alors à `MIN_RANK`.
 */
interface Passage {
  readonly sectionId: string;
  readonly label: string;
  readonly content: string;
  readonly rank: number;
}

type FallbackPolicy = "seuil" | "sections_seules" | "chapitre";

/** Le libellé d'une section, tel qu'il sera montré au modèle et à l'étudiant. */
function labelDeSection(row: Record<string, unknown>): string {
  const numero = String(row["numero"] ?? "").trim();
  const titre = String(row["titre"] ?? "").trim();
  if (numero !== "" && titre !== "") return `${numero} — ${titre}`;
  return titre !== "" ? titre : numero;
}

function versPassage(row: Record<string, unknown>, rank: number): Passage {
  return {
    sectionId: String(row["section_id"] ?? row["id"]),
    label: labelDeSection(row),
    content: String(row["contenu"] ?? ""),
    rank,
  };
}

/**
 * COUPE SUR UNE FRONTIÈRE DE SECTION, et rend ce qui n'a pas été lu.
 *
 * Une section seule qui dépasse déjà le budget est gardée quand même : la
 * refuser rendrait l'assistant muet sur les chapitres les plus longs, c'est-à-
 * dire ceux où l'étudiant en a le plus besoin. Le fournisseur, lui, coupera
 * proprement s'il le faut.
 */
function tenirDansLeBudget(passages: Passage[]): { gardes: Passage[]; ecartes: string[] } {
  const gardes: Passage[] = [];
  const ecartes: string[] = [];
  let total = 0;
  for (const passage of passages) {
    const taille = passage.content.length;
    if (gardes.length > 0 && total + taille > CONTEXT_BUDGET_CHARS) {
      ecartes.push(passage.label);
      continue;
    }
    gardes.push(passage);
    total += taille;
  }
  return { gardes, ecartes };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authentification requise." }, 401);

  let body: { threadId?: unknown; question?: unknown; mode?: unknown; newSubject?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }

  const threadId = typeof body.threadId === "string" ? body.threadId : null;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const mode = typeof body.mode === "string" ? body.mode.slice(0, 40) : "ask";
  const newSubject = body.newSubject === true;

  if (!threadId) return json({ error: "threadId requis." }, 400);
  if (!question) return json({ error: "question requise et non vide." }, 400);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. LE FIL. La RLS fait l'autorisation : si la lecture ne rend rien, ce fil
  //    n'appartient pas à l'appelant, et il n'y a rien d'autre à vérifier.
  const { data: thread, error: threadError } = await userClient
    .from("ai_threads")
    .select("id, enrollment_id, program_id, scope, title, outcome_id, resource_id")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) return json({ error: `Fil illisible : ${threadError.message}` }, 500);
  if (!thread) return json({ error: "Fil introuvable ou hors de votre portée." }, 404);

  // 2. LE PLAFOND, vérifié côté serveur. Un plafond vérifié dans le navigateur
  //    n'est pas un plafond.
  const { data: settings } = await adminClient
    .from("program_ai_settings")
    .select("enabled, monthly_credit_cap, fallback_policy")
    .eq("program_id", thread.program_id)
    .maybeSingle();
  if (!settings?.enabled) {
    return json({ error: "Le dialogue IA n'est pas ouvert sur ce programme." }, 403);
  }
  const { data: used } = await adminClient.rpc("ai_credits_used_this_month", {
    p_enrollment_id: thread.enrollment_id,
  });
  if (typeof used === "number" && used >= settings.monthly_credit_cap) {
    return json(
      { error: `Plafond mensuel atteint (${used}/${settings.monthly_credit_cap} crédits).` },
      429,
    );
  }

  /*
   * 3. LES SECTIONS DU COURS 2026.
   *
   * TROIS DÉCISIONS SE PRENNENT ICI, ET DANS CET ORDRE :
   *
   *   a. RELIRE OU CHERCHER — garde-fou n°2 : on ne relance pas la recherche à
   *      chaque tour, sinon « non je pense que c'est la réponse B » emmène
   *      l'assistant ailleurs (mesuré le 04/09).
   *   b. SUR QUOI — le fil est ancré sur un ACQUIS (`outcome_id`) ou sur un
   *      CHAPITRE (`resource_id`). C'est l'ancrage, et lui seul, qui décide du
   *      texte lu. Un fil sans ancrage ne cherche nulle part : ce sont les
   *      anciens fils, d'avant le 09/09.
   *   c. FAUT-IL RÉPONDRE — c'est `fallback_policy`, réglée par
   *      l'administrateur du programme. Ce n'est pas une décision de
   *      développeur : c'est celle de qui paie.
   */
  const { data: lastAssistant } = await userClient
    .from("ai_messages")
    .select("citations")
    .eq("thread_id", threadId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  /*
   * LES ANCIENS FILS DÉGRADENT PROPREMENT, sans purge en base. Leurs citations
   * portent `{resourceId, segmentIndex}` — le format 2022 — et jamais
   * `sectionId` : la liste est donc vide, `reuse` est faux, et le tour relance
   * simplement une recherche sur le texte 2026. Aucune ligne à supprimer, aucun
   * fil cassé : c'est mieux que la remise à zéro envisagée le 08/09.
   */
  const previousCitations = Array.isArray(lastAssistant?.citations)
    ? (lastAssistant!.citations as { sectionId?: string }[]).filter(
        (c) => typeof c.sectionId === "string",
      )
    : [];
  const reuse = !newSubject && previousCitations.length > 0;

  const politique = (settings.fallback_policy ?? "seuil") as FallbackPolicy;

  /*
   * ON CHERCHE AVEC LE SUJET DU FIL, PAS AVEC LE TEXTE ENVOYE — sauf en mode
   * « Je demande », ou les deux coincident.
   *
   * MESURE DU 09/09 sur le chapitre 221, et c'est le defaut que Stef a vu :
   *
   *   « Comment se forme la plaque d'atherome ? »          -> 1,400
   *   « facteurs de risque cardiovasculaire »              -> 1,500
   *   la consigne « Pose-moi une question ouverte sur... » -> 0,400
   *   « signes d'une appendicite aigue » (hors sujet)      -> 0,400
   *
   * LA CONSIGNE OBTIENT EXACTEMENT LA NOTE DU HORS-SUJET. En « Interroge-moi »
   * et en « QCM », ce n'est pas une question que l'etudiant envoie, c'est un
   * ordre : « pose-moi une question ouverte sur X, attends ma reponse, puis
   * corrige-la ». Les mots utiles y sont noyes dans du vocabulaire de pilotage.
   * AUCUN SEUIL NE PEUT DISTINGUER LES DEUX — ce n'est pas la barre qui etait
   * mal placee, c'est ce qu'on mesurait.
   *
   * Le titre du fil, lui, EST le sujet : « ECN-221-01 — Definition de
   * l'atherome ». On mesure donc lui.
   */
  const sujetDeRecherche =
    mode === "ask" || typeof thread.title !== "string" || thread.title.trim() === ""
      ? question
      : String(thread.title);
  const outcomeId = thread.outcome_id as string | null;
  const resourceIdDuFil = thread.resource_id as string | null;

  let passages: Passage[] = [];
  let ecartes: string[] = [];

  if (reuse) {
    passages = await readCitedSections(userClient, previousCitations);
  } else if (outcomeId) {
    const { data: rows, error: e1 } = await userClient.rpc("read_outcome_sections", {
      p_outcome_id: outcomeId,
    });
    if (e1) return json({ error: `Lecture du cours impossible : ${e1.message}` }, 500);
    const sections = (rows ?? []) as Record<string, unknown>[];
    const origine = sections[0] ? String(sections[0]["origine"]) : undefined;

    /*
     * L'ANCRAGE EST LE FILTRE — correction du 09/09, apres le test de Stef.
     *
     * Quand l'acquis a un texte PROPRE (rattachement arbitre ou rubrique), on
     * SAIT deja quelles sections le traitent : elles sont affichees sous le
     * bloc, l'etudiant les a sous les yeux. Chercher pour retrouver ce qu'on
     * connait deja n'ajoute qu'une occasion de se tromper — et c'est
     * exactement ce qui s'est produit : l'assistant repondait « je ne trouve
     * pas cela dans vos supports » pendant que le passage etait affiche
     * dessous.
     *
     * LE SEUIL GARDE SON SENS LA OU LE DOUTE EXISTE : un acquis SANS texte
     * propre (58 sur 331), ou un fil ouvert sur un chapitre entier. C'est le
     * seul endroit ou l'on ignore de quoi parle l'etudiant.
     */
    const aTextePropre = origine === "manuel" || origine === "rubrique";

    if (aTextePropre) {
      passages = sections.map((row) => versPassage(row, 0));
    } else if (politique === "sections_seules") {
      // Pas de texte PROPRE à cet acquis : on ne paie pas pour le chapitre.
      passages = [];
    } else if (politique === "seuil") {
      // Repli : les sections rendues SONT le chapitre, donc rien à intersecter.
      const resourceId = sections[0] ? String(sections[0]["resource_id"]) : null;
      if (resourceId) {
        const { data: hits } = await userClient.rpc("search_course_sections", {
          p_resource_id: resourceId,
          p_query: sujetDeRecherche,
          p_limit: PASSAGE_COUNT,
        });
        passages = ((hits ?? []) as Record<string, unknown>[])
          .filter((row) => Number(row["rank"]) >= MIN_RANK)
          .map((row) => versPassage(row, Number(row["rank"])));
      }
    } else {
      passages = sections.map((row) => versPassage(row, 0));
    }
  } else if (resourceIdDuFil) {
    if (politique === "chapitre") {
      const { data: rows, error: e2 } = await userClient.rpc("read_chapter_sections", {
        p_resource_id: resourceIdDuFil,
      });
      if (e2) return json({ error: `Lecture du chapitre impossible : ${e2.message}` }, 500);
      passages = ((rows ?? []) as Record<string, unknown>[]).map((row) => versPassage(row, 0));
    } else {
      const { data: hits, error: e3 } = await userClient.rpc("search_course_sections", {
        p_resource_id: resourceIdDuFil,
        p_query: sujetDeRecherche,
        p_limit: PASSAGE_COUNT,
      });
      if (e3) return json({ error: `Recherche impossible : ${e3.message}` }, 500);
      passages = ((hits ?? []) as Record<string, unknown>[])
        // Le seuil ne s'applique qu'à la politique qui le demande.
        .filter((row) => politique !== "seuil" || Number(row["rank"]) >= MIN_RANK)
        .map((row) => versPassage(row, Number(row["rank"])));
    }
  }

  // GARDE-FOU N°4 : le budget de contexte, sur une frontière de section.
  const borne = tenirDansLeBudget(passages);
  passages = borne.gardes;
  ecartes = borne.ecartes;

  // Rien de pertinent : on répond sans appeler le fournisseur. Coût ZÉRO.
  if (passages.length === 0) {
    const writeError = await writeTurns(
      adminClient,
      threadId,
      question,
      NOT_FOUND_FR,
      mode,
      [],
      0,
      0,
      0,
    );
    if (writeError) return json({ error: writeError }, 500);
    return json({ answer: NOT_FOUND_FR, citations: [], grounded: false, credits: 0 }, 200);
  }

  // 4. LE FOURNISSEUR ACTIF ET SA CLÉ. Seule porte de sortie du coffre.
  const { data: credential, error: keyError } = await adminClient.rpc("resolve_program_ai_key", {
    p_program_id: thread.program_id,
  });
  if (keyError) return json({ error: `Fournisseur illisible : ${keyError.message}` }, 500);
  const provider = (credential as Record<string, unknown>[] | null)?.[0];
  if (!provider) {
    return json({ error: "Aucun fournisseur IA configuré pour ce programme." }, 503);
  }

  // 5. L'HISTORIQUE. Les derniers tours seulement : un fil de vingt échanges
  //    renvoyé en entier coûterait plus que les dix-neuf précédents réunis.
  const { data: history } = await userClient
    .from("ai_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS);
  const turns = ((history ?? []) as { role: string; content: string }[]).reverse();

  const corpus = passages.map((p, i) => `[${i + 1}] ${p.label}\n${p.content}`).join("\n\n---\n\n");
  const userContent = `PASSAGES DE COURS DISPONIBLES :\n\n${corpus}\n\n---\n\nQUESTION DE L'ÉTUDIANT : ${question}`;

  let result: { answer: string; citations: number[]; inputTokens: number; outputTokens: number };
  try {
    result = await callProvider(
      String(provider["provider"]),
      String(provider["model"]),
      String(provider["api_key"]),
      turns,
      userContent,
    );
  } catch (e) {
    /*
      ON NE RELAIE JAMAIS LE MESSAGE D'ERREUR DU FOURNISSEUR (04/09).
      Deno inclut la valeur de l'en-tete fautif dans « Invalid header value »,
      et cet en-tete porte la cle. Un message d'erreur verbatim est donc un
      canal de fuite. Le detail part dans les journaux du serveur, jamais dans
      la reponse HTTP.
    */
    console.error("ai-companion-chat / appel fournisseur", e);
    return json({ error: "Le fournisseur IA n'a pas repondu correctement." }, 502);
  }

  // 6. GARDE-FOU N°3 : les citations sont confrontées aux passages envoyés.
  //    Un numéro inventé est écarté ; s'il n'en reste aucun, la réponse n'est
  //    pas affichée.
  const valid = result.citations.filter(
    (n) => Number.isInteger(n) && n >= 1 && n <= passages.length,
  );
  const unique = [...new Set(valid)];

  if (unique.length === 0) {
    const writeError = await writeTurns(
      adminClient,
      threadId,
      question,
      NOT_FOUND_FR,
      mode,
      [],
      result.inputTokens,
      result.outputTokens,
      CREDITS_PER_TEXT_TURN,
    );
    if (writeError) return json({ error: writeError }, 500);
    return json(
      { answer: NOT_FOUND_FR, citations: [], grounded: false, credits: CREDITS_PER_TEXT_TURN },
      200,
    );
  }

  const citations = unique.map((n) => {
    const p = passages[n - 1]!;
    return { sectionId: p.sectionId, label: p.label };
  });

  /*
   * DIRE CE QU'ON N'A PAS LU. Le budget a pu écarter des sections ; l'étudiant
   * doit le savoir, sinon il croit avoir interrogé tout le chapitre. La phrase
   * est ajoutée à la réponse ENREGISTRÉE autant qu'à celle affichée : relire le
   * fil plus tard doit dire la même chose que le jour même.
   */
  const reponse =
    ecartes.length === 0
      ? result.answer
      : `${result.answer}\n\n_Sections non lues faute de place : ${ecartes.join(", ")}._`;

  const writeError = await writeTurns(
    adminClient,
    threadId,
    question,
    reponse,
    mode,
    citations,
    result.inputTokens,
    result.outputTokens,
    CREDITS_PER_TEXT_TURN,
  );
  if (writeError) return json({ error: writeError }, 500);

  return json(
    {
      answer: reponse,
      citations: citations.map((c, i) => ({ ...c, excerpt: passages[unique[i]! - 1]!.content })),
      grounded: true,
      credits: CREDITS_PER_TEXT_TURN,
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, reused: reuse },
    },
    200,
  );
});

/**
 * Relit les segments cités par la dernière réponse. On garde des identifiants
 * dans `citations`, jamais le texte : les passages restent canoniques et rien
 * n'est dupliqué en base.
 */
async function readCitedSections(
  client: ReturnType<typeof createClient>,
  cited: { sectionId?: string }[],
): Promise<Passage[]> {
  const ids = cited
    .slice(0, PASSAGE_COUNT)
    .map((c) => c.sectionId)
    .filter((id): id is string => typeof id === "string");
  if (ids.length === 0) return [];
  /*
   * UNE SEULE REQUÊTE, ET LA RLS FAIT L'AUTORISATION. `course_sections` porte
   * depuis le 08/09 une policy cadrée sur `can_read_resource` : une section
   * devenue inaccessible — chapitre dépublié, inscription terminée — n'est
   * simplement pas rendue, et le tour repart sur une recherche. On ne refait pas
   * ici une règle d'autorisation qui existe déjà en base.
   */
  const { data } = await client
    .from("course_sections")
    .select("id, numero, titre, contenu")
    .in("id", ids);
  const rows = (data ?? []) as Record<string, unknown>[];
  // On rend les sections dans l'ordre où elles avaient été citées.
  const parId = new Map(rows.map((row) => [String(row["id"]), row] as const));
  return ids
    .map((id) => parId.get(id))
    .filter((row): row is Record<string, unknown> => row !== undefined)
    .map((row) => versPassage(row, 0));
}

/**
 * TROIS FOURNISSEURS, UNE SEULE FORME DE RÉPONSE. Stef, 04/09 : « on doit
 * pouvoir changer quand on veut entre l'un ou l'autre » — donc l'appelant
 * n'a jamais à savoir lequel répond.
 */
async function callProvider(
  provider: string,
  model: string,
  apiKey: string,
  turns: readonly { role: string; content: string }[],
  userContent: string,
): Promise<{ answer: string; citations: number[]; inputTokens: number; outputTokens: number }> {
  /*
    Une cle contenant un espace, un retour a la ligne ou un caractere non ASCII
    ne peut pas devenir un en-tete HTTP : `fetch` leve alors une erreur qui
    CONTIENT la valeur. On refuse donc en amont, sans jamais citer la valeur.
  */
  if (!/^[\x21-\x7e]+$/.test(apiKey)) {
    throw new Error("cle du fournisseur mal formee");
  }

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: `${SYSTEM_PROMPT}\n\nRéponds UNIQUEMENT par un objet JSON {"answer": "...", "citations": [1, 2]}.`,
        messages: [
          ...turns.map((t) => ({
            role: t.role === "assistant" ? "assistant" : "user",
            content: t.content,
          })),
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) {
      console.error("reponse anthropic", res.status, (await res.text()).slice(0, 300));
      throw new Error(`anthropic ${res.status}`);
    }
    const payload = await res.json();
    const text = payload?.content?.[0]?.text ?? "";
    const parsed = parseJsonAnswer(text);
    return {
      ...parsed,
      inputTokens: Number(payload?.usage?.input_tokens ?? 0),
      outputTokens: Number(payload?.usage?.output_tokens ?? 0),
    };
  }

  // OpenAI et Mistral partagent la forme /chat/completions.
  const endpoint =
    provider === "mistral"
      ? "https://api.mistral.ai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

  const requestBody: Record<string, unknown> = {
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...turns.map((t) => ({
        role: t.role === "assistant" ? "assistant" : "user",
        content: t.content,
      })),
      { role: "user", content: userContent },
    ],
  };
  requestBody["response_format"] =
    provider === "mistral"
      ? { type: "json_object" }
      : {
          type: "json_schema",
          json_schema: { name: "grounded_answer", strict: true, schema: RESPONSE_SCHEMA },
        };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) {
    console.error("reponse fournisseur", provider, res.status, (await res.text()).slice(0, 300));
    throw new Error(`${provider} ${res.status}`);
  }
  const payload = await res.json();
  const parsed = parseJsonAnswer(payload?.choices?.[0]?.message?.content ?? "");
  return {
    ...parsed,
    inputTokens: Number(payload?.usage?.prompt_tokens ?? 0),
    outputTokens: Number(payload?.usage?.completion_tokens ?? 0),
  };
}

/** Un modèle rend parfois le JSON entouré de texte. On ne fait pas confiance. */
function parseJsonAnswer(raw: string): { answer: string; citations: number[] } {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { answer: raw.trim(), citations: [] };
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
      answer: String(parsed?.answer ?? "").trim(),
      citations: Array.isArray(parsed?.citations) ? parsed.citations.map(Number) : [],
    };
  } catch {
    return { answer: raw.trim(), citations: [] };
  }
}

/**
 * Les deux tours partent ensemble : jamais une question sans sa réponse.
 *
 * LE ROLE EST `learner`, PAS `user` (mesuré le 04/09). L'énumération en base
 * est `('learner', 'assistant')`. La première version écrivait `user` : la
 * valeur était refusée, l'insertion échouait, et comme l'erreur n'était pas
 * vérifiée la fonction rendait 200 avec une réponse impeccable pendant que
 * RIEN n'était écrit. Un faux succès parfait, exactement ce que ce dépôt
 * traque partout ailleurs.
 *
 * L'ERREUR EST DONC REMONTÉE. Une écriture qu'on ne vérifie pas n'est pas une
 * écriture, c'est un espoir.
 */
async function writeTurns(
  admin: ReturnType<typeof createClient>,
  threadId: string,
  question: string,
  answer: string,
  mode: string,
  citations: unknown[],
  inputTokens: number,
  outputTokens: number,
  credits: number,
): Promise<string | null> {
  const { error } = await admin.from("ai_messages").insert([
    /*
      LES DEUX OBJETS PORTENT LES MEMES CLES (mesure du 07/09). PostgREST
      construit UNE seule liste de colonnes a partir de l'union des cles des
      lignes envoyees, puis ecrit `null` la ou une cle manque : le `default 0`
      de la colonne ne joue jamais. La ligne apprenant, qui omettait les deux
      compteurs, faisait donc echouer l'insertion ENTIERE --
      23502, null value in column "input_tokens" violates not-null constraint.
    */
    {
      thread_id: threadId,
      role: "learner",
      content: question,
      mode,
      citations: [],
      input_tokens: 0,
      output_tokens: 0,
      credits: 0,
    },
    {
      thread_id: threadId,
      role: "assistant",
      content: answer,
      mode,
      citations,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      credits,
    },
  ]);
  if (error) {
    /*
      ON REND L'ERREUR, ON NE LA LANCE PLUS (07/09). Le `throw` remontait au
      runtime, qui repond un 500 SANS les en-tetes CORS : le navigateur n'y
      voyait qu'un « Failed to fetch », et le message -- seul endroit ou la
      cause etait ecrite -- ne vivait que dans les journaux du serveur. Une
      erreur illisible depuis l'ecran ou elle se produit coute une journee a
      diagnostiquer ; celle-ci en a coute une.
    */
    console.error("ai-companion-chat / ecriture des tours", error);
    return `Les tours n'ont pas pu etre enregistres : ${error.message}`;
  }
  await admin
    .from("ai_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);
  return null;
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
