// supabase/functions/analyze-program-objectives/index.ts
//
// Analyse IA d'un texte d'objectifs pédagogiques (import PDF/Word/texte côté
// Concepteur de programme) : propose des connaissances/compétences
// candidates (référentiel `outcomes`) et des modalités d'évaluation
// candidates. RIEN n'est créé ici — la réponse alimente une matrice
// éditable côté client ; seule la validation explicite du concepteur crée
// les lignes réelles, via les RPC create_outcome / create_assessment_modality
// existants (mêmes vérifications d'autorisation qu'un ajout manuel).
//
// MODÈLE DE SÉCURITÉ :
// - Le JWT de l'appelant sert à vérifier can_administer_program(programId)
//   avant tout appel OpenAI (pas de dépense pour un appelant non autorisé).
// - La clé OpenAI (secret OPENAI_API_KEY) n'est utilisée que côté serveur,
//   jamais exposée au client.
//
// Entrée : POST { programId: string, text: string }
// Sortie : { knowledgeItems: [...], assessmentModalities: [...], truncated }

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
// Surchargeable via secret sans redéployer, pour changer de modèle facilement.
const OPENAI_MODEL = Deno.env.get("OPENAI_ANALYZE_MODEL") ?? "gpt-4o-mini";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Garde-fou de coût/latence : au-delà, on tronque et on le signale au client.
const MAX_INPUT_CHARS = 20000;

const OUTCOME_NATURES = ["knowledge", "simulated_competence", "real_competence"] as const;
const MASTERY_LEVELS = ["not_started", "novice", "intermediate", "proficient", "autonomous"] as const;
const ASSESSMENT_SUBTYPES = ["oral", "written", "practical", "qcm", "simulation", "ai_oral", "case_study"] as const;
const ASSESSMENT_USAGES = ["self_assessment", "formative", "validation_exam", "certification"] as const;

/**
 * Dérivé côté serveur (jamais demandé au modèle) pour garantir la cohérence
 * avec la contrainte SQL assessment_modalities_subtype_matches_mode : le
 * modèle IA se trompe parfois sur cette association, alors qu'elle est
 * mécanique une fois le sous-type connu.
 */
const MODE_BY_SUBTYPE: Record<string, "in_person" | "online"> = {
  oral: "in_person",
  written: "in_person",
  practical: "in_person",
  qcm: "online",
  simulation: "online",
  ai_oral: "online",
  case_study: "online",
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    knowledgeItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          domain: { type: "string" },
          description: { type: "string" },
          nature: { type: "string", enum: OUTCOME_NATURES },
          targetMastery: { type: "string", enum: MASTERY_LEVELS },
          sourceExcerpt: { type: "string" },
        },
        required: ["label", "domain", "description", "nature", "targetMastery", "sourceExcerpt"],
        additionalProperties: false,
      },
    },
    assessmentModalities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          subtype: { type: "string", enum: ASSESSMENT_SUBTYPES },
          usage: { type: "string", enum: ASSESSMENT_USAGES },
          notes: { type: "string" },
        },
        required: ["name", "subtype", "usage", "notes"],
        additionalProperties: false,
      },
    },
  },
  required: ["knowledgeItems", "assessmentModalities"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Tu analyses un document de programme pédagogique médical (français) pour en extraire une proposition structurée de référentiel. Tu ne réponds qu'en JSON conforme au schéma fourni.

Pour chaque item de "knowledgeItems" :
- "nature" = "knowledge" pour un savoir évaluable par QCM/écrit (connaissances théoriques, sémiologie, examens complémentaires) ;
- "nature" = "simulated_competence" pour un savoir-faire démontrable en simulation/ECOS (raisonnement clinique, compétences cliniques : examiner, interpréter, raisonner, décider, communiquer) ;
- "nature" = "real_competence" pour un geste ou une compétence dont la maîtrise réelle s'observe en stage (gestes pratiques, agir en urgence).
- "targetMastery" reflète le niveau visé en fin de programme pour un étudiant qui progresse normalement (généralement "proficient" ou "autonomous" pour un objectif central, "intermediate" pour un objectif secondaire) — jamais "not_started".
- "domain" est un regroupement thématique court (ex. "Insuffisance cardiaque", "Sémiologie cardiovasculaire", "Compétences cliniques — Raisonner").
- "sourceExcerpt" cite brièvement (une phrase maximum) le passage du document qui justifie cet item.
- Un item par connaissance ou compétence identifiable ; ne fusionne pas plusieurs objectifs distincts en un seul.

Pour chaque item de "assessmentModalities" :
- "subtype" correspond à l'outil pédagogique décrit (qcm, simulation = ECOS/cas simulé, ai_oral = interaction IA vocale/conversationnelle, case_study = cas clinique commenté, practical = geste pratique évalué, oral/written = évaluation classique) ;
- "usage" = "self_assessment" pour de l'entraînement libre, "formative" pour du suivi de progression, "validation_exam" pour une évaluation qui valide une étape, "certification" pour une validation finale/certifiante ;
- Ne propose une modalité que si le document décrit explicitement un outil ou une méthode d'évaluation/entraînement — n'invente rien qui ne soit pas mentionné.

Ne propose que ce qui est explicitement ou très clairement implicitement présent dans le texte fourni. En l'absence d'éléments identifiables pour une catégorie, renvoie un tableau vide pour cette catégorie.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!OPENAI_API_KEY) {
    return json({ error: "Analyse IA indisponible (clé OpenAI non configurée côté serveur)." }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Authentification requise." }, 401);
  }

  let body: { programId?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }

  const programId = typeof body.programId === "string" ? body.programId : null;
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!programId) return json({ error: "programId requis." }, 400);
  if (!text) return json({ error: "text (objectifs pédagogiques) requis et non vide." }, 400);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: allowed, error: authzError } = await userClient.rpc("can_administer_program", {
    p_program_id: programId,
  });
  if (authzError) {
    return json({ error: `Vérification des droits impossible : ${authzError.message}` }, 500);
  }
  if (!allowed) {
    return json({ error: "Droits insuffisants pour ce programme." }, 403);
  }

  const truncated = text.length > MAX_INPUT_CHARS;
  const inputText = truncated ? text.slice(0, MAX_INPUT_CHARS) : text;

  let openaiResponse: Response;
  try {
    openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: inputText },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "program_reference_proposal", strict: true, schema: RESPONSE_SCHEMA },
        },
      }),
    });
  } catch (e) {
    return json({ error: `Appel OpenAI impossible : ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  if (!openaiResponse.ok) {
    const detail = await openaiResponse.text();
    return json(
      { error: `OpenAI a renvoyé une erreur (${openaiResponse.status}) : ${detail.slice(0, 500)}` },
      502,
    );
  }

  let payload: { choices?: readonly { message?: { content?: string } }[] };
  try {
    payload = await openaiResponse.json();
  } catch {
    return json({ error: "Réponse OpenAI illisible." }, 502);
  }

  const rawContent = payload.choices?.[0]?.message?.content;
  if (!rawContent) return json({ error: "Réponse OpenAI vide." }, 502);

  let parsed: {
    knowledgeItems?: readonly Record<string, unknown>[];
    assessmentModalities?: readonly Record<string, unknown>[];
  };
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return json({ error: "Réponse OpenAI non conforme au format attendu." }, 502);
  }

  const knowledgeItems = (parsed.knowledgeItems ?? []).map((item) => ({
    label: String(item["label"] ?? ""),
    domain: String(item["domain"] ?? ""),
    description: String(item["description"] ?? ""),
    nature: OUTCOME_NATURES.includes(item["nature"] as (typeof OUTCOME_NATURES)[number])
      ? item["nature"]
      : "knowledge",
    targetMastery: MASTERY_LEVELS.includes(item["targetMastery"] as (typeof MASTERY_LEVELS)[number])
      ? item["targetMastery"]
      : "intermediate",
    sourceExcerpt: String(item["sourceExcerpt"] ?? ""),
  }));

  const assessmentModalities = (parsed.assessmentModalities ?? []).map((item) => {
    const subtype = ASSESSMENT_SUBTYPES.includes(item["subtype"] as (typeof ASSESSMENT_SUBTYPES)[number])
      ? (item["subtype"] as string)
      : "qcm";
    return {
      name: String(item["name"] ?? ""),
      mode: MODE_BY_SUBTYPE[subtype],
      subtype,
      usage: ASSESSMENT_USAGES.includes(item["usage"] as (typeof ASSESSMENT_USAGES)[number])
        ? item["usage"]
        : "formative",
      notes: String(item["notes"] ?? ""),
    };
  });

  return json({ knowledgeItems, assessmentModalities, truncated }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
