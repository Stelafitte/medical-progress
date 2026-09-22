// supabase/functions/relance-excuses/index.ts
//
// 21/09 -- RELANCE PONCTUELLE, AVEC EXCUSES, des personnes d'un programme qui
// ne se sont JAMAIS connectees. Contexte : le week-end du 19-20/09, les
// invitations DFASM portaient un lien Supabase valable une heure ; la plupart
// des destinataires sont tombes sur « lien expire ». Corrige le 21/09 (liens a
// nous, 7 jours). Cette fonction renvoie a chacun un nouveau lien de 7 jours,
// avec un mot d'excuse, sur demande explicite de Stef le 21/09.
//
// ACCES : reserve au detenteur du secret RELANCE_SECRET (relais de Stef).
// Aucun utilisateur de l'application ne peut la declencher.
//
// Entree  : POST { programCode: string, dryRun?: boolean }
// Sortie  : { cibles, envoyes, echecs: [{ email, error }] } -- aucune adresse
//           en clair dans la reponse, sauf pour un echec.

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = (
  Deno.env.get("PUBLIC_APP_URL") ?? "https://stelafitte-medical-progress.dfasm-connect.workers.dev"
).replace(/\/+$/, "");

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

/**
 * 21/09 (incident de 15 h 34) : ON NE REVOQUE PLUS AVANT D'AVOIR ENVOYE.
 * L'ancienne version revoquait les liens precedents PUIS envoyait ; quand le
 * serveur SMTP a refuse l'authentification, 17 etudiants ont perdu le lien
 * valable deja dans leur boite, sans en recevoir de nouveau. Desormais : on
 * cree le nouveau lien, on envoie, et `apresEnvoi` revoque les anciens
 * seulement si l'envoi a reussi — sinon c'est le nouveau, jamais parti, qui
 * est revoque.
 */
async function lienInvitation(
  adminClient: ReturnType<typeof createClient>,
  email: string,
): Promise<{ lien: string; id: string }> {
  const adresse = email.trim().toLowerCase();
  const jeton = jetonAleatoire();
  const { data, error } = await adminClient
    .from("invitation_links")
    .insert({ email: adresse, token_hash: await empreinte(jeton) })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`lien d'invitation non enregistre : ${error?.message ?? "?"}`);
  return {
    // 22/09 : jamais « workers.dev » dans un courriel (filtre en sortie par OVH,
    // voir supabase/functions/lien). Le lien passe par supabase.co, qui renvoie
    // vers la page de premiere connexion.
    lien: `${SUPABASE_URL}/functions/v1/lien?${new URLSearchParams({ i: jeton }).toString()}`,
    id: (data as { id: string }).id,
  };
}

async function apresEnvoi(
  adminClient: ReturnType<typeof createClient>,
  email: string,
  id: string,
  envoye: boolean,
): Promise<void> {
  const maintenant = new Date().toISOString();
  if (envoye) {
    await adminClient
      .from("invitation_links")
      .update({ revoked_at: maintenant })
      .eq("email", email.trim().toLowerCase())
      .neq("id", id)
      .is("revoked_at", null);
  } else {
    await adminClient.from("invitation_links").update({ revoked_at: maintenant }).eq("id", id);
  }
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);
  const secret = Deno.env.get("RELANCE_SECRET") ?? "";
  if (secret.length < 32 || req.headers.get("x-relance-secret") !== secret) {
    return json({ error: "interdit" }, 403);
  }
  let body: { programCode?: unknown; dryRun?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }
  const programCode = typeof body.programCode === "string" ? body.programCode : "";
  const dryRun = body.dryRun !== false;
  // 21/09 : verifie la connexion SMTP du programme sans rien envoyer.
  const testSmtp = (body as { testSmtp?: unknown }).testSmtp === true;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: program } = await admin
    .from("programs")
    .select("id, name")
    .eq("code", programCode)
    .maybeSingle();
  if (!program) return json({ error: "programme introuvable" }, 404);

  const { data: people, error: pErr } = await admin
    .from("people")
    .select("first_name, login_email, status, intended_cohort_id, intended_role")
    .eq("program_id", program.id)
    .in("status", ["invited", "activated"]);
  if (pErr) return json({ error: pErr.message }, 500);

  // Derniere connexion : auth.users, lisible seulement par l'API admin.
  const derniere = new Map<string, string | null>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return json({ error: error.message }, 500);
    for (const u of data.users) {
      if (u.email) derniere.set(u.email.toLowerCase(), u.last_sign_in_at ?? null);
    }
    if (data.users.length < 1000) break;
  }

  const cibles = (people ?? []).filter(
    (p) => derniere.has(p.login_email) && derniere.get(p.login_email) === null,
  );
  const estEncadrant = (p: { intended_role?: string | null; intended_cohort_id?: string | null }) =>
    !p.intended_cohort_id && (p.intended_role ?? "").startsWith("placement_");
  const resume = {
    cibles: cibles.length,
    etudiants: cibles.filter((p) => !estEncadrant(p)).length,
    encadrants: cibles.filter(estEncadrant).length,
  };
  const veutTestEnvoi = typeof (body as { testEnvoi?: unknown }).testEnvoi === "string";
  if (dryRun && !testSmtp && !veutTestEnvoi) return json({ dryRun: true, ...resume }, 200);

  const { data: sender } = await admin
    .from("program_email_senders")
    .select("smtp_host, smtp_port, smtp_user, smtp_password_secret, from_name")
    .eq("program_id", program.id)
    .maybeSingle();
  if (!sender) return json({ error: "aucun expediteur pour ce programme" }, 500);
  const password = Deno.env.get(sender.smtp_password_secret);
  if (!password) return json({ error: "secret SMTP absent" }, 500);
  const transporter = nodemailer.createTransport({
    host: sender.smtp_host,
    port: sender.smtp_port,
    secure: sender.smtp_port === 465,
    auth: { user: sender.smtp_user, pass: password },
  });

  /*
   * 21/09 (nuit) : DIAGNOSTIC D'ACHEMINEMENT. Un courriel de test vers une
   * adresse donnee, avec la transcription SMTP complete : ce que le serveur
   * d'OVH repond vraiment (250 + identifiant de file, ou refus), et par quel
   * port. Sert a distinguer « OVH n'accepte pas » de « OVH accepte puis ne
   * livre pas ».
   */
  const testEnvoi = (body as { testEnvoi?: unknown }).testEnvoi;
  if (typeof testEnvoi === "string" && testEnvoi.includes("@")) {
    const port = (body as { port?: unknown }).port === 587 ? 587 : sender.smtp_port;
    const journal: string[] = [];
    const note =
      (niveau: string) =>
      (_o: unknown, ...m: unknown[]) =>
        journal.push(`${niveau} ${m.map((x) => String(x)).join(" ")}`.slice(0, 400));
    const t = nodemailer.createTransport({
      host: sender.smtp_host,
      port,
      secure: port === 465,
      auth: { user: sender.smtp_user, pass: password },
      logger: {
        info: note("I"),
        debug: note("D"),
        warn: note("W"),
        error: note("E"),
        trace: note("T"),
        fatal: note("F"),
        level: () => undefined,
        child: () => undefined,
      } as unknown as boolean,
      debug: true,
    });
    try {
      const info = await t.sendMail({
        from: `"${sender.from_name}" <${sender.smtp_user}>`,
        to: testEnvoi,
        subject: `Test d'acheminement ${String((body as { etiquette?: unknown }).etiquette ?? "")} ${new Date().toISOString().slice(0, 16)}`,
        text:
          typeof (body as { corps?: unknown }).corps === "string"
            ? String((body as { corps?: unknown }).corps)
            : "Courriel de test envoye par la plateforme pour verifier l'acheminement. Aucune action requise.",
      });
      return json(
        { envoi: "accepte", port, info, from_name: sender.from_name, journal: journal.slice(-40) },
        200,
      );
    } catch (e) {
      return json(
        {
          envoi: "echec",
          port,
          error: e instanceof Error ? e.message : String(e),
          journal: journal.slice(-40),
        },
        200,
      );
    }
  }

  if (testSmtp) {
    try {
      await transporter.verify();
      return json({ smtp: "ok", host: sender.smtp_host, user: sender.smtp_user }, 200);
    } catch (e) {
      return json(
        {
          smtp: "echec",
          host: sender.smtp_host,
          port: sender.smtp_port,
          user: sender.smtp_user,
          secret: sender.smtp_password_secret,
          error: e instanceof Error ? e.message : String(e),
        },
        200,
      );
    }
  }

  let envoyes = 0;
  const echecs: Array<{ email: string; error: string }> = [];
  for (const p of cibles) {
    try {
      const { lien, id: lienId } = await lienInvitation(admin, p.login_email);
      const prenom = (p.first_name ?? "").trim();
      const encadrant = estEncadrant(p);
      const text = [
        prenom ? `Bonjour ${prenom},` : "Bonjour,",
        "",
        `Vous avez récemment reçu une invitation à rejoindre la plateforme "${program.name}" (Campus Santé Augmenté).`,
        "Beaucoup d'entre vous sont tombés sur le message « lien expiré » : le lien envoyé n'était valable que très peu de temps. Nous vous prions de bien vouloir nous excuser pour ce désagrément.",
        "",
        "Le problème est corrigé. Voici un nouveau lien personnel, valable 7 jours :",
        lien,
        "",
        encadrant
          ? "Pourriez-vous tester à nouveau votre connexion ? Le lien vous permet de vérifier vos informations puis de choisir votre mot de passe ; vous accéderez ensuite à votre espace encadrant."
          : "Pourriez-vous tester à nouveau votre connexion ? Le lien vous permet de vérifier vos informations puis de choisir votre mot de passe.",
        "Si le lien a expiré au moment où vous l'ouvrez, la page vous proposera d'en recevoir un nouveau.",
        "",
        "Ce lien est personnel : merci de ne pas le transférer.",
        "",
        "Merci de votre compréhension et bien cordialement,",
        `— ${sender.from_name}`,
      ].join("\n");
      try {
        await transporter.sendMail({
          from: `"${sender.from_name}" <${sender.smtp_user}>`,
          to: p.login_email,
          subject: `Nouveau lien de connexion — ${program.name}`,
          text,
        });
      } catch (e) {
        await apresEnvoi(admin, p.login_email, lienId, false);
        throw e;
      }
      await apresEnvoi(admin, p.login_email, lienId, true);
      envoyes++;
      await new Promise((r) => setTimeout(r, 700));
    } catch (e) {
      echecs.push({ email: p.login_email, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ dryRun: false, ...resume, envoyes, echecs }, 200);
});
