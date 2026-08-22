// supabase/functions/invite-person/index.ts
//
// Invite un ou plusieurs `people` par e-mail. Voir décisions D94 (mécanisme
// d'invitation) et D95 (expéditeur SMTP dédié par programme) dans
// docs/database/draft/decision_log.md.
//
// MODÈLE DE SÉCURITÉ :
// - Le JWT de l'appelant sert à construire un client "scopé utilisateur" :
//   toute lecture/écriture sur `people` passe par les policies RLS
//   existantes (people_select_staff / people_update_staff ->
//   is_program_staff()). Aucune logique d'autorisation réimplémentée.
// - Un client service_role est utilisé pour : (a) l'appel admin qui crée
//   le compte invité (inviteUserByEmail OU generateLink selon le
//   programme), (b) la lecture de program_email_senders (config
//   d'infrastructure, jamais exposée via RLS aux program staff).
//
// DEUX CHEMINS D'ENVOI, selon si le programme a un expéditeur dédié :
// - Programme SANS ligne dans program_email_senders (ex. le pilote
//   "Campus Santé" tant que non configuré) : chemin historique D94,
//   Supabase envoie lui-même l'e-mail via inviteUserByEmail (expéditeur
//   générique noreply@mail.app.supabase.io).
// - Programme AVEC une ligne dans program_email_senders (ex. DFASM,
//   DIU écho, DPC/ODP2C une fois configurés) : on récupère juste le lien
//   d'invitation via generateLink (Supabase ne l'envoie PAS), et on
//   envoie nous-mêmes l'e-mail via le SMTP OVH du programme concerné,
//   avec son propre nom de domaine comme expéditeur.
//
// Entrée  : POST { personIds: string[] }  (max 100 par appel)
// Sortie  : { results: Array<{ personId, ok, error? }> }

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INVITE_REDIRECT_URL = Deno.env.get("INVITE_REDIRECT_URL") ?? undefined;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
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
  if (!authHeader) {
    return json({ error: "Authentification requise." }, 401);
  }

  let body: { personIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }

  const personIds = Array.isArray(body.personIds)
    ? body.personIds.filter((id): id is string => typeof id === "string")
    : [];

  if (personIds.length === 0) {
    return json({ error: "personIds (tableau non vide) requis." }, 400);
  }
  if (personIds.length > 100) {
    return json({ error: "Maximum 100 invitations par appel." }, 400);
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

  const { data: people, error: peopleError } = await userClient
    .from("people")
    .select("id, first_name, last_name, login_email, program_id, status")
    .in("id", personIds);

  if (peopleError) {
    return json({ error: peopleError.message }, 500);
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const foundIds = new Set((people ?? []).map((p) => p.id));
  const results: Array<{ personId: string; ok: boolean; error?: string }> = [];

  for (const id of personIds) {
    if (!foundIds.has(id)) {
      results.push({ personId: id, ok: false, error: "introuvable ou hors périmètre" });
    }
  }

  for (const person of people ?? []) {
    if (person.status === "activated") {
      results.push({ personId: person.id, ok: false, error: "déjà activée" });
      continue;
    }
    if (person.status === "cancelled") {
      results.push({ personId: person.id, ok: false, error: "invitation annulée" });
      continue;
    }

    // Le programme a-t-il un expéditeur SMTP dédié ?
    const { data: sender, error: senderLookupError } = await adminClient
      .from("program_email_senders")
      .select("smtp_host, smtp_port, smtp_user, smtp_password_secret, from_name")
      .eq("program_id", person.program_id)
      .maybeSingle();

    if (senderLookupError) {
      results.push({ personId: person.id, ok: false, error: senderLookupError.message });
      continue;
    }

    const inviteResult = sender
      ? await sendWithDedicatedSender(adminClient, person, sender)
      : await sendWithSupabaseDefault(adminClient, person);

    if (!inviteResult.ok) {
      results.push({ personId: person.id, ok: false, error: inviteResult.error });
      continue;
    }

    // Écrit via le client utilisateur : la policy people_update_staff
    // s'applique normalement, aucun besoin de service_role ici.
    const { error: updateError } = await userClient
      .from("people")
      .update({
        status: "invited",
        invited_at: new Date().toISOString(),
        invited_by: caller.id,
      })
      .eq("id", person.id);

    if (updateError) {
      results.push({
        personId: person.id,
        ok: false,
        error: `e-mail envoyé, mais statut non mis à jour : ${updateError.message}`,
      });
      continue;
    }

    results.push({ personId: person.id, ok: true });
  }

  return json({ results }, 200);
});

// Chemin historique (D94) : Supabase crée le compte ET envoie lui-même
// l'e-mail avec son expéditeur générique. Utilisé pour tout programme sans
// ligne dans program_email_senders.
async function sendWithSupabaseDefault(
  adminClient: ReturnType<typeof createClient>,
  person: { login_email: string; first_name: string; last_name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient.auth.admin.inviteUserByEmail(person.login_email, {
    data: { full_name: `${person.first_name} ${person.last_name}`.trim() },
    redirectTo: INVITE_REDIRECT_URL,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Chemin dédié (D95) : on récupère juste le lien via generateLink (Supabase
// n'envoie PAS d'e-mail dans ce cas) et on l'envoie nous-mêmes via le SMTP
// OVH propre au programme, avec son propre nom de domaine en expéditeur.
async function sendWithDedicatedSender(
  adminClient: ReturnType<typeof createClient>,
  person: { id: string; login_email: string; first_name: string; last_name: string; program_id: string },
  sender: { smtp_host: string; smtp_port: number; smtp_user: string; smtp_password_secret: string; from_name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const password = Deno.env.get(sender.smtp_password_secret);
  if (!password) {
    return {
      ok: false,
      error: `secret SMTP "${sender.smtp_password_secret}" absent — configurer ce secret dans Edge Functions > Secrets avant d'inviter ce programme`,
    };
  }

  const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: person.login_email,
    options: {
      data: { full_name: `${person.first_name} ${person.last_name}`.trim() },
      redirectTo: INVITE_REDIRECT_URL,
    },
  });
  if (linkError || !link?.properties?.action_link) {
    return { ok: false, error: linkError?.message ?? "lien d'invitation non généré" };
  }

  const { data: program } = await adminClient
    .from("programs")
    .select("name")
    .eq("id", person.program_id)
    .maybeSingle();
  const programName = program?.name ?? "Campus Santé Augmenté";

  const transporter = nodemailer.createTransport({
    host: sender.smtp_host,
    port: sender.smtp_port,
    secure: sender.smtp_port === 465,
    auth: { user: sender.smtp_user, pass: password },
  });

  const subject = `Invitation — ${programName}`;
  const text = [
    `Bonjour ${person.first_name},`,
    "",
    `Vous avez été inscrit(e) au programme "${programName}" sur Campus Santé Augmenté.`,
    "",
    "Pour activer votre compte et définir votre mot de passe, cliquez sur le lien suivant :",
    link.properties.action_link,
    "",
    "Ce lien est personnel, merci de ne pas le transférer.",
    "",
    `— ${sender.from_name}`,
  ].join("\n");

  try {
    await transporter.sendMail({
      from: `"${sender.from_name}" <${sender.smtp_user}>`,
      to: person.login_email,
      subject,
      text,
    });
  } catch (e) {
    return { ok: false, error: `envoi SMTP échoué : ${e instanceof Error ? e.message : String(e)}` };
  }

  return { ok: true };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
