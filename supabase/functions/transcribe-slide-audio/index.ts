// supabase/functions/transcribe-slide-audio/index.ts
//
// Transcrit la narration d'UNE diapositive d'un diaporama commenté.
//
// Une diapositive à la fois, volontairement : un cours d'une dizaine de
// minutes dépasserait le temps d'exécution d'une Edge Function s'il était
// transcrit d'un bloc, et un échec en cours de route ferait tout reperdre.
// L'appelant boucle et voit l'avancement.
//
// Même pattern de sécurité que create-resource-upload-url : client scopé au
// JWT de l'appelant pour l'autorisation (is_program_staff, aucune logique de
// droits réimplémentée ici), client service_role uniquement pour lire le
// fichier privé et écrire la transcription.
//
// Entrée : POST { resourceId: string, force?: boolean }
// Sortie : { slideIndex, characters, remaining, done }
//
// L'appelant fournit le support, pas la diapositive : la fonction prend la
// prochaine diapositive à transcrire et annonce combien il en reste. Le client
// rappelle tant que `done` est faux, sans avoir à connaître les identifiants
// internes des diapositives.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const TRANSCRIBE_MODEL = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") ?? "whisper-1";
const TRANSCRIPT_LANGUAGE = "fr";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }
  if (!OPENAI_API_KEY) {
    return json({ error: "Secret OPENAI_API_KEY absent : transcription indisponible." }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authentification requise." }, 401);

  let body: { resourceId?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }
  const resourceId = typeof body.resourceId === "string" ? body.resourceId : "";
  const force = body.force === true;
  if (!resourceId) return json({ error: "resourceId est requis." }, 400);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user: caller },
    error: callerError,
  } = await userClient.auth.getUser();
  if (callerError || !caller) return json({ error: "Session invalide." }, 401);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: resource, error: resourceError } = await adminClient
    .from("learning_resources")
    .select("program_id")
    .eq("id", resourceId)
    .maybeSingle();
  if (resourceError) return json({ error: resourceError.message }, 500);
  if (!resource) return json({ error: "Support introuvable." }, 404);

  // Autorisation déléguée à la fonction SQL existante.
  const { data: isStaff, error: staffError } = await userClient.rpc("is_program_staff", {
    p_program_id: resource.program_id,
  });
  if (staffError) return json({ error: staffError.message }, 500);
  if (!isStaff) return json({ error: "Droits insuffisants pour ce programme." }, 403);

  // Diaporama le plus recent du support.
  const { data: deck, error: deckError } = await adminClient
    .from("narrated_decks")
    .select("id")
    .eq("resource_id", resourceId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (deckError) return json({ error: deckError.message }, 500);
  if (!deck) return json({ error: "Ce support ne porte aucun diaporama publie." }, 404);

  let pending = adminClient
    .from("narrated_deck_slides")
    .select("id, deck_id, slide_index, transcript, audio_asset_id", { count: "exact" })
    .eq("deck_id", deck.id)
    .not("audio_asset_id", "is", null)
    .order("slide_index", { ascending: true });
  if (!force) pending = pending.is("transcript", null);

  const { data: slides, error: pendingError, count } = await pending;
  if (pendingError) return json({ error: pendingError.message }, 500);

  const slide = slides?.[0];
  if (!slide) {
    return json({ slideIndex: null, characters: 0, remaining: 0, done: true });
  }
  const remainingBefore = count ?? slides.length;

  const { data: asset, error: assetError } = await adminClient
    .from("learning_resource_assets")
    .select("bucket_name, object_path, media_type, original_file_name")
    .eq("id", slide.audio_asset_id)
    .maybeSingle();
  if (assetError) return json({ error: assetError.message }, 500);
  if (!asset) return json({ error: "Piste audio introuvable." }, 404);

  const { data: blob, error: downloadError } = await adminClient.storage
    .from(asset.bucket_name)
    .download(asset.object_path);
  if (downloadError || !blob) {
    return json(
      { error: downloadError?.message ?? "Téléchargement de la narration impossible." },
      500,
    );
  }

  const form = new FormData();
  form.append("file", blob, asset.original_file_name ?? "narration.m4a");
  form.append("model", TRANSCRIBE_MODEL);
  form.append("language", TRANSCRIPT_LANGUAGE);
  form.append("response_format", "text");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  const transcript = (await response.text()).trim();
  if (!response.ok) {
    return json(
      { error: `Transcription refusée (${response.status}) : ${transcript.slice(0, 300)}` },
      502,
    );
  }

  const { error: updateError } = await adminClient
    .from("narrated_deck_slides")
    .update({ transcript, transcript_language: TRANSCRIPT_LANGUAGE })
    .eq("id", slide.id);
  if (updateError) return json({ error: updateError.message }, 500);

  // Le diaporama porte une transcription dès qu'au moins une diapositive en a une.
  await adminClient
    .from("narrated_decks")
    .update({ transcript_available: true })
    .eq("id", slide.deck_id);

  return json({
    slideIndex: slide.slide_index,
    characters: transcript.length,
    remaining: Math.max(remainingBefore - 1, 0),
    done: remainingBefore - 1 <= 0,
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
