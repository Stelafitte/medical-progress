/* ==================================================================
   COMMUNICATION AVEC LES ETUDIANTS — le socle.

   Demande de Stef, 04/09 : envoyer un message a une promotion ou a une
   selection d'etudiants (chantier A), puis declencher des rappels
   automatiques sur les jalons (chantier B).

   UNE SEULE MIGRATION POUR A ET B, et c'est deliberé : c'est la contrainte
   d'idempotence de B qui decide de la forme de la trace de A. Poser la trace
   d'abord et la reprendre ensuite aurait migre des lignes deja envoyees.

   CE QUE CETTE MIGRATION NE FAIT PAS : aucune horloge. `pg_cron` et `pg_net`
   ne sont pas installes. Les regles de notification existeront sans que rien
   ne les declenche — c'est voulu, B se branche apres que A a ete verifie en
   reel.

   TROIS PRINCIPES REPRIS DU RESTE DU DEPOT :

   1. AUCUNE POLICY D'ECRITURE sur les campagnes et les envois. L'ecriture
      appartient a l'Edge Function : elle seule a vu le resultat SMTP et sait
      ce qui est reellement parti. Meme principe que `ai_messages`.
   2. L'ABSENCE VAUT REFUS. `notification_rules.enabled` est FALSE par defaut :
      pas de regle activee, pas de relance. Meme principe que
      `program_ai_settings`.
   3. LE MOT DE PASSE N'EST JAMAIS ICI. L'expediteur reste
      `program_email_senders`, qui ne porte que le NOM du secret.

   DECISION DE STEF, 04/09 — LE DESABONNEMENT : tout est desabonnable, y
   compris les rappels d'echeance. Consequence assumee : un etudiant
   desabonne n'est plus jamais relance. La contrepartie est que l'ecran doit
   montrer les exclus — le domaine porte deja `ExcludedRecipient` pour cela.
   Le domaine a par ailleurs deja tranche la PORTEE : `CommunicationPreference`
   est (personne x canal), sans programme. Le desabonnement est donc GLOBAL.
   ================================================================== */

create type public.comm_message_channel as enum ('email', 'in_app', 'sms');
create type public.comm_message_category as enum
  ('announcement', 'reminder', 'convocation', 'free');
create type public.comm_template_status as enum ('draft', 'validated', 'archived');
create type public.comm_campaign_status as enum
  ('draft', 'pending_approval', 'approved', 'scheduled', 'running', 'completed', 'cancelled');
create type public.comm_delivery_status as enum
  ('queued', 'sent', 'delivered', 'failed', 'cancelled', 'suppressed');
create type public.comm_preference_source as enum
  ('learner', 'administrator', 'import', 'bounce');

/* ------------------------------------------------------------------
   1. LES MODELES DE MESSAGE

   Batis sur `CommMessageTemplate` (domain/communication.ts), PAS sur
   l'ancien `MessageTemplate` de domain/administration.ts, que le depot
   marque deja @deprecated et pour lequel un adaptateur existe. Deux
   stockages pour la meme entite auraient viole la regle du projet.

   `program_id` NULL = modele de plateforme, reutilisable par tous les
   programmes. C'est le domaine qui le prevoit explicitement.
   ------------------------------------------------------------------ */
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs (id) on delete cascade,
  label text not null,
  category public.comm_message_category not null,
  allowed_channels public.comm_message_channel[] not null
    default array['email']::public.comm_message_channel[],
  subject text not null,
  body text not null,
  declared_variables text[] not null default '{}',
  version integer not null default 1,
  status public.comm_template_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_templates_channels_not_empty
    check (cardinality(allowed_channels) > 0),
  constraint message_templates_version_positive check (version > 0)
);

create index message_templates_program_idx
  on public.message_templates (program_id) where program_id is not null;

/* ------------------------------------------------------------------
   2. LES CAMPAGNES

   `audience` est du JSONB parce que `AudienceDefinition` est une union
   discriminee par `kind` : program_all, cohort, persons (la selection
   nominative), group, contextual_role, dynamic_filter, milestone_incomplete,
   overdue. Une table par variante aurait fige un vocabulaire qui bouge.
   La contrainte ci-dessous garde le minimum verifiable : la cle `kind`.

   `max_recipients` est un garde-fou anti-envoi massif accidentel, deja prevu
   par le domaine. Defaut 200.
   ------------------------------------------------------------------ */
create table public.communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  template_id uuid references public.message_templates (id) on delete set null,
  channel public.comm_message_channel not null default 'email',
  audience jsonb not null,
  subject text not null,
  body text not null,
  status public.comm_campaign_status not null default 'draft',
  created_by uuid not null references public.profiles (id) on delete restrict,
  approved_by uuid references public.profiles (id) on delete set null,
  max_recipients integer not null default 200,
  requires_collective_confirmation boolean not null default true,
  collective_confirmation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_campaigns_audience_kind
    check (jsonb_typeof(audience) = 'object' and audience ? 'kind'),
  constraint communication_campaigns_cap_positive check (max_recipients > 0)
);

create index communication_campaigns_program_idx
  on public.communication_campaigns (program_id, created_at desc);

/* ------------------------------------------------------------------
   3. LA TRACE — une ligne par destinataire

   UNE SEULE TABLE, pas deux. Un journal separe pour les notifications
   automatiques aurait cree deux verites sur la meme depense — exactement
   l'erreur evitee sur les credits du compagnon IA.

   `to_email` conserve l'adresse REELLEMENT utilisee : c'est le seul moyen de
   repondre a « ou est-ce parti ». Choix delibere de garder une donnee
   personnelle dans la trace.

   `dedupe_key` PORTE L'IDEMPOTENCE DE B. NULL pour un envoi manuel (aucune
   contrainte). Renseigne pour un rappel automatique, sous la forme
   `rule:<uuid>|person:<uuid>|occ:2026-09-11`. L'index unique PARTIEL ci-dessous
   fait que l'ordonnanceur peut rejouer autant qu'il veut : la ligne ne part
   qu'une fois.
   ------------------------------------------------------------------ */
create table public.communication_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.communication_campaigns (id) on delete cascade,
  person_id uuid not null references public.profiles (id) on delete restrict,
  channel public.comm_message_channel not null,
  to_email text not null,
  status public.comm_delivery_status not null default 'queued',
  attempt_number integer not null default 1,
  failure_reason text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint communication_deliveries_attempt_positive check (attempt_number > 0),
  constraint communication_deliveries_failure_iff_failed
    check ((status = 'failed') = (failure_reason is not null))
);

create unique index communication_deliveries_dedupe_uniq
  on public.communication_deliveries (dedupe_key)
  where dedupe_key is not null;

create index communication_deliveries_campaign_idx
  on public.communication_deliveries (campaign_id, created_at desc);
create index communication_deliveries_person_idx
  on public.communication_deliveries (person_id, created_at desc);

/* ------------------------------------------------------------------
   4. LES PREFERENCES — (personne x canal), globales

   Forme imposee par le domaine : `CommunicationPreference` ne porte pas de
   programme. Une personne inscrite a deux programmes qui se desabonne se
   coupe des deux. Signale a Stef le 04/09, assume.
   ------------------------------------------------------------------ */
create table public.communication_preferences (
  person_id uuid not null references public.profiles (id) on delete cascade,
  channel public.comm_message_channel not null,
  opted_out boolean not null default false,
  source public.comm_preference_source not null default 'learner',
  updated_at timestamptz not null default now(),
  primary key (person_id, channel)
);

/* ------------------------------------------------------------------
   5. LES REGLES DE NOTIFICATION — chantier B, posees mais INERTES

   `trigger` est du JSONB pour la meme raison que `audience` :
   `ScheduleTrigger` est une union discriminee (before_due, after_overdue,
   on_step_open, on_enrollment, at, recurring, immediate).

   `cohort_id` NULL = toutes les promotions du programme.
   `enabled` FALSE par defaut : l'absence vaut refus.
   ------------------------------------------------------------------ */
create table public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  cohort_id uuid references public.cohorts (id) on delete cascade,
  template_id uuid not null references public.message_templates (id) on delete restrict,
  label text not null,
  channel public.comm_message_channel not null default 'email',
  trigger jsonb not null,
  audience jsonb not null,
  enabled boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_rules_trigger_kind
    check (jsonb_typeof(trigger) = 'object' and trigger ? 'kind'),
  constraint notification_rules_audience_kind
    check (jsonb_typeof(audience) = 'object' and audience ? 'kind')
);

create index notification_rules_program_idx
  on public.notification_rules (program_id) where enabled;

/* ------------------------------------------------------------------
   6. FRAICHEUR
   ------------------------------------------------------------------ */
create trigger message_templates_touch before update on public.message_templates
  for each row execute function public.set_updated_at();
create trigger communication_campaigns_touch before update on public.communication_campaigns
  for each row execute function public.set_updated_at();
create trigger communication_preferences_touch before update on public.communication_preferences
  for each row execute function public.set_updated_at();
create trigger notification_rules_touch before update on public.notification_rules
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------
   7. RLS ET DROITS

   Lecture bornee au personnel du programme, la meme porte que le reste de
   l'administration. AUCUN grant d'ecriture : ni insert, ni update, ni delete.
   L'Edge Function ecrit en `service_role`, qui contourne la RLS.

   Exception : l'etudiant doit pouvoir se desabonner LUI-MEME. C'est l'objet
   de la fonction du chapitre 8 — pas d'une policy d'ecriture ouverte.
   ------------------------------------------------------------------ */
alter table public.message_templates enable row level security;
revoke all on public.message_templates from public, anon, authenticated;
grant select on public.message_templates to authenticated;
create policy message_templates_select on public.message_templates
  for select to authenticated
  using (program_id is null or public.is_program_staff(program_id));

alter table public.communication_campaigns enable row level security;
revoke all on public.communication_campaigns from public, anon, authenticated;
grant select on public.communication_campaigns to authenticated;
create policy communication_campaigns_select on public.communication_campaigns
  for select to authenticated
  using (public.is_program_staff(program_id));

alter table public.communication_deliveries enable row level security;
revoke all on public.communication_deliveries from public, anon, authenticated;
grant select on public.communication_deliveries to authenticated;
/* Le personnel du programme voit la trace de SES campagnes ; une personne
   voit ce qui lui a ete envoye. */
create policy communication_deliveries_select on public.communication_deliveries
  for select to authenticated
  using (
    person_id = auth.uid()
    or exists (
      select 1 from public.communication_campaigns c
      where c.id = communication_deliveries.campaign_id
        and public.is_program_staff(c.program_id)
    )
  );

alter table public.communication_preferences enable row level security;
revoke all on public.communication_preferences from public, anon, authenticated;
grant select on public.communication_preferences to authenticated;
/* Chacun voit sa preference ; le personnel voit celle des personnes inscrites
   a un programme qu'il administre — sinon il ne peut pas expliquer une
   exclusion. */
/* PIEGE TROUVE PAR LE REJEU SUR UN POSTGRESQL NEUF : une policy s'execute avec
   les DROITS DE L'APPELANT. Interroger `enrollments` directement dans le
   `using` rendait cette policy dependante d'un grant pose sur une AUTRE table.
   D'ou cette fonction `security definer`, sur le modele de `is_program_staff`. */
create function public.administers_person(p_person_id uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.enrollments e
    where e.person_id = p_person_id
      and public.is_program_staff(e.program_id)
  )
$fn$;

revoke all on function public.administers_person(uuid) from public, anon;
grant execute on function public.administers_person(uuid) to authenticated;

create policy communication_preferences_select on public.communication_preferences
  for select to authenticated
  using (person_id = auth.uid() or public.administers_person(person_id));

alter table public.notification_rules enable row level security;
revoke all on public.notification_rules from public, anon, authenticated;
grant select on public.notification_rules to authenticated;
create policy notification_rules_select on public.notification_rules
  for select to authenticated
  using (public.is_program_staff(program_id));

/* ------------------------------------------------------------------
   8. LE DESABONNEMENT PAR L'ETUDIANT LUI-MEME

   `security definer` plutot qu'une policy d'ecriture : la fonction ne peut
   agir que sur `auth.uid()`, donc personne ne peut desabonner quelqu'un
   d'autre, et la source est forcee a 'learner'.
   ------------------------------------------------------------------ */
create function public.set_communication_preference(
  p_channel public.comm_message_channel,
  p_opted_out boolean
) returns public.communication_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person uuid := auth.uid();
  v_row public.communication_preferences;
begin
  if v_person is null then
    raise exception 'Aucune session : impossible de modifier une preference.';
  end if;

  insert into public.communication_preferences (person_id, channel, opted_out, source)
  values (v_person, p_channel, p_opted_out, 'learner')
  on conflict (person_id, channel) do update
    set opted_out = excluded.opted_out,
        source = 'learner',
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_communication_preference(
  public.comm_message_channel, boolean) from public, anon;
grant execute on function public.set_communication_preference(
  public.comm_message_channel, boolean) to authenticated;
