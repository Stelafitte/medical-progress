// supabase/functions/resend-first-login/index.ts
//
// Renvoie un lien de PREMIERE CONNEXION a des apprenants DEJA INSCRITS.
//
// POURQUOI UNE SECONDE FONCTION, ET PAS UN ARGUMENT DE PLUS SUR invite-person.
// `invite-person` travaille sur la table `people` — le sas, des personnes qui
// n'ont pas encore de compte — et appelle `generateLink({ type: "invite" })`.
// Cet appel ECHOUE si le compte existe deja. Or ici la cible est exactement
// l'inverse : un apprenant dont le compte existe, qui figure dans `profiles`
// et `enrollments`, et qui ne peut plus se connecter. Ce n'est pas la meme
// entree, pas le meme appel Supabase, pas le meme message. Deux gestes.
//
// Constat du 03/09 qui a motive cette fonction : un apprenant cree directement
// dans une classe n'avait AUCUN chemin de reinvitation. Ni ecran, ni fonction.
//
// MODELE DE SECURITE — identique a invite-person, volontairement :
// - Le JWT de l'appelant construit un client "scope utilisateur". La lecture
//   des inscriptions passe par la RLS existante : si l'appelant n'est pas du
//   staff du programme, il ne voit rien et la personne ressort "hors perimetre".
//   Aucune logique d'autorisation n'est reimplementee ici.
// - Le client service_role ne sert QU'A ce que la RLS ne couvre pas :
//   l'adresse e-mail (elle vit dans auth.users, jamais dans profiles), la
//   generation du lien, et la config d'expedition du programme.
//
// TYPE DE LIEN : "recovery". Il convient que le compte ait deja servi ou non —
// il conduit l'apprenant a poser son mot de passe. "invite" refuserait, "magiclink"
// connecterait sans jamais lui faire choisir de mot de passe.
//
// DUPLICATION ASSUMEE, ET DATEE. Le bloc d'envoi SMTP est copie d'invite-person
// faute de dossier `_shared`. Choix de Stef le 03/09 : dupliquer maintenant pour
// ne pas avoir a redeployer une fonction qui marche, factoriser quand la
// troisieme fonction (courriels personnalises) aura besoin du meme bloc.
// A FACTORISER DANS supabase/functions/_shared/sendProgramEmail.ts A CE
// MOMENT-LA, et pas plus tard.
//
// PAS DE TRACE D'ENVOI ICI. Le journal des envois est un chantier a part
// (« Suivi de la promotion », etape 3) et il doit exister AVANT le premier
// envoi en masse. Cette fonction est faite pour un apprenant a la fois.
//
// Entree  : POST { personIds: string[] }   (identifiants de profils, max 100)
// Sortie  : { results: Array<{ personId, ok, error? }> }

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INVITE_REDIRECT_URL = Deno.env.get("INVITE_REDIRECT_URL") ?? undefined;
// 18/09 -- LE COURRIEL NE PORTE PLUS LE LIEN SUPABASE DIRECT. Ce lien consomme
// le jeton des qu'il est ouvert, et les messageries des CHU l'ouvrent avant le
// destinataire pour l'analyser : l'etudiant arrivait sur `otp_expired`. On
// envoie vers notre page `/premiere-connexion`, qui n'echange le jeton qu'au
// clic sur « Activer mon compte ».
const APP_URL_PAR_DEFAUT = "https://stelafitte-medical-progress.dfasm-connect.workers.dev";
const APP_URL = (Deno.env.get("PUBLIC_APP_URL") ?? APP_URL_PAR_DEFAUT).replace(/\/+$/, "");

function premiereConnexionUrl(hashedToken: string, type: "invite" | "recovery"): string {
  const params = new URLSearchParams({ token_hash: hashedToken, type });
  return `${APP_URL}/premiere-connexion?${params.toString()}`;
}


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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authentification requise." }, 401);

  let body: { personIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }

  const personIds = Array.isArray(body.personIds)
    ? body.personIds.filter((id): id is string => typeof id === "string")
    : [];

  if (personIds.length === 0) return json({ error: "personIds (tableau non vide) requis." }, 400);
  if (personIds.length > 100) return json({ error: "Maximum 100 envois par appel." }, 400);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await userClient.auth.getUser();
  if (callerError || !caller) return json({ error: "Session invalide." }, 401);

  // AUTORISATION : c'est cette lecture, et elle seule, qui decide. La RLS sur
  // `enrollments` ne rend que les inscriptions des programmes ou l'appelant a
  // sa place. Un identifiant absent du resultat est "hors perimetre" — on ne
  // dit pas s'il n'existe pas ou s'il est interdit, les deux se valent ici.
  const { data: rows, error: rowsError } = await userClient
    .from("enrollments")
    .select("person_id, program_id, status, profiles!inner(full_name)")
    .in("person_id", personIds)
    .in("status", ["active", "completed"]);

  if (rowsError) return json({ error: rowsError.message }, 500);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const found = new Map<string, { program_id: string; full_name: string }>();
  for (const r of (rows ?? []) as Array<{
    person_id: string;
    program_id: string;
    profiles: { full_name: string } | { full_name: string }[];
  }>) {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    if (!found.has(r.person_id)) {
      found.set(r.person_id, { program_id: r.program_id, full_name: p?.full_name ?? "" });
    }
  }

  const results: Array<{ personId: string; ok: boolean; error?: string }> = [];

  for (const id of personIds) {
    if (!found.has(id)) {
      results.push({
        personId: id,
        ok: false,
        error: "introuvable, non inscrit ou hors périmètre",
      });
    }
  }

  // GARDE-FOU INDISPENSABLE. La policy `enrollments_select_scoped` dit
  // `person_id = auth.uid() OR is_program_staff(program_id)` : un apprenant voit
  // donc SA PROPRE inscription. Sans ce controle, il pourrait declencher un envoi
  // depuis le SMTP du programme. Voir la lecture comme une autorisation serait
  // une erreur : ici elle ne prouve que la visibilite, pas le droit d'agir.
  // On redemande la regle a la base plutot que de la reecrire.
  const staffParProgramme = new Map<string, boolean>();
  for (const { program_id } of found.values()) {
    if (staffParProgramme.has(program_id)) continue;
    const { data: estStaff } = await userClient.rpc("is_program_staff", {
      p_program_id: program_id,
    });
    staffParProgramme.set(program_id, estStaff === true);
  }
  for (const [personId, person] of [...found]) {
    if (!staffParProgramme.get(person.program_id)) {
      found.delete(personId);
      results.push({ personId, ok: false, error: "réservé à l'équipe pédagogique du programme" });
    }
  }

  for (const [personId, person] of found) {
    // L'adresse vit dans auth.users, pas dans profiles : le commentaire de la
    // table le dit explicitement. Seul le client de service peut la lire.
    const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(personId);
    const email = authUser?.user?.email;
    if (authError || !email) {
      results.push({ personId, ok: false, error: "aucune adresse de connexion sur ce compte" });
      continue;
    }

    const { data: sender } = await adminClient
      .from("program_email_senders")
      .select("smtp_host, smtp_port, smtp_user, smtp_password_secret, from_name")
      .eq("program_id", person.program_id)
      .maybeSingle();

    const outcome = sender
      ? await sendWithDedicatedSender(
          adminClient,
          { personId, email, fullName: person.full_name, programId: person.program_id },
          sender,
        )
      : await sendWithSupabase(email);

    results.push({ personId, ok: outcome.ok, ...(outcome.ok ? {} : { error: outcome.error }) });
  }

  return json({ results }, 200);
});

// Chemin generique : aucun expediteur dedie pour ce programme. On laisse
// Supabase envoyer lui-meme, depuis son adresse generique. Moins joli, mais
// preferable a un echec silencieux.
async function sendWithSupabase(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await anonClient.auth.resetPasswordForEmail(email, {
    redirectTo: INVITE_REDIRECT_URL,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Chemin dedie : on recupere le lien via generateLink (Supabase n'envoie rien)
// et on l'expedie par le SMTP du programme, sous son propre nom de domaine.
async function sendWithDedicatedSender(
  adminClient: ReturnType<typeof createClient>,
  person: { personId: string; email: string; fullName: string; programId: string },
  sender: {
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_password_secret: string;
    from_name: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const password = Deno.env.get(sender.smtp_password_secret);
  if (!password) {
    return {
      ok: false,
      error: `secret SMTP "${sender.smtp_password_secret}" absent — le configurer dans Edge Functions > Secrets`,
    };
  }

  const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: person.email,
    options: { redirectTo: INVITE_REDIRECT_URL },
  });
  if (linkError || !link?.properties?.hashed_token) {
    return { ok: false, error: linkError?.message ?? "lien de première connexion non généré" };
  }

  const { data: program } = await adminClient
    .from("programs")
    .select("name")
    .eq("id", person.programId)
    .maybeSingle();
  const programName = (program as { name?: string } | null)?.name ?? "Campus Santé Augmenté";

  const transporter = nodemailer.createTransport({
    host: sender.smtp_host,
    port: sender.smtp_port,
    secure: sender.smtp_port === 465,
    auth: { user: sender.smtp_user, pass: password },
  });

  const prenom = person.fullName.trim().split(/\s+/)[0] ?? "";
  const subject = `Votre première connexion — ${programName}`;
  const text = [
    prenom ? `Bonjour ${prenom},` : "Bonjour,",
    "",
    `Votre compte est ouvert sur "${programName}" (Campus Santé Augmenté).`,
    "",
    "Pour définir votre mot de passe et vérifier vos informations, cliquez sur le lien suivant :",
    premiereConnexionUrl(link.properties.hashed_token, "recovery"),
    "",
    "Ce lien est personnel et à usage unique. Merci de ne pas le transférer.",
    "S'il a expiré, demandez-en un nouveau à l'équipe pédagogique.",
    "",
    `— ${sender.from_name}`,
  ].join("\n");

  try {
    await transporter.sendMail({
      from: `"${sender.from_name}" <${sender.smtp_user}>`,
      to: person.email,
      subject,
      text,
    });
  } catch (e) {
    return {
      ok: false,
      error: `envoi SMTP échoué : ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return { ok: true };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
