/* ==================================================================
   ENVOI D'UNE CAMPAGNE — chantier A de la communication.

   POURQUOI CETTE FONCTION EXISTE, et pourquoi le navigateur ne peut pas
   faire ce travail : `profiles` n'a AUCUNE colonne e-mail, et la RLS ne
   donne l'adresse qu'a son titulaire. La liste des destinataires ne peut
   donc etre composee QUE cote serveur. Ce n'est pas un choix de confort.

   L'AUTORISATION EST PORTEE PAR LA RLS, pas par un test de role ecrit ici :
   on relit la campagne avec le JETON DE L'APPELANT. Si la policy
   `communication_campaigns_select` ne la rend pas, l'appelant n'est pas du
   personnel du programme et la fonction s'arrete. Un test de role ecrit a la
   main aurait pu diverger de la policy ; la, c'est la meme regle.

   CE QUI EST DELIBEREMENT LIMITE EN V1 :
   - trois audiences seulement : `cohort`, `persons`, `program_all`. Les
     autres (`milestone_incomplete`, `overdue`, `dynamic_filter`...) sont
     REFUSEES explicitement plutot que traitees a moitie.
   - les adresses ne sont JAMAIS renvoyees en clair au navigateur, meme a
     l'administrateur : le mode `dryRun` rend une forme masquee
     (`s***e@gmail.com`). Assez pour verifier, inutilisable pour extraire un
     fichier d'adresses.
   ================================================================== */

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORTED_AUDIENCES = ["cohort", "persons", "program_all"] as const;

/* Les variables autorisees par le domaine (src/domain/communication.ts).
   Toute autre est laissee telle quelle et signalee, jamais devinee. */
const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

interface Recipient {
  personId: string;
  fullName: string;
  email: string;
  cohortId: string;
  cohortLabel: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authentification requise." }, 401);

  let body: { campaignId?: unknown; dryRun?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }

  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  const dryRun = body.dryRun === true;
  if (!campaignId) return json({ error: "campaignId requis." }, 400);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user: caller }, error: callerError } = await userClient.auth.getUser();
  if (callerError || !caller) return json({ error: "Session invalide." }, 401);

  /* L'AUTORISATION, EN UNE REQUETE : lue avec le jeton de l'appelant, donc
     filtree par `communication_campaigns_select`. Absente = pas le droit. */
  const { data: campaign, error: campaignError } = await userClient
    .from("communication_campaigns")
    .select(
      "id, program_id, channel, audience, subject, body, status, max_recipients," +
        " requires_collective_confirmation, collective_confirmation_at",
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError) return json({ error: campaignError.message }, 500);
  if (!campaign) {
    return json({ error: "Campagne introuvable, ou hors de votre perimetre." }, 403);
  }

  if (campaign.channel !== "email") {
    return json({ error: `Canal "${campaign.channel}" non pris en charge : seul l'e-mail existe.` }, 400);
  }
  if (campaign.status === "completed" || campaign.status === "running") {
    return json({ error: `Campagne deja "${campaign.status}" : renvoi refuse.` }, 409);
  }
  if (campaign.status === "cancelled") {
    return json({ error: "Campagne annulee." }, 409);
  }

  const audience = campaign.audience as { kind?: string; cohortId?: string; personIds?: string[] };
  if (!audience?.kind || !SUPPORTED_AUDIENCES.includes(audience.kind as never)) {
    return json(
      {
        error:
          `Audience "${audience?.kind ?? "?"}" non prise en charge dans cette version.` +
          ` Disponibles : ${SUPPORTED_AUDIENCES.join(", ")}.`,
      },
      400,
    );
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  /* ---------------------------------------------------------------
     1. RESOLUTION DE L'AUDIENCE — inscriptions ACTIVES du programme.
     Une inscription retiree n'est pas un destinataire.
     --------------------------------------------------------------- */
  let query = adminClient
    .from("enrollments")
    .select("person_id, cohort_id, status, cohorts(label)")
    .eq("program_id", campaign.program_id)
    .eq("status", "active");

  if (audience.kind === "cohort") {
    if (!audience.cohortId) return json({ error: "audience.cohortId manquant." }, 400);
    query = query.eq("cohort_id", audience.cohortId);
  } else if (audience.kind === "persons") {
    const ids = Array.isArray(audience.personIds) ? audience.personIds : [];
    if (ids.length === 0) return json({ error: "audience.personIds vide." }, 400);
    query = query.in("person_id", ids);
  }

  const { data: enrollments, error: enrollError } = await query;
  if (enrollError) return json({ error: enrollError.message }, 500);
  if (!enrollments || enrollments.length === 0) {
    return json({ error: "Aucune inscription active ne correspond a cette audience." }, 422);
  }

  const personIds = [...new Set(enrollments.map((e) => e.person_id as string))];

  /* ---------------------------------------------------------------
     2. LES ADRESSES — deux sources, jointes ici et nulle part ailleurs.
     `people.login_email` porte l'adresse d'invitation ; apres activation
     c'est `auth.users.email` qui fait foi (l'etudiant a pu la changer).
     On prend donc auth en priorite, et `people` en repli.
     --------------------------------------------------------------- */
  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, full_name")
    .in("id", personIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));

  const { data: staged } = await adminClient
    .from("people")
    .select("activated_profile_id, login_email")
    .in("activated_profile_id", personIds);
  const stagedEmailById = new Map(
    (staged ?? [])
      .filter((p) => p.activated_profile_id)
      .map((p) => [p.activated_profile_id as string, p.login_email as string]),
  );

  const emailById = new Map<string, string>();
  for (const id of personIds) {
    const { data: authUser } = await adminClient.auth.admin.getUserById(id);
    const email = authUser?.user?.email ?? stagedEmailById.get(id) ?? "";
    if (email) emailById.set(id, email);
  }

  /* ---------------------------------------------------------------
     3. LES EXCLUS — desabonnes, et adresses introuvables.
     Decision de Stef du 04/09 : TOUT est desabonnable, y compris les
     rappels. La contrepartie est de COMPTER les exclus et de les rendre,
     sinon un responsable croit avoir touche tout le monde.
     --------------------------------------------------------------- */
  const { data: prefs } = await adminClient
    .from("communication_preferences")
    .select("person_id, opted_out")
    .eq("channel", "email")
    .in("person_id", personIds);
  const optedOut = new Set(
    (prefs ?? []).filter((p) => p.opted_out).map((p) => p.person_id as string),
  );

  const recipients: Recipient[] = [];
  const excludedOptedOut: string[] = [];
  const excludedNoAddress: string[] = [];

  for (const enrollment of enrollments) {
    const id = enrollment.person_id as string;
    if (recipients.some((r) => r.personId === id)) continue;
    if (optedOut.has(id)) {
      if (!excludedOptedOut.includes(id)) excludedOptedOut.push(id);
      continue;
    }
    const email = emailById.get(id);
    if (!email) {
      if (!excludedNoAddress.includes(id)) excludedNoAddress.push(id);
      continue;
    }
    const cohort = enrollment.cohorts as { label?: string } | null;
    recipients.push({
      personId: id,
      fullName: nameById.get(id) ?? "Apprenant",
      email,
      cohortId: enrollment.cohort_id as string,
      cohortLabel: cohort?.label ?? "",
    });
  }

  /* ---------------------------------------------------------------
     4. LES GARDE-FOUS — avant tout envoi, jamais apres.
     --------------------------------------------------------------- */
  if (recipients.length === 0) {
    return json(
      {
        error: "Aucun destinataire joignable.",
        excludedOptedOut: excludedOptedOut.length,
        excludedNoAddress: excludedNoAddress.length,
      },
      422,
    );
  }
  if (recipients.length > campaign.max_recipients) {
    return json(
      {
        error:
          `${recipients.length} destinataires depassent le plafond de ${campaign.max_recipients}.` +
          " Relever le plafond de la campagne ou restreindre l'audience.",
      },
      422,
    );
  }
  if (
    campaign.requires_collective_confirmation &&
    !campaign.collective_confirmation_at &&
    recipients.length > 1
  ) {
    return json(
      {
        error:
          `Envoi collectif vers ${recipients.length} personnes :` +
          " confirmation explicite requise avant expedition.",
        recipientCount: recipients.length,
      },
      428,
    );
  }

  const { data: program } = await adminClient
    .from("programs")
    .select("name")
    .eq("id", campaign.program_id)
    .maybeSingle();
  const programName = (program?.name as string) ?? "Campus Sante Augmente";

  /* ---------------------------------------------------------------
     5. LE MODE ESSAI — on rend ce qui PARTIRAIT, sans rien envoyer et
     sans ecrire la moindre ligne de trace.
     --------------------------------------------------------------- */
  if (dryRun) {
    return json(
      {
        dryRun: true,
        programName,
        recipientCount: recipients.length,
        excludedOptedOut: excludedOptedOut.length,
        excludedNoAddress: excludedNoAddress.length,
        recipients: recipients.map((r) => ({
          personId: r.personId,
          fullName: r.fullName,
          email: maskEmail(r.email),
          cohortLabel: r.cohortLabel,
        })),
        subjectPreview: render(campaign.subject as string, recipients[0], programName),
        unresolvedVariables: unresolved(
          `${campaign.subject} ${campaign.body}`,
        ),
      },
      200,
    );
  }

  /* ---------------------------------------------------------------
     6. L'EXPEDITEUR — celui du programme, mot de passe en SECRET.
     Aucun repli sur un expediteur generique : mieux vaut refuser que
     d'envoyer sous une adresse que l'etudiant ne reconnait pas.
     --------------------------------------------------------------- */
  const { data: sender, error: senderError } = await adminClient
    .from("program_email_senders")
    .select("smtp_host, smtp_port, smtp_user, smtp_password_secret, from_name")
    .eq("program_id", campaign.program_id)
    .maybeSingle();

  if (senderError) return json({ error: senderError.message }, 500);
  if (!sender) {
    return json(
      { error: "Ce programme n'a pas d'expediteur SMTP dedie : envoi refuse." },
      422,
    );
  }
  const password = Deno.env.get(sender.smtp_password_secret as string);
  if (!password) {
    return json(
      {
        error:
          `Secret SMTP "${sender.smtp_password_secret}" absent —` +
          " le configurer dans Edge Functions > Secrets avant d'envoyer.",
      },
      422,
    );
  }

  const transporter = nodemailer.createTransport({
    host: sender.smtp_host,
    port: sender.smtp_port,
    secure: sender.smtp_port === 465,
    auth: { user: sender.smtp_user, pass: password },
  });

  await adminClient
    .from("communication_campaigns")
    .update({ status: "running" })
    .eq("id", campaign.id);

  /* ---------------------------------------------------------------
     7. L'ENVOI — une ligne de trace par destinataire, ecrite APRES le
     resultat SMTP. C'est pour cela que l'ecriture appartient a cette
     fonction et a personne d'autre.
     --------------------------------------------------------------- */
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const subject = render(campaign.subject as string, recipient, programName);
    const text = render(campaign.body as string, recipient, programName);

    let failure: string | null = null;
    try {
      await transporter.sendMail({
        from: `"${sender.from_name}" <${sender.smtp_user}>`,
        to: recipient.email,
        subject,
        text,
      });
    } catch (e) {
      failure = `envoi SMTP echoue : ${e instanceof Error ? e.message : String(e)}`;
    }

    if (failure) failed += 1;
    else sent += 1;

    await adminClient.from("communication_deliveries").insert({
      campaign_id: campaign.id,
      person_id: recipient.personId,
      channel: "email",
      to_email: recipient.email,
      status: failure ? "failed" : "sent",
      failure_reason: failure,
      sent_at: failure ? null : new Date().toISOString(),
    });
  }

  /* UNE CAMPAGNE DONT TOUT A ECHOUE DOIT RESTER REJOUABLE.
     Defaut constate au premier essai reel du 04/09 : l'authentification SMTP
     a echoue (535), aucun message n'est parti, et la campagne etait quand meme
     marquee `completed` — donc verrouillee par le garde-fou 409 de l'entree.
     Un envoi PARTIEL reste `completed` : les destinataires deja servis ne
     doivent jamais etre re-servis par une relance. */
  await adminClient
    .from("communication_campaigns")
    .update({ status: sent > 0 ? "completed" : "draft" })
    .eq("id", campaign.id);

  return json(
    {
      dryRun: false,
      sent,
      failed,
      excludedOptedOut: excludedOptedOut.length,
      excludedNoAddress: excludedNoAddress.length,
    },
    200,
  );
});

/* Rendu des variables. Une variable inconnue ou non resolue est laissee
   TELLE QUELLE : un `{{prenom}}` visible dans le mail recu est un defaut
   qu'on voit, la ou une chaine vide passe inapercue. */
function render(template: string, r: Recipient, programName: string): string {
  const [firstName, ...rest] = (r.fullName ?? "").split(" ");
  const values: Record<string, string> = {
    firstName: firstName ?? "",
    lastName: rest.join(" "),
    programTitle: programName,
    cohortTitle: r.cohortLabel,
  };
  return template.replace(VARIABLE_RE, (whole, name: string) => values[name] ?? whole);
}

function unresolved(text: string): string[] {
  const known = ["firstName", "lastName", "programTitle", "cohortTitle"];
  const found = new Set<string>();
  for (const m of text.matchAll(VARIABLE_RE)) {
    const name = m[1] ?? "";
    if (!known.includes(name)) found.add(name);
  }
  return [...found];
}

/* `stephane.lafitte@chu.fr` -> `s***e@chu.fr`. Assez pour reconnaitre une
   adresse, inutilisable pour en constituer une liste. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  if (local.length <= 2) return `${local[0] ?? "*"}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
