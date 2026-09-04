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
// LES TROIS GARDE-FOUS VALIDÉS PAR STEF LE 04/09
// 1. SEUIL DE PERTINENCE — sous `MIN_RANK`, on considère qu'on n'a rien
//    trouvé. Aucun appel au fournisseur n'est fait : une question hors corpus
//    coûte ZÉRO.
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
// LIMITE CONNUE DE LA V1, à ne pas oublier : la recherche ne filtre PAS
// encore sur le `scope` du fil (`knowledge` / `competence`). Un fil ouvert
// depuis « Mes compétences » cherche donc dans tout le corpus du programme.
// À corriger dans `search_learning_resource_texts` quand les supports de
// compétence seront distingués en base.
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

/** Nombre de passages envoyés au modèle. Mesuré : 5 passages ≈ 19 000 caractères. */
const PASSAGE_COUNT = 5;

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

interface Passage {
  readonly resourceId: string;
  readonly resourceTitle: string;
  readonly sourcePath: string;
  readonly segmentIndex: number;
  readonly content: string;
  readonly rank: number;
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
    .select("id, enrollment_id, program_id, scope, title")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) return json({ error: `Fil illisible : ${threadError.message}` }, 500);
  if (!thread) return json({ error: "Fil introuvable ou hors de votre portée." }, 404);

  // 2. LE PLAFOND, vérifié côté serveur. Un plafond vérifié dans le navigateur
  //    n'est pas un plafond.
  const { data: settings } = await adminClient
    .from("program_ai_settings")
    .select("enabled, monthly_credit_cap")
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

  // 3. LES PASSAGES. Recherche seulement si le tour énonce un sujet ; sinon on
  //    relit les segments cités par la dernière réponse. Voir le garde-fou n°2.
  const { data: lastAssistant } = await userClient
    .from("ai_messages")
    .select("citations")
    .eq("thread_id", threadId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousCitations = Array.isArray(lastAssistant?.citations)
    ? (lastAssistant!.citations as { resourceId?: string; segmentIndex?: number }[])
    : [];
  const reuse = !newSubject && previousCitations.length > 0;

  let passages: Passage[] = [];
  if (reuse) {
    passages = await readCitedPassages(userClient, previousCitations);
  } else {
    const { data: found, error: searchError } = await userClient.rpc(
      "search_learning_resource_texts",
      { p_program_id: thread.program_id, p_query: question, p_limit: PASSAGE_COUNT },
    );
    if (searchError) return json({ error: `Recherche impossible : ${searchError.message}` }, 500);
    passages = ((found ?? []) as Record<string, unknown>[])
      .map((row) => ({
        resourceId: String(row["resource_id"]),
        resourceTitle: String(row["resource_title"]),
        sourcePath: String(row["source_path"]),
        segmentIndex: Number(row["segment_index"]),
        content: String(row["content"]),
        rank: Number(row["rank"]),
      }))
      // GARDE-FOU N°1 : le seuil de pertinence.
      .filter((p) => p.rank >= MIN_RANK);
  }

  // Rien de pertinent : on répond sans appeler le fournisseur. Coût ZÉRO.
  if (passages.length === 0) {
    await writeTurns(adminClient, threadId, question, NOT_FOUND_FR, mode, [], 0, 0, 0);
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

  const corpus = passages
    .map((p, i) => `[${i + 1}] ${p.resourceTitle} (segment ${p.segmentIndex})\n${p.content}`)
    .join("\n\n---\n\n");
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
    return json(
      { error: `Appel du fournisseur impossible : ${e instanceof Error ? e.message : String(e)}` },
      502,
    );
  }

  // 6. GARDE-FOU N°3 : les citations sont confrontées aux passages envoyés.
  //    Un numéro inventé est écarté ; s'il n'en reste aucun, la réponse n'est
  //    pas affichée.
  const valid = result.citations.filter(
    (n) => Number.isInteger(n) && n >= 1 && n <= passages.length,
  );
  const unique = [...new Set(valid)];

  if (unique.length === 0) {
    await writeTurns(
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
    return json(
      { answer: NOT_FOUND_FR, citations: [], grounded: false, credits: CREDITS_PER_TEXT_TURN },
      200,
    );
  }

  const citations = unique.map((n) => {
    const p = passages[n - 1]!;
    return {
      resourceId: p.resourceId,
      resourceTitle: p.resourceTitle,
      sourcePath: p.sourcePath,
      segmentIndex: p.segmentIndex,
    };
  });

  await writeTurns(
    adminClient,
    threadId,
    question,
    result.answer,
    mode,
    citations,
    result.inputTokens,
    result.outputTokens,
    CREDITS_PER_TEXT_TURN,
  );

  return json(
    {
      answer: result.answer,
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
async function readCitedPassages(
  client: ReturnType<typeof createClient>,
  cited: { resourceId?: string; segmentIndex?: number }[],
): Promise<Passage[]> {
  const out: Passage[] = [];
  for (const c of cited.slice(0, PASSAGE_COUNT)) {
    if (!c.resourceId || typeof c.segmentIndex !== "number") continue;
    const { data } = await client
      .from("learning_resource_texts")
      .select("resource_id, source_path, segment_index, content")
      .eq("resource_id", c.resourceId)
      .eq("segment_index", c.segmentIndex)
      .maybeSingle();
    if (!data) continue;
    const { data: resource } = await client
      .from("learning_resources")
      .select("title")
      .eq("id", c.resourceId)
      .maybeSingle();
    out.push({
      resourceId: String(data["resource_id"]),
      resourceTitle: String(resource?.["title"] ?? ""),
      sourcePath: String(data["source_path"]),
      segmentIndex: Number(data["segment_index"]),
      content: String(data["content"]),
      rank: 0,
    });
  }
  return out;
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
    if (!res.ok) throw new Error(`${provider} ${res.status} : ${(await res.text()).slice(0, 300)}`);
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
  if (!res.ok) throw new Error(`${provider} ${res.status} : ${(await res.text()).slice(0, 300)}`);
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

/** Les deux tours partent ensemble : jamais une question sans sa réponse. */
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
): Promise<void> {
  await admin.from("ai_messages").insert([
    { thread_id: threadId, role: "user", content: question, mode, citations: [], credits: 0 },
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
  await admin
    .from("ai_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
