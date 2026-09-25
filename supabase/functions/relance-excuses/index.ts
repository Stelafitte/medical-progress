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

  /*
   * 25/09 -- LE MOT AUX ENCADRANTS, A LA DEMANDE DE STEF.
   *
   * Son connecteur de messagerie personnelle etant hors service (le backend
   * rendait les comptes d'un AUTRE utilisateur), le message part de l'adresse
   * de service. Le `replyTo` le ramene vers son adresse universitaire : un mot
   * de collegue a collegues doit se repondre a lui, pas a une boite d'envoi.
   *
   * CE MODE N'EST PAS UN RELAIS OUVERT, et c'est deliberé : le corps est ECRIT
   * ICI, les destinataires sont LUS EN BASE (les encadrants et responsables de
   * stage du programme). L'appelant ne choisit ni le texte ni les adresses ; il
   * peut seulement en RETIRER (`exclure`), jamais en ajouter. Un endpoint garde
   * par un seul secret qui accepterait un corps et une liste libres serait un
   * relais de courrier ouvert, quel que soit le soin mis a garder le secret.
   */
  const annonceEncadrants = (body as { annonceEncadrants?: unknown }).annonceEncadrants === true;
  if (annonceEncadrants) {
    const exclure = new Set(
      (Array.isArray((body as { exclure?: unknown }).exclure)
        ? ((body as { exclure: unknown[] }).exclure as unknown[])
        : []
      )
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().toLowerCase()),
    );
    const equipe = (people ?? []).filter(
      (p) =>
        (p.intended_role === "placement_supervisor" || p.intended_role === "placement_manager") &&
        !exclure.has((p.login_email ?? "").trim().toLowerCase()),
    );
    const sujet = "Campus DFASM Cardio \u2014 ce que c'est, et pourquoi je vous en parle";
    const corpsCommun = [
      "Vous avez re\u00e7u un lien de connexion \u00e0 \u00ab Campus Sant\u00e9 Augment\u00e9 \u00bb, la plateforme que nous testons cette ann\u00e9e avec les \u00e9tudiants de DFASM en stage de cardiologie. Un mot pour vous dire ce que c'est, et ce que \u00e7a peut vous apporter.",
      "",
      "Pour les \u00e9tudiants, l'id\u00e9e est simple : un seul endroit o\u00f9 ils retrouvent le programme du stage, les connaissances et les comp\u00e9tences attendues, les ressources p\u00e9dagogiques \u2014 cours, diaporamas, QCM, ECOS \u2014 et leur carnet de stage, qu'ils remplissent au fil des journ\u00e9es plut\u00f4t que de le reconstituer \u00e0 la fin.",
      "",
      "Pour nous, c'est d'abord de la visibilit\u00e9. On voit o\u00f9 chacun en est, ce qu'il a travaill\u00e9, ce qu'il d\u00e9clare avoir acquis \u2014 et donc qui aurait besoin d'\u00eatre repris avant la fin du stage. Un \u00e9tudiant peut aussi vous \u00e9crire directement depuis la plateforme, et la validation d'une comp\u00e9tence acquise en situation r\u00e9elle se fait en quelques clics.",
      "",
      "Deux choses importantes :",
      "",
      "\u2014 C'est exp\u00e9rimental, \u00e0 ce stade, pour tout le monde \u2014 moi compris. Rien n'est fig\u00e9, et ce qui vous para\u00eetra mal fichu m'int\u00e9resse plus que le reste.",
      "",
      "\u2014 Rien n'est obligatoire pour les \u00e9tudiants. Ils s'en serviront s'ils y trouvent leur compte. \u00c7a prend ou \u00e7a ne prend pas ; il n'y a aucun enjeu derri\u00e8re, ni pour eux, ni pour vous.",
      "",
      "Si vous n'avez plus votre lien de connexion, ou s'il a expir\u00e9, r\u00e9pondez simplement \u00e0 ce message : je vous en renvoie un. Chaque lien est personnel, je ne peux pas en mettre un commun ici.",
      "",
      "Si vous avez cinq minutes pour l'ouvrir et regarder, c'est d\u00e9j\u00e0 beaucoup. Et si quelque chose vous semble inutile ou mal fait, dites-le-moi.",
      "",
      "Bien cordialement,",
      "St\u00e9phane Lafitte",
    ];
    let envoyesAnnonce = 0;
    const echecsAnnonce: Array<{ email: string; error: string }> = [];
    for (const p of equipe) {
      const prenom = (p.first_name ?? "").trim();
      const text = [prenom ? `Cher ${prenom},` : "Chers coll\u00e8gues,", "", ...corpsCommun].join(
        "\n",
      );
      try {
        await transporter.sendMail({
          from: `"Pr St\u00e9phane Lafitte (Campus DFASM Cardio)" <${sender.smtp_user}>`,
          replyTo: "stephane.lafitte@u-bordeaux.fr",
          to: p.login_email,
          subject: sujet,
          text,
        });
        envoyesAnnonce++;
      } catch (e) {
        echecsAnnonce.push({
          email: p.login_email,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    return json(
      { annonceEncadrants: true, cibles: equipe.length, envoyes: envoyesAnnonce, echecs: echecsAnnonce },
      200,
    );
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
        `Nous vous avons adressé il y a quelques jours une invitation à rejoindre la plateforme "${program.name}" (Campus Santé Augmenté).`,
        "Ce message ne vous est très probablement jamais parvenu — notre serveur d'envoi le bloquait sans nous le dire — ou bien le lien qu'il contenait avait expiré avant que vous ne l'ouvriez. Nous vous prions de bien vouloir nous excuser pour ce désagrément.",
        "",
        "Le problème est corrigé et vérifié. Voici un nouveau lien personnel, valable 7 jours :",
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
