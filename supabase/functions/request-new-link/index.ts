// supabase/functions/request-new-link/index.ts
//
// « RECEVOIR UN NOUVEAU LIEN » -- libre-service de l'etudiant (21/09).
//
// Le week-end du 19-20/09, la promotion DFASM a recu des liens deja expires.
// Chaque etudiant bloque devait redemander un lien a l'equipe : c'est l'equipe
// qui devenait le goulet. Depuis la page « lien expire », l'etudiant saisit son
// adresse et recoit lui-meme un lien de 7 jours.
//
// PUBLIQUE (verify_jwt desactive), donc prudente :
//  - la reponse est TOUJOURS la meme, que l'adresse soit connue ou non : la
//    page ne doit pas servir a tester qui est inscrit ;
//  - au plus un envoi toutes les 2 minutes par adresse ;
//  - seules les adresses deja presentes dans le vivier d'un programme (`people`)
//    recoivent quelque chose, par le SMTP de CE programme.
//
// Entree  : POST { email: string }
// Sortie  : 200 { ok: true }  (toujours)

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL_PAR_DEFAUT = "https://stelafitte-medical-progress.dfasm-connect.workers.dev";
const APP_URL = (Deno.env.get("PUBLIC_APP_URL") ?? APP_URL_PAR_DEFAUT).replace(/\/+$/, "");

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

// 21/09 -- NOTRE JETON, VALABLE 7 JOURS (migration 20260921090000). Le jeton
// Supabase ne vit qu'une heure (24 h au plus) : les etudiants qui ouvraient
// leur courriel le lendemain arrivaient sur « lien expire ». Le courriel porte
// desormais un jeton a nous, dont seule l'empreinte est gardee ; le lien
// Supabase n'est fabrique qu'au clic, par `claim-invitation`.
function jetonAleatoire(): string {
  const octets = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...octets))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function empreinte(jeton: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jeton));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Revoque les liens precedents de cette adresse, en cree un de 7 jours. */
async function lienInvitation(
  adminClient: ReturnType<typeof createClient>,
  email: string,
): Promise<string> {
  const adresse = email.trim().toLowerCase();
  await adminClient
    .from("invitation_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("email", adresse)
    .is("revoked_at", null);
  const jeton = jetonAleatoire();
  const { error } = await adminClient
    .from("invitation_links")
    .insert({ email: adresse, token_hash: await empreinte(jeton) });
  if (error) throw new Error(`lien d'invitation non enregistre : ${error.message}`);
  return `${APP_URL}/premiere-connexion?${new URLSearchParams({ invitation: jeton }).toString()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Méthode non permise." }, 405);

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: true }, 200);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: true }, 200);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // Garde-fou : un envoi toutes les 2 minutes au plus par adresse.
    const { data: recent } = await adminClient
      .from("invitation_links")
      .select("created_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent && Date.now() - new Date(recent.created_at).getTime() < 120_000) {
      return json({ ok: true }, 200);
    }

    const { data: fiche } = await adminClient
      .from("people")
      .select("first_name, program_id")
      .eq("login_email", email)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!fiche) return json({ ok: true }, 200);

    const [{ data: sender }, { data: program }] = await Promise.all([
      adminClient
        .from("program_email_senders")
        .select("smtp_host, smtp_port, smtp_user, smtp_password_secret, from_name")
        .eq("program_id", fiche.program_id)
        .maybeSingle(),
      adminClient.from("programs").select("name").eq("id", fiche.program_id).maybeSingle(),
    ]);
    const password = sender ? Deno.env.get(sender.smtp_password_secret) : undefined;
    if (!sender || !password) return json({ ok: true }, 200);

    const lien = await lienInvitation(adminClient, email);
    const programName = program?.name ?? "Campus Santé Augmenté";
    const transporter = nodemailer.createTransport({
      host: sender.smtp_host,
      port: sender.smtp_port,
      secure: sender.smtp_port === 465,
      auth: { user: sender.smtp_user, pass: password },
    });
    await transporter.sendMail({
      from: `"${sender.from_name}" <${sender.smtp_user}>`,
      to: email,
      subject: `Votre lien de connexion — ${programName}`,
      text: [
        fiche.first_name ? `Bonjour ${fiche.first_name},` : "Bonjour,",
        "",
        `Voici un nouveau lien pour accéder à "${programName}" (Campus Santé Augmenté).`,
        "",
        "Pour définir votre mot de passe et vérifier vos informations, cliquez sur le lien suivant :",
        lien,
        "",
        "Ce lien est personnel et valable 7 jours. Merci de ne pas le transférer.",
        "",
        `— ${sender.from_name}`,
      ].join("\n"),
    });
  } catch (e) {
    // Jamais d'echec visible : la page dit la meme chose dans tous les cas.
    console.error("request-new-link", e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true }, 200);
});
