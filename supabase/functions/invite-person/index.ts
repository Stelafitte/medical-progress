// supabase/functions/invite-person/index.ts
//
// Invite un ou plusieurs `people` par e-mail via l'API admin Supabase Auth.
// Voir docs/database/draft/decision_log.md, décision D94.
//
// MODÈLE DE SÉCURITÉ :
// - Le JWT de l'appelant (transmis par le client) sert à construire un
//   client Supabase "scopé utilisateur". Toute lecture/écriture sur
//   `people` par ce client passe par les policies RLS existantes
//   (people_select_staff / people_update_staff -> is_program_staff()).
//   Cette fonction ne réimplémente AUCUNE logique d'autorisation : si la
//   RLS laisse passer la lecture, l'appelant est légitimement personnel du
//   programme concerné.
// - Un second client, scopé service_role, sert UNIQUEMENT pour l'unique
//   opération qui a réellement besoin d'un privilège élevé : la création
//   du compte auth.users invité via admin.inviteUserByEmail. Il n'est
//   utilisé nulle part ailleurs dans cette fonction.
//
// Entrée  : POST { personIds: string[] }  (max 100 par appel)
// Sortie  : { results: Array<{ personId, ok, error? }> }

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Page où l'e-mail d'invitation renvoie une fois le mot de passe défini.
// Facultatif : si absent, Supabase utilise l'URL de redirection par défaut
// configurée dans le projet (Auth > URL Configuration).
const INVITE_REDIRECT_URL = Deno.env.get("INVITE_REDIRECT_URL") ?? undefined;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
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

  // Client scopé sur l'utilisateur appelant : la RLS existante décide seule
  // s'il a le droit de voir/modifier ces personnes. Aucune vérification de
  // rôle réimplémentée ici.
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

  // Client service_role : réservé au seul appel admin d'invitation.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const foundIds = new Set((people ?? []).map((p) => p.id));
  const results: Array<{ personId: string; ok: boolean; error?: string }> = [];

  // Ids demandés mais absents du résultat filtré par RLS : soit ils
  // n'existent pas, soit l'appelant n'a pas le droit de les voir. Dans les
  // deux cas, on ne fait rien et on le signale explicitement plutôt que de
  // les ignorer silencieusement.
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

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      person.login_email,
      {
        data: { full_name: `${person.first_name} ${person.last_name}`.trim() },
        redirectTo: INVITE_REDIRECT_URL,
      },
    );

    if (inviteError) {
      results.push({ personId: person.id, ok: false, error: inviteError.message });
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

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
