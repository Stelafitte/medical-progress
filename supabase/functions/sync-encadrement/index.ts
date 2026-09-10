/* ==================================================================
   SYNCHRONISATION DE L'EQUIPE D'ENCADREMENT DEPUIS UN SERVICE.

   CETTE FONCTION NE FAIT QUE LE RESEAU. Elle appelle la source, lit la
   reponse, et repasse la liste a `apply_encadrement_sync`. Tout ce qui
   DECIDE — rapprocher, inserer, proposer un retrait — vit en SQL : c'est
   eprouvable au banc d'essai avant d'etre execute, c'est atomique, et une
   fonction SQL suit les migrations alors qu'une fonction edge se redeploie
   a la main depuis un tableau de bord.

   L'AUTORISATION EST PORTEE PAR LA RLS, jamais par un test de role ecrit
   ici : on relit la source avec le JETON DE L'APPELANT. Si la policy
   `encadrement_sources_select` ne la rend pas, l'appelant n'administre pas
   ce programme et la fonction s'arrete. Meme geste que `send-campaign` — un
   test ecrit a la main aurait pu diverger de la policy.

   ⚠️ LE JETON NE TRAVERSE JAMAIS LE NAVIGATEUR. Il est resolu ici par
   `resolve_encadrement_source`, revoquee jusqu'a `authenticated` comprise et
   accordee au seul `service_role`. Le navigateur envoie un identifiant de
   source, rien d'autre.

   ⚠️ ET IL N'EST JAMAIS JOURNALISE. Aucun `console.log` de l'en-tete, de
   l'URL complete, ni de la reponse brute. Un journal d'erreur est l'endroit
   ou les secrets fuient le plus souvent, parce que personne ne le relit.
   ================================================================== */

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* La source est une application tierce : on ne l'attend pas indefiniment.
   Sans cela, une source qui ne repond plus fige la fonction jusqu'au
   plafond de la plateforme, et l'ecran reste sur un bouton qui tourne. */
const TIMEOUT_MS = 15000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface Membre {
  prenom?: string;
  nom?: string;
  email?: string;
  categorie?: string;
  encadrant?: boolean;
}

/* La reponse peut etre un objet `{ membres: [...] }` ou, si la source change
   un jour, un tableau nu. On accepte les deux plutot que de parier — mais on
   REFUSE tout le reste, au lieu de deviner. */
function extraireMembres(charge: unknown): Membre[] | null {
  if (Array.isArray(charge)) return charge as Membre[];
  if (charge && typeof charge === "object") {
    const m = (charge as Record<string, unknown>)["membres"];
    if (Array.isArray(m)) return m as Membre[];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Methode non autorisee." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authentification requise." }, 401);

  let sourceId: string;
  let dryRun = false;
  try {
    const corps = await req.json();
    sourceId = String(corps?.sourceId ?? "");
    dryRun = corps?.dryRun === true;
    if (!sourceId) throw new Error("sourceId manquant");
  } catch {
    return json({ error: "Requete illisible : `sourceId` est attendu." }, 400);
  }

  /* 1. L'APPELANT A-T-IL LE DROIT ? C'est la policy qui repond. */
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  /* QUI LANCE LA SYNCHRONISATION — le journal doit pouvoir le dire, sinon
     « 3 ajouts le 10/09 » ne renvoie a personne. On le lit ici, sous la
     session de l'appelant : c'est la seule source honnete. */
  const { data: utilisateur } = await userClient.auth.getUser();
  const lanceePar = utilisateur?.user?.id ?? null;
  const { data: source, error: erreurSource } = await userClient
    .from("encadrement_sources")
    .select("id, label, active")
    .eq("id", sourceId)
    .maybeSingle();

  if (erreurSource) return json({ error: "Source illisible." }, 500);
  if (!source) return json({ error: "Source introuvable ou droits insuffisants." }, 403);
  if (!source.active) return json({ error: "Cette source est desactivee." }, 409);

  /* 2. L'ADRESSE ET LE JETON — hors de portee du navigateur. */
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: resolu, error: erreurResolution } = await adminClient
    .rpc("resolve_encadrement_source", { p_source_id: sourceId });

  if (erreurResolution || !resolu || resolu.length === 0) {
    return json({ error: "Jeton introuvable pour cette source." }, 500);
  }
  const { endpoint_url: url, token } = resolu[0] as { endpoint_url: string; token: string };

  /* 3. L'APPEL A LA SOURCE.
     LE JETON PART EN EN-TETE, JAMAIS DANS L'ADRESSE : une URL se retrouve
     dans les journaux d'acces, les referrers et les rapports d'erreur. La
     source accepte `Authorization: Bearer` depuis le 10/09. */
  const minuteur = AbortSignal.timeout(TIMEOUT_MS);
  let reponse: Response;
  try {
    reponse = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: minuteur,
    });
  } catch (raison) {
    /* On rapporte la NATURE de l'echec, jamais l'URL ni l'en-tete. */
    const cause = raison instanceof Error && raison.name === "TimeoutError"
      ? `La source n'a pas repondu en ${TIMEOUT_MS / 1000} secondes.`
      : "La source est injoignable.";
    return json({ error: cause }, 502);
  }

  if (reponse.status === 401 || reponse.status === 403 || reponse.status === 404) {
    /* 404 EST LE CAS NORMAL D'UN JETON REVOQUE sur cette source : l'adresse
       n'existe que pour un jeton valide. On le dit en clair, sinon
       l'administrateur cherchera une panne reseau. */
    return json({
      error: "La source refuse ce jeton (revoque, expire ou invalide). Regenerez-le cote UMCV.",
    }, 401);
  }
  if (!reponse.ok) {
    return json({ error: `La source a repondu ${reponse.status}.` }, 502);
  }

  let charge: unknown;
  try {
    charge = await reponse.json();
  } catch {
    return json({ error: "La source n'a pas renvoye du JSON lisible." }, 502);
  }

  const membres = extraireMembres(charge);
  if (!membres) {
    return json({ error: "La reponse ne contient pas de liste de membres." }, 502);
  }

  /* 4. TESTER SANS ECRIRE. Le bouton « Tester la connexion » s'arrete ici :
     il prouve que l'adresse et le jeton fonctionnent, et montre ce qui
     arriverait — sans toucher au vivier. Les adresses ne sont pas masquees
     ici, contrairement a `send-campaign` : ce sont des adresses
     PROFESSIONNELLES d'un service, deja connues de l'administrateur, et
     c'est precisement ce qu'il doit relire avant d'enregistrer. */
  if (dryRun) {
    return json({
      dryRun: true,
      source: source.label,
      membres_lus: membres.length,
      encadrants: membres.filter((m) => m.encadrant === true).length,
      apercu: membres.slice(0, 20),
    });
  }

  /* 5. LA DECISION, EN SQL, SOUS LA SESSION DE L'APPELANT. */
  const { data: rapport, error: erreurApplication } = await userClient
    .rpc("apply_encadrement_sync", { p_source_id: sourceId, p_members: membres });

  if (erreurApplication) {
    await adminClient.from("encadrement_sync_runs").insert({
      source_id: sourceId,
      status: "failed",
      finished_at: new Date().toISOString(),
      members_seen: membres.length,
      error_message: erreurApplication.message.slice(0, 2000),
      run_by: lanceePar,
    });
    return json({ error: erreurApplication.message }, 400);
  }

  const r = rapport as Record<string, unknown[]>;
  await adminClient.from("encadrement_sync_runs").insert({
    source_id: sourceId,
    status: "succeeded",
    finished_at: new Date().toISOString(),
    members_seen: membres.length,
    people_added: (r.ajoutes ?? []).length,
    removals_proposed: (r.absents ?? []).length,
    unchanged: (r.inchanges ?? []).length,
    run_by: lanceePar,
  });

  await adminClient
    .from("encadrement_sources")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", sourceId);

  return json({ source: source.label, ...(rapport as object) });
});
