// supabase/functions/create-resource-upload-url/index.ts
//
// Génère une URL signée d'upload pour un fichier de support pédagogique
// (Médiathèque) : fichier source (PDF/vidéo/PPTX) ou média extrait d'une
// diapositive (image, audio). Voir le pattern de sécurité dans
// invite-person/index.ts : client scopé JWT pour l'autorisation (aucune
// logique de droits réimplémentée ici, on réutilise is_program_staff via
// RPC), client service_role uniquement pour l'opération de stockage
// privilégiée (storage.createSignedUploadUrl).
//
// Entrée  : POST { programId: string, bucket: "course-sources" | "pptx-sources" | "course-artifacts", fileName: string }
// Sortie  : { bucket, objectPath, signedUrl, token }
//
// Le client upload ensuite directement vers signedUrl (ou via
// supabase-js storage.uploadToSignedUrl(objectPath, token, file)) puis
// appelle la RPC register_learning_resource_asset avec le objectPath
// obtenu pour enregistrer le fichier en base.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// "course-artifacts" : médias dérivés d'une diapositive (image, audio) pour
// un diaporama sonorisé publié via publish_narrated_deck.
const ALLOWED_BUCKETS = new Set(["course-sources", "pptx-sources", "course-artifacts"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Authentification requise." }, 401);
  }

  let body: { programId?: unknown; bucket?: unknown; fileName?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }

  const programId = typeof body.programId === "string" ? body.programId : "";
  const bucket = typeof body.bucket === "string" ? body.bucket : "";
  const fileName = typeof body.fileName === "string" ? body.fileName : "";

  if (!programId || !bucket || !fileName) {
    return json({ error: "programId, bucket et fileName sont requis." }, 400);
  }
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return json({ error: `Bucket non autorisé: ${bucket}` }, 400);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await userClient.auth.getUser();

  if (callerError || !caller) {
    return json({ error: "Session invalide." }, 401);
  }

  // Autorisation déléguée à la fonction SQL existante (aucune logique de
  // droits réimplémentée ici) : is_program_staff() est déjà GRANT à
  // authenticated et lit auth.uid() côté serveur.
  const { data: isStaff, error: staffError } = await userClient.rpc("is_program_staff", {
    p_program_id: programId,
  });
  if (staffError) {
    return json({ error: staffError.message }, 500);
  }
  if (!isStaff) {
    return json({ error: "Droits insuffisants pour ce programme." }, 403);
  }

  const safeName = fileName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-180);
  const objectPath = `${programId}/${crypto.randomUUID()}-${safeName}`;

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: signed, error: signError } = await adminClient.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath);

  if (signError || !signed) {
    return json({ error: signError?.message ?? "URL signée non générée." }, 500);
  }

  return json(
    {
      bucket,
      objectPath,
      signedUrl: signed.signedUrl,
      token: signed.token,
    },
    200,
  );
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
