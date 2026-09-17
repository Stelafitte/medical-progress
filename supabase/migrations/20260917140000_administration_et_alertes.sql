-- ============================================================================
-- ALERTES, PIÈCES ADMINISTRATIVES, TÂCHES — ce qui manquait vraiment.
--
-- JE CORRIGE D'ABORD UNE ERREUR QUE J'AI ÉCRITE MOI-MÊME LE 16/09.
-- La passation dit : « alertes, pièces administratives, tâches : AUCUNE TABLE
-- N'EXISTE EN BASE ». C'était vrai pour trois objets, faux pour les huit
-- autres. Onze méthodes du dépôt retombent sur les données d'exemple ; la
-- mesure du 17/09 dit ce que chacune trouve réellement en base :
--
--   listMessageTemplates    `message_templates` EXISTE (program_id, category,
--                           allowed_channels, status, version) → CÂBLAGE.
--   listSendHistory         `communication_campaigns` + `communication_deliveries`
--                           EXISTENT, avec un vrai statut d'envoi → CÂBLAGE.
--   listCaseDiscussions     `discussion_threads` + `discussion_messages`
--                           EXISTENT ; il manque trois colonnes → ci-dessous.
--   listPlacementReports    `stage_logbook_reports` + `stage_log_validations`
--                           EXISTENT ; il manque l'appréciation → ci-dessous.
--   listCompetenceConfirmations
--                           `outcome_self_reports` porte déjà declared_level,
--                           validated_by, validated_at ; il manque la DÉCISION
--                           et le niveau retenu → ci-dessous.
--   listAlerts              rien, et c'est NORMAL : une alerte est une lecture
--                           de l'état, pas un enregistrement → fonction.
--   listPlatformSupervision rien, et c'est normal aussi : ce sont des
--                           compteurs → fonction.
--   listMessages            `ProfessionalMessage` porte `delivery:
--                           "mock_no_send"`. Ce n'est pas une table qui
--                           manque : c'est une démonstration de ce que
--                           Communication interne fait déjà pour de vrai.
--                           À RETIRER de l'écran, pas à brancher. Aucune table
--                           ici.
--   listDocuments           RIEN EN BASE → ci-dessous.
--   listCertificates        RIEN EN BASE (`stage_attestations` est au niveau
--                           du stage, pas du programme) → ci-dessous.
--   listTasks               RIEN EN BASE → ci-dessous.
--
-- Ce fichier ne crée donc que ce qui manque : quatre tables, sept colonnes sur
-- trois tables existantes, deux fonctions de lecture.
--
-- LE CHOIX QUI STRUCTURE TOUT : L'ALERTE NE SE STOCKE PAS.
-- Une table d'alertes doit être remplie par quelqu'un, et personne ne la
-- remplira. Pire : elle vieillit — l'étudiant rattrape son retard, la ligne
-- reste. Les cinq natures d'alerte que l'écran connaît déjà se DÉDUISENT
-- toutes de ce que la base sait : absence de saisie, faible activité, quota
-- non atteint, compétence non exposée, validation en retard. Une fonction les
-- calcule à la lecture. Elle ne peut pas mentir, et elle s'éteint toute seule.
--
-- LES PIÈCES ADMINISTRATIVES SONT UN CATALOGUE, PAS UNE LISTE.
-- Si chaque inscrit porte ses propres libellés en texte libre, rien ne se
-- compte : on ne peut pas dire « il manque la convention à onze étudiants ».
-- D'où deux tables : ce que le programme EXIGE
-- (`admin_document_requirements`), et où en est chaque inscrit
-- (`admin_documents`). Le libellé vit dans l'exigence, une seule fois.
--
-- LA GARDE EST DANS LA FONCTION, comme pour l'interruption : les écritures
-- passent par des fonctions `security definer`, la RLS ne les voit pas. Les
-- tables n'accordent donc que le SELECT ; insert, update et delete sont
-- révoqués, et chaque écriture vérifie elle-même le périmètre.
-- ============================================================================

/* ------------------------------------------------------------------ */
/* 1. LES PIÈCES ADMINISTRATIVES                                       */
/* ------------------------------------------------------------------ */

do $$ begin
  create type public.admin_document_status as enum (
    'missing',    -- attendue, rien n'est arrivé
    'requested',  -- demandée à l'inscrit
    'received',   -- reçue, pas encore examinée
    'validated',  -- reçue et acceptée
    'refused'     -- reçue et refusée (motif obligatoire)
  );
exception when duplicate_object then null;
end $$;

/* Ce que le PROGRAMME exige. Le libellé ne vit qu'ici. */
create table if not exists public.admin_document_requirements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  /* Clé stable et lisible : 'convention_de_stage', 'attestation_assurance'. */
  document_key text not null,
  label text not null,
  mandatory boolean not null default true,
  /* Échéance relative au début de promotion, en SEMAINES — même unité que
     `plan_milestones.week_offset`, pour que le décalage de calendrier du
     Pilotage s'applique aussi aux pièces. Nulle = pas d'échéance. */
  due_week_offset integer,
  position integer not null default 0,
  archived_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, document_key)
);

/* Où en est CHAQUE inscrit, pour chaque exigence. */
create table if not exists public.admin_documents (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null
    references public.admin_document_requirements (id) on delete cascade,
  enrollment_id uuid not null,
  program_id uuid not null,
  status public.admin_document_status not null default 'missing',
  requested_on timestamptz,
  received_on timestamptz,
  note text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  /* L'inscription et le programme ne peuvent pas diverger : c'est la base qui
     le tient, pas le code appelant. */
  foreign key (enrollment_id, program_id)
    references public.enrollments (id, program_id) on delete cascade,
  unique (requirement_id, enrollment_id),
  /* Un refus sans motif n'apprend rien à personne. */
  constraint admin_documents_refus_motive
    check (status <> 'refused' or coalesce(note, '') <> '')
);

create index if not exists admin_documents_enrollment_idx
  on public.admin_documents (enrollment_id);
create index if not exists admin_documents_program_status_idx
  on public.admin_documents (program_id, status);

/* ------------------------------------------------------------------ */
/* 2. LES ATTESTATIONS DE FIN DE PARCOURS                              */
/* ------------------------------------------------------------------ */

do $$ begin
  create type public.completion_certificate_status as enum (
    'not_requested',
    'requested',
    'reminded',
    'signed',
    'validated',
    'revoked'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.completion_certificates (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  program_id uuid not null,
  status public.completion_certificate_status not null default 'not_requested',
  /* Référence portée sur le document remis. Jamais générée ici : saisie ou
     produite par l'outil qui fabrique le PDF. */
  reference text,
  issued_at timestamptz,
  issued_by uuid references public.profiles (id),
  revoked_at timestamptz,
  revoked_reason text,
  updated_at timestamptz not null default now(),
  foreign key (enrollment_id, program_id)
    references public.enrollments (id, program_id) on delete cascade,
  unique (enrollment_id),
  constraint completion_certificates_revocation_coherente
    check (
      (status = 'revoked' and revoked_at is not null
                          and coalesce(revoked_reason, '') <> '')
      or (status <> 'revoked' and revoked_at is null and revoked_reason is null)
    )
);

/* ------------------------------------------------------------------ */
/* 3. LES TÂCHES                                                       */
/* ------------------------------------------------------------------ */

do $$ begin
  create type public.admin_task_priority as enum ('high', 'medium', 'low');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public.admin_task_status as enum ('open', 'done', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.admin_tasks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  /* Nulle = la tâche vaut pour tout le programme. */
  cohort_id uuid,
  label text not null,
  detail text,
  due_on date not null,
  priority public.admin_task_priority not null default 'medium',
  status public.admin_task_status not null default 'open',
  assigned_to uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  foreign key (cohort_id, program_id)
    references public.cohorts (id, program_id) on delete cascade,
  constraint admin_tasks_cloture_coherente
    check ((status = 'open') = (closed_at is null))
);

create index if not exists admin_tasks_ouvertes_idx
  on public.admin_tasks (program_id, due_on)
  where status = 'open';

/* ------------------------------------------------------------------ */
/* 4. LES TROIS TABLES EXISTANTES QU'IL FAUT COMPLÉTER                 */
/* ------------------------------------------------------------------ */

/* 4a. Les fils de discussion ne disent pas encore de quoi ils parlent ni
       s'ils ont été traités. */
do $$ begin
  create type public.discussion_thread_kind as enum (
    'case_to_discuss',
    'learner_question'
  );
exception when duplicate_object then null;
end $$;

alter table public.discussion_threads
  add column if not exists kind public.discussion_thread_kind not null default 'learner_question',
  add column if not exists title text not null default '',
  add column if not exists handled_at timestamptz,
  add column if not exists handled_by uuid references public.profiles (id);

/* 4b. La confirmation de compétence : la base sait qui a validé et quand,
       pas CE QUI a été décidé ni à quel niveau. Sans cela, « proposé
       autonome, retenu intermédiaire » ne peut pas s'écrire. */
do $$ begin
  create type public.competence_confirmation_decision as enum (
    'pending',
    'confirmed',
    'refused',
    'needs_more'
  );
exception when duplicate_object then null;
end $$;

alter table public.outcome_self_reports
  add column if not exists confirmation_decision public.competence_confirmation_decision
    not null default 'pending',
  add column if not exists confirmed_level public.mastery_level,
  add column if not exists confirmation_comment text;

/* Une décision prise est une décision datée et signée. */
alter table public.outcome_self_reports
  drop constraint if exists outcome_self_reports_decision_coherente;
alter table public.outcome_self_reports
  add constraint outcome_self_reports_decision_coherente
    check (
      confirmation_decision = 'pending'
      or (validated_by is not null and validated_at is not null)
    );

/* 4c. Le bilan de fin de stage : `stage_log_validations` porte déjà la
       décision et le commentaire du validateur ; il lui manque
       l'appréciation d'ensemble et les réserves. */
alter table public.stage_log_validations
  add column if not exists appraisal text,
  add column if not exists reservations text,
  add constraint stage_log_validations_appreciation_connue
    check (appraisal is null
           or appraisal in ('insuffisant', 'satisfaisant', 'très satisfaisant'));

/* ------------------------------------------------------------------ */
/* 5. LES ALERTES : UNE LECTURE, PAS UNE TABLE                         */
/* ------------------------------------------------------------------ */

create or replace function public.supervision_alerts(
  p_program_id uuid,
  p_jours_sans_saisie integer default 14,
  p_jours_faible_activite integer default 21,
  p_jours_validation integer default 10
)
returns table (
  alert_id text,
  kind text,
  severity text,
  program_id uuid,
  enrollment_id uuid,
  message text,
  due_on timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_program_staff(p_program_id) then
    raise exception 'Alertes réservées à l''équipe du programme.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  /* Les inscriptions à surveiller : actives, et dont le parcours n'est pas
     suspendu ou gelé. Alerter sur une promotion qu'on a soi-même mise en
     pause n'a aucun sens — c'est exactement le bruit qui fait cesser de lire
     les alertes. */
  with inscrits as (
    select e.id, e.program_id, e.cohort_id, c.starts_on
    from public.enrollments e
    join public.cohorts c on c.id = e.cohort_id
    where e.program_id = p_program_id
      and e.status = 'active'
      and not exists (
        select 1 from public.cohort_interruptions ci
        where ci.cohort_id = e.cohort_id
          and ci.ended_on is null
          and ci.mode in ('suspended', 'frozen')
      )
  ),

  /* 1. ABSENCE DE SAISIE : un carnet ouvert, une période en cours, et rien
        d'écrit depuis p_jours_sans_saisie jours. */
  sans_saisie as (
    select i.id as enrollment_id,
           max(le.occurred_on) as derniere
    from inscrits i
    join public.stage_logs sl
      on sl.enrollment_id = i.id
     and sl.status in ('draft', 'needs_revision')
     and current_date between sl.period_starts_on and sl.period_ends_on
    left join public.stage_log_entries le on le.stage_log_id = sl.id
    group by i.id
    having coalesce(max(le.occurred_on), current_date - 3650)
             < current_date - p_jours_sans_saisie
  ),

  /* 2. FAIBLE ACTIVITÉ : aucun geste d'aucune nature. Volontairement plus
        large et plus lente que l'absence de saisie. */
  derniers_gestes as (
    select i.id as enrollment_id,
           /* Aucun `epoch` ici : un parcours sans geste n'a pas « 20 000 jours
              d'inactivité », il n'a rien commencé. Le repère est alors le début
              de promotion, et le message le dit autrement. */
           greatest(
             (select max(qa.answered_at) from public.question_attempts qa
              where qa.enrollment_id = i.id),
             (select max(osr.declared_at) from public.outcome_self_reports osr
              where osr.enrollment_id = i.id),
             (select max(le.created_at)
              from public.stage_log_entries le
              join public.stage_logs sl on sl.id = le.stage_log_id
              where sl.enrollment_id = i.id)
           ) as dernier,
           i.starts_on
    from inscrits i
  ),
  faible_activite as (
    select d.enrollment_id, d.dernier
    from derniers_gestes d
    where coalesce(d.dernier, d.starts_on::timestamptz)
            < now() - make_interval(days => p_jours_faible_activite)
      /* Une promotion qui n'a pas encore commencé n'est pas inactive. */
      and d.starts_on is not null
      and d.starts_on <= current_date
  ),

  /* 3. QUOTA NON ATTEINT : le modèle de carnet porte {key, label, quota} ;
        on compare au compte déclaré. On n'alerte qu'après la fin de la
        période : avant, un quota non atteint est simplement un stage en
        cours. */
  quotas as (
    select i.id as enrollment_id,
           o.value ->> 'label' as objectif,
           (o.value ->> 'quota')::integer as attendu,
           coalesce(r.declared_count, 0) as declare,
           sl.period_ends_on
    from inscrits i
    join public.stage_logs sl on sl.enrollment_id = i.id
    join public.stage_log_templates t on t.id = sl.template_id
    cross join lateral jsonb_array_elements(coalesce(t.objectives, '[]'::jsonb)) as o(value)
    left join public.stage_logbook_reports r
      on r.enrollment_id = i.id
     and r.template_id = t.id
     and r.objective_key = (o.value ->> 'key')
    where sl.period_ends_on < current_date
      and (o.value ->> 'quota') ~ '^[0-9]+$'
      and (o.value ->> 'quota')::integer > 0
      and coalesce(r.declared_count, 0) < (o.value ->> 'quota')::integer
  ),

  /* 4. COMPÉTENCE INSUFFISAMMENT EXPOSÉE : une compétence rattachée à un
        jalon dont la semaine est passée, sans aucune auto-déclaration. */
  non_exposees as (
    select i.id as enrollment_id,
           o.label as competence,
           i.starts_on + (m.week_offset * 7) as echeance
    from inscrits i
    join public.plan_milestones m on m.cohort_id = i.cohort_id
    join public.plan_milestone_outcomes mo on mo.milestone_id = m.id
    join public.outcomes o on o.id = mo.outcome_id
    where i.starts_on is not null
      and i.starts_on + (m.week_offset * 7) < current_date
      and not exists (
        select 1 from public.outcome_self_reports osr
        where osr.enrollment_id = i.id
          and osr.outcome_id = mo.outcome_id
      )
  ),

  /* 5. VALIDATION EN RETARD : ce qui attend l'ÉQUIPE, pas l'étudiant. Deux
        sources : un carnet transmis qui n'a pas été repris, et une
        auto-déclaration jamais confirmée. */
  validations_carnet as (
    select i.id as enrollment_id, sl.updated_at as depuis
    from inscrits i
    join public.stage_logs sl on sl.enrollment_id = i.id
    where sl.status = 'submitted'
      and sl.updated_at < now() - make_interval(days => p_jours_validation)
  ),
  validations_competence as (
    select i.id as enrollment_id, min(osr.declared_at) as depuis
    from inscrits i
    join public.outcome_self_reports osr on osr.enrollment_id = i.id
    where osr.validated_at is null
      and osr.declared_at < now() - make_interval(days => p_jours_validation)
    group by i.id
  )

  select 'no_entry:' || s.enrollment_id::text,
         'no_entry', 'warning', p_program_id, s.enrollment_id,
         case when s.derniere is null
              then 'Carnet ouvert, aucune saisie depuis l''ouverture.'
              else 'Aucune saisie depuis le ' || to_char(s.derniere, 'DD/MM/YYYY') || '.'
         end,
         null::timestamptz
  from sans_saisie s

  union all
  select 'low_activity:' || f.enrollment_id::text,
         'low_activity', 'warning', p_program_id, f.enrollment_id,
         case when f.dernier is null
              then 'Aucune activité depuis le début de la promotion.'
              else 'Aucune activité depuis le ' || to_char(f.dernier, 'DD/MM/YYYY') || '.'
         end,
         null::timestamptz
  from faible_activite f

  union all
  select 'missing_quota:' || q.enrollment_id::text || ':' || q.objectif,
         'missing_quota', 'warning', p_program_id, q.enrollment_id,
         q.objectif || ' : ' || q.declare::text || ' sur ' || q.attendu::text || ' attendus.',
         q.period_ends_on::timestamptz
  from quotas q

  union all
  select 'underexposed_competence:' || n.enrollment_id::text || ':' || n.competence,
         'underexposed_competence', 'info', p_program_id, n.enrollment_id,
         n.competence || ' : aucune trace, jalon dépassé.',
         n.echeance::timestamptz
  from non_exposees n

  union all
  select 'late_validation:carnet:' || v.enrollment_id::text,
         'late_validation', 'critical', p_program_id, v.enrollment_id,
         'Carnet transmis le ' || to_char(v.depuis, 'DD/MM/YYYY') || ', toujours pas repris.',
         v.depuis
  from validations_carnet v

  union all
  select 'late_validation:competence:' || w.enrollment_id::text,
         'late_validation', 'critical', p_program_id, w.enrollment_id,
         'Auto-déclaration en attente depuis le ' || to_char(w.depuis, 'DD/MM/YYYY') || '.',
         w.depuis
  from validations_competence w;
end;
$$;

comment on function public.supervision_alerts(uuid, integer, integer, integer) is
  'Alertes d''encadrement CALCULÉES à la lecture. Aucune table : une alerte qui se stocke vieillit et ment. Une promotion suspendue ou gelée n''alerte pas.';

/* ------------------------------------------------------------------ */
/* 6. LA SUPERVISION DE PLATEFORME : des compteurs, rien de pédagogique */
/* ------------------------------------------------------------------ */

create or replace function public.platform_supervision()
returns table (
  program_id uuid,
  program_label text,
  authorized_administrators uuid[],
  learners bigint,
  ai_enabled boolean,
  storage_bytes bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Supervision de plateforme réservée aux administrateurs de plateforme.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select pr.id,
         pr.name,
         coalesce(a.admins, array[]::uuid[]),
         coalesce(i.n, 0),
         coalesce(s.enabled, false),
         coalesce(st.octets, 0)
  from public.programs pr
  left join lateral (
    select array_agg(distinct ra.person_id) as admins
    from public.role_assignments ra
    where ra.program_id = pr.id
      and ra.role = 'administrator'
      and ra.revoked_at is null
  ) a on true
  left join lateral (
    select count(*)::bigint as n
    from public.enrollments e
    where e.program_id = pr.id and e.status = 'active'
  ) i on true
  left join lateral (
    select bool_or(ps.enabled) as enabled
    from public.program_ai_settings ps
    where ps.program_id = pr.id
  ) s on true
  left join lateral (
    select coalesce(sum(la.byte_size), 0)::bigint as octets
    from public.learning_resource_assets la
    where la.program_id = pr.id and la.deleted_at is null
  ) st on true
  order by pr.name;
end;
$$;

comment on function public.platform_supervision() is
  'Compteurs par programme pour la supervision de plateforme. Jamais de dossier pédagogique : des effectifs, du stockage, un interrupteur IA.';

/* ------------------------------------------------------------------ */
/* 7. LES ÉCRITURES                                                    */
/* ------------------------------------------------------------------ */

create or replace function public.declare_document_requirement(
  p_program_id uuid,
  p_document_key text,
  p_label text,
  p_mandatory boolean default true,
  p_due_week_offset integer default null,
  p_position integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Seule l''administration du programme définit les pièces exigées.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_label), '') = '' or coalesce(trim(p_document_key), '') = '' then
    raise exception 'Une pièce exigée a une clé et un libellé.'
      using errcode = 'check_violation';
  end if;

  insert into public.admin_document_requirements
    (program_id, document_key, label, mandatory, due_week_offset, position, created_by)
  values
    (p_program_id, trim(p_document_key), trim(p_label), p_mandatory,
     p_due_week_offset, p_position, auth.uid())
  on conflict (program_id, document_key) do update
    set label = excluded.label,
        mandatory = excluded.mandatory,
        due_week_offset = excluded.due_week_offset,
        position = excluded.position,
        archived_at = null,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.set_document_status(
  p_requirement_id uuid,
  p_enrollment_id uuid,
  p_status public.admin_document_status,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program uuid;
  v_id uuid;
begin
  select e.program_id into v_program
  from public.enrollments e where e.id = p_enrollment_id;
  if v_program is null then
    raise exception 'Inscription inconnue.' using errcode = 'no_data_found';
  end if;
  if not public.is_program_staff(v_program) then
    raise exception 'Suivi administratif réservé à l''équipe du programme.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.admin_document_requirements r
    where r.id = p_requirement_id and r.program_id = v_program
  ) then
    raise exception 'Cette pièce n''est pas exigée par ce programme.'
      using errcode = 'check_violation';
  end if;

  insert into public.admin_documents
    (requirement_id, enrollment_id, program_id, status, note,
     requested_on, received_on, decided_by, decided_at)
  values
    (p_requirement_id, p_enrollment_id, v_program, p_status, nullif(trim(coalesce(p_note, '')), ''),
     case when p_status = 'requested' then now() end,
     case when p_status in ('received', 'validated') then now() end,
     auth.uid(), now())
  on conflict (requirement_id, enrollment_id) do update
    set status = excluded.status,
        note = coalesce(excluded.note, public.admin_documents.note),
        /* On garde la première demande et la première réception : ce sont des
           faits datés, pas un état courant. */
        requested_on = coalesce(public.admin_documents.requested_on, excluded.requested_on),
        received_on = coalesce(public.admin_documents.received_on, excluded.received_on),
        decided_by = auth.uid(),
        decided_at = now(),
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.set_completion_certificate(
  p_enrollment_id uuid,
  p_status public.completion_certificate_status,
  p_reference text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program uuid;
  v_id uuid;
begin
  select e.program_id into v_program
  from public.enrollments e where e.id = p_enrollment_id;
  if v_program is null then
    raise exception 'Inscription inconnue.' using errcode = 'no_data_found';
  end if;
  if not public.can_administer_program(v_program) then
    raise exception 'Seule l''administration du programme délivre une attestation.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status = 'revoked' and coalesce(trim(coalesce(p_reason, '')), '') = '' then
    raise exception 'Une révocation se motive.' using errcode = 'check_violation';
  end if;

  insert into public.completion_certificates
    (enrollment_id, program_id, status, reference, issued_at, issued_by,
     revoked_at, revoked_reason)
  values
    (p_enrollment_id, v_program, p_status, nullif(trim(coalesce(p_reference, '')), ''),
     case when p_status in ('signed', 'validated') then now() end,
     case when p_status in ('signed', 'validated') then auth.uid() end,
     case when p_status = 'revoked' then now() end,
     case when p_status = 'revoked' then trim(p_reason) end)
  on conflict (enrollment_id) do update
    set status = excluded.status,
        reference = coalesce(excluded.reference, public.completion_certificates.reference),
        /* Une attestation révoquée GARDE sa date de délivrance : c'est
           précisément ce qu'on révoque. L'effacer rendrait la révocation
           incompréhensible six mois plus tard. */
        issued_at = coalesce(
          public.completion_certificates.issued_at,
          case when excluded.status in ('signed', 'validated') then now() end),
        issued_by = coalesce(
          public.completion_certificates.issued_by,
          case when excluded.status in ('signed', 'validated') then auth.uid() end),
        revoked_at = excluded.revoked_at,
        revoked_reason = excluded.revoked_reason,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.create_admin_task(
  p_program_id uuid,
  p_label text,
  p_due_on date,
  p_priority public.admin_task_priority default 'medium',
  p_cohort_id uuid default null,
  p_detail text default null,
  p_assigned_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.is_program_staff(p_program_id) then
    raise exception 'Tâches réservées à l''équipe du programme.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_label), '') = '' then
    raise exception 'Une tâche a un intitulé.' using errcode = 'check_violation';
  end if;

  insert into public.admin_tasks
    (program_id, cohort_id, label, detail, due_on, priority, assigned_to, created_by)
  values
    (p_program_id, p_cohort_id, trim(p_label),
     nullif(trim(coalesce(p_detail, '')), ''), p_due_on, p_priority,
     p_assigned_to, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.close_admin_task(
  p_task_id uuid,
  p_status public.admin_task_status default 'done'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program uuid;
begin
  select t.program_id into v_program from public.admin_tasks t where t.id = p_task_id;
  if v_program is null then
    raise exception 'Tâche inconnue.' using errcode = 'no_data_found';
  end if;
  if not public.is_program_staff(v_program) then
    raise exception 'Tâches réservées à l''équipe du programme.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status = 'open' then
    raise exception 'Cette fonction clôt une tâche ; elle ne la rouvre pas.'
      using errcode = 'check_violation';
  end if;

  update public.admin_tasks
     set status = p_status,
         closed_at = now(),
         closed_by = auth.uid(),
         updated_at = now()
   where id = p_task_id;
end;
$$;

/* La confirmation de compétence : l'encadrant tranche, et son niveau retenu
   peut différer du niveau proposé. C'est tout l'intérêt du geste. */
create or replace function public.confirm_competence(
  p_self_report_id uuid,
  p_decision public.competence_confirmation_decision,
  p_level public.mastery_level default null,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program uuid;
begin
  select e.program_id into v_program
  from public.outcome_self_reports osr
  join public.enrollments e on e.id = osr.enrollment_id
  where osr.id = p_self_report_id;

  if v_program is null then
    raise exception 'Auto-déclaration inconnue.' using errcode = 'no_data_found';
  end if;
  if not public.is_program_staff(v_program) then
    raise exception 'Confirmation réservée à l''équipe du programme.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_decision = 'confirmed' and p_level is null then
    raise exception 'Une confirmation retient un niveau.' using errcode = 'check_violation';
  end if;
  if p_decision in ('refused', 'needs_more')
     and coalesce(trim(coalesce(p_comment, '')), '') = '' then
    raise exception 'Un refus ou une demande de complément se motive.'
      using errcode = 'check_violation';
  end if;

  update public.outcome_self_reports
     set confirmation_decision = p_decision,
         confirmed_level = p_level,
         confirmation_comment = nullif(trim(coalesce(p_comment, '')), ''),
         validated_by = auth.uid(),
         validated_at = now()
   where id = p_self_report_id;
end;
$$;

/* ------------------------------------------------------------------ */
/* 8. LECTURE : RLS, ET RIEN D'AUTRE QUE LE SELECT                     */
/* ------------------------------------------------------------------ */

alter table public.admin_document_requirements enable row level security;
alter table public.admin_documents enable row level security;
alter table public.completion_certificates enable row level security;
alter table public.admin_tasks enable row level security;

/* Les exigences sont publiques dans le programme : l'inscrit doit savoir ce
   qu'on attend de lui. */
drop policy if exists admin_document_requirements_lecture on public.admin_document_requirements;
create policy admin_document_requirements_lecture
  on public.admin_document_requirements for select to authenticated
  using (
    public.is_program_staff(program_id)
    or exists (
      select 1 from public.enrollments e
      where e.program_id = admin_document_requirements.program_id
        and e.person_id = auth.uid()
    )
  );

/* L'état d'une pièce : l'équipe, et l'inscrit concerné pour la sienne. */
drop policy if exists admin_documents_lecture on public.admin_documents;
create policy admin_documents_lecture
  on public.admin_documents for select to authenticated
  using (
    public.is_program_staff(program_id)
    or exists (
      select 1 from public.enrollments e
      where e.id = admin_documents.enrollment_id and e.person_id = auth.uid()
    )
  );

drop policy if exists completion_certificates_lecture on public.completion_certificates;
create policy completion_certificates_lecture
  on public.completion_certificates for select to authenticated
  using (
    public.is_program_staff(program_id)
    or exists (
      select 1 from public.enrollments e
      where e.id = completion_certificates.enrollment_id and e.person_id = auth.uid()
    )
  );

/* Les tâches sont un outil d'équipe : l'inscrit n'a rien à y voir. */
drop policy if exists admin_tasks_lecture on public.admin_tasks;
create policy admin_tasks_lecture
  on public.admin_tasks for select to authenticated
  using (public.is_program_staff(program_id));

grant select on public.admin_document_requirements to authenticated;
grant select on public.admin_documents to authenticated;
grant select on public.completion_certificates to authenticated;
grant select on public.admin_tasks to authenticated;

revoke insert, update, delete on public.admin_document_requirements from authenticated;
revoke insert, update, delete on public.admin_documents from authenticated;
revoke insert, update, delete on public.completion_certificates from authenticated;
revoke insert, update, delete on public.admin_tasks from authenticated;

grant execute on function public.supervision_alerts(uuid, integer, integer, integer) to authenticated;
grant execute on function public.platform_supervision() to authenticated;
grant execute on function public.declare_document_requirement(uuid, text, text, boolean, integer, integer) to authenticated;
grant execute on function public.set_document_status(uuid, uuid, public.admin_document_status, text) to authenticated;
grant execute on function public.set_completion_certificate(uuid, public.completion_certificate_status, text, text) to authenticated;
grant execute on function public.create_admin_task(uuid, text, date, public.admin_task_priority, uuid, text, uuid) to authenticated;
grant execute on function public.close_admin_task(uuid, public.admin_task_status) to authenticated;
grant execute on function public.confirm_competence(uuid, public.competence_confirmation_decision, public.mastery_level, text) to authenticated;
