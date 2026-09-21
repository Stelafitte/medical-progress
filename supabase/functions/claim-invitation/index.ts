// supabase/functions/claim-invitation/index.ts
//
// ECHANGE D'UN LIEN D'INVITATION (7 jours) CONTRE UN LIEN SUPABASE FRAIS (21/09).
//
// Appelee par la page `/premiere-connexion`, AU CLIC sur « Activer mon compte »
// -- jamais au chargement : les robots des messageries ouvrent les pages, ils
// ne cliquent pas. PUBLIQUE (verify_jwt desactive) : l'etudiant n'a pas encore
// de session, c'est precisement ce qu'il vient chercher.
//
// SECURITE. Le jeton est aleatoire (256 bits) ; seule son empreinte SHA-256
// est en base. Un jeton inconnu, revoque ou expire rend la MEME reponse -- on ne
// dit pas lequel des trois. Le lien Supabase fabrique ici est rendu a la page,
// qui l'echange aussitot (`verifyOtp`) : il n'a pas le temps d'expirer.
//
// Entree  : POST { invitation: string }
// Sortie  : 200 { token_hash, type }  |  410 { error }

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function empreinte(jeton: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jeton));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PERIME = "Ce lien n'est plus valable.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Méthode non permise." }, 405);

  let body: { invitation?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }
  const jeton = typeof body.invitation === "string" ? body.invitation.trim() : "";
  if (jeton.length < 20 || jeton.length > 100) return json({ error: PERIME }, 410);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: ligne } = await admin
    .from("invitation_links")
    .select("id, email, expires_at, revoked_at, use_count")
    .eq("token_hash", await empreinte(jeton))
    .maybeSingle();
  if (!ligne || ligne.revoked_at || new Date(ligne.expires_at).getTime() < Date.now()) {
    return json({ error: PERIME }, 410);
  }

  // « recovery » convient a un compte deja cree (invite ou non confirme) : il
  // mene a poser un mot de passe. Si le compte n'existe pas encore (fiche du
  // vivier jamais invitee par Supabase), « invite » le cree.
  let type: "recovery" | "invite" = "recovery";
  let { data: lien, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: ligne.email,
  });
  if (error || !lien?.properties?.hashed_token) {
    type = "invite";
    ({ data: lien, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email: ligne.email,
    }));
  }
  if (error || !lien?.properties?.hashed_token) {
    return json({ error: "Activation momentanément impossible. Réessayez dans un instant." }, 500);
  }

  await admin
    .from("invitation_links")
    .update({ last_used_at: new Date().toISOString(), use_count: (ligne.use_count ?? 0) + 1 })
    .eq("id", ligne.id);

  return json({ token_hash: lien.properties.hashed_token, type }, 200);
});
