-- ============================================================================
-- PILOTER, C'EST DÉCIDER — le journal, l'incident, et le décalage de calendrier.
--
-- Stef, 16/09 : « il faut imaginer ce qui se passe en cas de problème… enlever
-- ou rajouter des modules… donc proche de la Conception mais en simplifié.
-- Sois force de proposition. À tous les niveaux en croisant les interactions
-- avec les autres onglets. » Puis : « Fais tout ».
--
-- CE QUE CETTE MIGRATION POSE, ET POURQUOI DANS CET ORDRE.
--
-- 1. LE JOURNAL (`pilot_decisions`). Une action de pilotage sans motif ni trace
--    n'est pas du pilotage, c'est du bricolage : six semaines plus tard,
--    personne ne sait qui a décalé le calendrier de trois semaines, ni
--    pourquoi. Toutes les fonctions de pilotage y écrivent — y compris
--    `pause_cohort` et `resume_cohort`, reprises ici pour cela.
--
-- 2. L'INCIDENT (`program_incidents`). C'est la pièce qui manquait. Sans elle,
--    l'écran n'offre que des commandes, et il faut savoir LAQUELLE choisir face
--    à un terrain fermé. Avec elle, on part du PROBLÈME — sa nature, sa portée,
--    depuis quand — et les actions correctrices se proposent d'elles-mêmes.
--    Un incident ne bloque rien par lui-même : il constate. Ce sont les gestes
--    qu'on prend ensuite (interrompre, décaler, retirer une épreuve) qui
--    agissent, et le journal les relie au même incident.
--
-- 3. LE DÉCALAGE HORS PAUSE (`shift_cohort_calendar`). Le geste le plus demandé
--    quand il y a un pépin, et le seul jusqu'ici impossible sans passer par une
--    interruption. Il déplace la fin de la promotion et les jalons à partir
--    d'une semaine donnée — en avant comme en arrière.
--
-- CE QU'ELLE NE POSE PAS, ET C'EST VOLONTAIRE. Aucune table d'alertes, de
-- pièces administratives ni de tâches : mesuré le 16/09, elles n'existent pas
-- en base, les écrans qui les affichent lisent des données d'exemple. Les
-- inventer ici, à la va-vite, en ferait trois de plus à défaire.
-- ============================================================================

/* ------------------------------------------------------------------ */
/* 1. LE JOURNAL DES DÉCISIONS                                         */
/* ------------------------------------------------------------------ */

create type public.pilot_decision_kind as enum (
  'interruption',
  'reprise',
  'decalage',
  'incident',
  'incident_resolu',
  'parcours'
);

create table public.pilot_decisions (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  kind public.pilot_decision_kind not null,
  -- Ce qui a été fait, en une phrase lisible sans ouvrir le détail.
  summary text not null check (length(btrim(summary)) between 3 and 400),
  -- POURQUOI. Jamais vide : c'est la seule chose qu'on regrette de ne pas avoir
  -- écrite quand on relit six semaines plus tard.
  reason text not null check (length(btrim(reason)) between 3 and 2000),
  -- De quoi refaire le calcul : semaines décalées, jalons touchés, portée.
  details jsonb not null default '{}'::jsonb,
  incident_id uuid,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz not null default now()
);

comment on table public.pilot_decisions is
  'Journal du pilotage : chaque décision, son motif, son auteur. Jamais modifié, jamais supprimé.';

create index pilot_decisions_cohort_idx
  on public.pilot_decisions (cohort_id, decided_at desc);

alter table public.pilot_decisions enable row level security;

/* Le journal est une affaire d'équipe : l'apprenant voit les EFFETS (son
   parcours suspendu, son calendrier décalé), pas les délibérations. */
create policy pilot_decisions_select_staff
  on public.pilot_decisions for select
  to authenticated
  using (
    exists (
      select 1 from public.cohorts c
      where c.id = pilot_decisions.cohort_id and public.is_program_staff(c.program_id)
    )
  );

revoke insert, update, delete on public.pilot_decisions from authenticated, anon;

create or replace function public.journal_pilotage(
  p_cohort_id uuid,
  p_kind public.pilot_decision_kind,
  p_summary text,
  p_reason text,
  p_details jsonb default '{}'::jsonb,
  p_incident_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.pilot_decisions
    (cohort_id, kind, summary, reason, details, incident_id, decided_by)
  values
    (p_cohort_id, p_kind, left(btrim(p_summary), 400), btrim(p_reason), coalesce(p_details, '{}'::jsonb),
     p_incident_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.journal_pilotage(uuid, public.pilot_decision_kind, text, text, jsonb, uuid) is
  'Écrit une ligne du journal de pilotage. Appelée par les fonctions de pilotage, jamais par le client.';

revoke execute on function
  public.journal_pilotage(uuid, public.pilot_decision_kind, text, text, jsonb, uuid)
  from authenticated, anon;

/* ------------------------------------------------------------------ */
/* 2. L'INCIDENT                                                       */
/* ------------------------------------------------------------------ */

create type public.incident_scope as enum ('cohort', 'placement', 'milestone', 'learner');

comment on type public.incident_scope is
  'Ce que l''incident touche : toute la promotion, un terrain, un jalon, ou un apprenant.';

create table public.program_incidents (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  scope public.incident_scope not null,
  /* L'objet visé quand la portée n'est pas la promotion entière : terrain,
     jalon ou inscription. Sans contrainte de clé étrangère, parce qu'il pointe
     trois tables différentes — l'écran ne propose que des objets existants, et
     un incident qui survivrait à la suppression de son objet vaut mieux qu'un
     incident qu'on ne peut pas déclarer. */
  scope_id uuid,
  title text not null check (length(btrim(title)) between 3 and 200),
  reason text not null check (length(btrim(reason)) between 3 and 2000),
  occurred_on date not null default current_date,
  resolved_on date,
  resolution text check (resolution is null or length(btrim(resolution)) <= 2000),
  declared_by uuid references public.profiles (id),
  resolved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_incidents_dates_ordered
    check (resolved_on is null or resolved_on >= occurred_on),
  constraint program_incidents_scope_id_present
    check ((scope = 'cohort') = (scope_id is null))
);

comment on table public.program_incidents is
  'Ce qui s''est passé et qui explique les décisions de pilotage. Constate, ne bloque pas.';

create index program_incidents_ouverts_idx
  on public.program_incidents (cohort_id, occurred_on desc)
  where resolved_on is null;

alter table public.program_incidents enable row level security;

create policy program_incidents_select_staff
  on public.program_incidents for select
  to authenticated
  using (
    exists (
      select 1 from public.cohorts c
      where c.id = program_incidents.cohort_id and public.is_program_staff(c.program_id)
    )
  );

revoke insert, update, delete on public.program_incidents from authenticated, anon;

create or replace function public.declare_incident(
  p_cohort_id uuid,
  p_scope public.incident_scope,
  p_title text,
  p_reason text,
  p_scope_id uuid default null,
  p_occurred_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_id uuid;
begin
  select c.program_id into v_program_id from public.cohorts c where c.id = p_cohort_id;
  if v_program_id is null then
    raise exception 'Promotion introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  if length(btrim(coalesce(p_title, ''))) < 3 then
    raise exception 'Un incident doit être nommé.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif de l''incident est obligatoire.';
  end if;
  if (p_scope = 'cohort') <> (p_scope_id is null) then
    raise exception
      'Un incident sur un terrain, un jalon ou un apprenant doit désigner lequel ; un incident de promotion n''en désigne aucun.';
  end if;

  insert into public.program_incidents
    (cohort_id, scope, scope_id, title, reason, occurred_on, declared_by)
  values
    (p_cohort_id, p_scope, p_scope_id, btrim(p_title), btrim(p_reason),
     coalesce(p_occurred_on, current_date), auth.uid())
  returning id into v_id;

  perform public.journal_pilotage(
    p_cohort_id, 'incident', 'Incident déclaré : ' || btrim(p_title), btrim(p_reason),
    jsonb_build_object('scope', p_scope, 'scope_id', p_scope_id), v_id);

  return v_id;
end;
$$;

comment on function public.declare_incident(uuid, public.incident_scope, text, text, uuid, date) is
  'Déclare un incident. Ne bloque rien : ce sont les gestes pris ensuite qui agissent.';

create or replace function public.resolve_incident(
  p_incident_id uuid,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cohort_id uuid;
  v_program_id uuid;
  v_title text;
  v_resolu date;
begin
  select i.cohort_id, c.program_id, i.title, i.resolved_on
    into v_cohort_id, v_program_id, v_title, v_resolu
  from public.program_incidents i
  join public.cohorts c on c.id = i.cohort_id
  where i.id = p_incident_id;

  if v_cohort_id is null then
    raise exception 'Incident introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  if v_resolu is not null then
    raise exception 'Cet incident est déjà clos.';
  end if;
  if length(btrim(coalesce(p_resolution, ''))) < 3 then
    raise exception 'Dites comment l''incident a été réglé.';
  end if;

  update public.program_incidents
     set resolved_on = current_date,
         resolved_by = auth.uid(),
         resolution = btrim(p_resolution),
         updated_at = now()
   where id = p_incident_id;

  perform public.journal_pilotage(
    v_cohort_id, 'incident_resolu', 'Incident clos : ' || v_title, btrim(p_resolution),
    '{}'::jsonb, p_incident_id);
end;
$$;

comment on function public.resolve_incident(uuid, text) is
  'Clôt un incident en disant comment il a été réglé.';

/* ------------------------------------------------------------------ */
/* 3. LE DÉCALAGE DE CALENDRIER, HORS PAUSE                            */
/* ------------------------------------------------------------------ */

create or replace function public.shift_cohort_calendar(
  p_cohort_id uuid,
  p_weeks integer,
  p_reason text,
  p_from_week integer default 0,
  p_incident_id uuid default null
)
returns table (semaines integer, jalons_decales integer, nouvelle_fin date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_starts date;
  v_ends date;
  v_depuis integer := greatest(0, coalesce(p_from_week, 0));
  v_min integer;
  v_jalons integer := 0;
  v_fin date;
begin
  select c.program_id, c.starts_on, c.ends_on into v_program_id, v_starts, v_ends
  from public.cohorts c where c.id = p_cohort_id;

  if v_program_id is null then
    raise exception 'Promotion introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  if p_weeks is null or p_weeks = 0 then
    raise exception 'Un décalage de zéro semaine ne décale rien.';
  end if;
  if p_weeks not between -104 and 104 then
    raise exception 'Un décalage se compte entre -104 et 104 semaines.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif du décalage est obligatoire.';
  end if;

  /* AVANCER LE CALENDRIER NE DOIT PAS POUSSER UN JALON AVANT LE DÉBUT de la
     promotion : la semaine 0 est le premier jour, il n'y a rien derrière. */
  select min(m.week_offset) into v_min
  from public.plan_milestones m
  where m.cohort_id = p_cohort_id and m.week_offset >= v_depuis;

  if v_min is not null and v_min + p_weeks < 0 then
    raise exception
      'Ce décalage placerait un jalon avant le début de la promotion (semaine %).', v_min + p_weeks;
  end if;

  v_fin := v_ends + (p_weeks * 7);
  if v_fin < v_starts then
    raise exception 'Ce décalage ferait finir la promotion avant son début.';
  end if;

  update public.cohorts set ends_on = v_fin, updated_at = now() where id = p_cohort_id;

  update public.plan_milestones m
     set week_offset = m.week_offset + p_weeks,
         week_offset_end = case
           when m.week_offset_end is null then null
           else m.week_offset_end + p_weeks
         end,
         updated_at = now()
   where m.cohort_id = p_cohort_id and m.week_offset >= v_depuis;
  get diagnostics v_jalons = row_count;

  perform public.journal_pilotage(
    p_cohort_id, 'decalage',
    case when p_weeks > 0
      then 'Calendrier décalé de ' || p_weeks || ' semaine(s)'
      else 'Calendrier avancé de ' || abs(p_weeks) || ' semaine(s)'
    end,
    btrim(p_reason),
    jsonb_build_object('semaines', p_weeks, 'depuis_semaine', v_depuis,
                       'jalons', v_jalons, 'nouvelle_fin', v_fin),
    p_incident_id);

  return query select p_weeks, v_jalons, v_fin;
end;
$$;

comment on function public.shift_cohort_calendar(uuid, integer, text, integer, uuid) is
  'Décale la fin de la promotion et ses jalons à partir d''une semaine donnée. Positif : on repousse. Négatif : on avance.';

/* ------------------------------------------------------------------ */
/* 4. L'INTERRUPTION ÉCRIT AU JOURNAL, ELLE AUSSI                      */
/* ------------------------------------------------------------------ */

/* Reprises telles quelles, à une ligne près : l'appel au journal. Sans cela le
   journal aurait un trou là où se prennent les décisions les plus lourdes. */

create or replace function public.pause_cohort(
  p_cohort_id uuid,
  p_mode public.cohort_interruption_mode,
  p_reason text,
  p_expected_until date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_status public.cohort_status;
  v_id uuid;
begin
  select c.program_id, c.status into v_program_id, v_status
  from public.cohorts c where c.id = p_cohort_id;

  if v_program_id is null then
    raise exception 'Promotion introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  if v_status in ('draft', 'completed', 'archived') then
    raise exception
      'Une promotion % ne s''interrompt pas : elle n''est pas en cours.', v_status;
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif de l''interruption est obligatoire.';
  end if;
  if exists (
    select 1 from public.cohort_interruptions i
    where i.cohort_id = p_cohort_id and i.ended_on is null
  ) then
    raise exception
      'Cette promotion est déjà interrompue. Reprenez-la avant d''en changer le degré.';
  end if;

  insert into public.cohort_interruptions (cohort_id, mode, reason, expected_until, declared_by)
  values (p_cohort_id, p_mode, btrim(p_reason), p_expected_until, auth.uid())
  returning id into v_id;

  perform public.journal_pilotage(
    p_cohort_id, 'interruption',
    case p_mode
      when 'suspended' then 'Parcours suspendu'
      when 'frozen' then 'Rendus gelés'
      else 'Interruption signalée'
    end,
    btrim(p_reason),
    jsonb_build_object('mode', p_mode, 'jusqu_a', p_expected_until));

  return v_id;
end;
$$;

create or replace function public.resume_cohort(
  p_cohort_id uuid,
  p_shift_weeks integer default 0,
  p_note text default ''
)
returns table (semaines_decalees integer, jalons_decales integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_starts date;
  v_interruption uuid;
  v_debut date;
  v_mode public.cohort_interruption_mode;
  v_semaine_debut integer;
  v_shift integer := greatest(0, least(104, coalesce(p_shift_weeks, 0)));
  v_jalons integer := 0;
begin
  select c.program_id, c.starts_on into v_program_id, v_starts
  from public.cohorts c where c.id = p_cohort_id;
  if v_program_id is null then
    raise exception 'Promotion introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  select i.id, i.started_on, i.mode into v_interruption, v_debut, v_mode
  from public.cohort_interruptions i
  where i.cohort_id = p_cohort_id and i.ended_on is null;

  if v_interruption is null then
    raise exception 'Cette promotion n''est pas interrompue.';
  end if;

  update public.cohort_interruptions
     set ended_on = current_date,
         ended_by = auth.uid(),
         ended_note = nullif(btrim(coalesce(p_note, '')), ''),
         shift_weeks = v_shift,
         updated_at = now()
   where id = v_interruption;

  if v_shift > 0 then
    v_semaine_debut := floor((v_debut - v_starts) / 7.0);

    update public.cohorts
       set ends_on = ends_on + (v_shift * 7), updated_at = now()
     where id = p_cohort_id;

    update public.plan_milestones m
       set week_offset = m.week_offset + v_shift,
           week_offset_end = case
             when m.week_offset_end is null then null
             else m.week_offset_end + v_shift
           end,
           updated_at = now()
     where m.cohort_id = p_cohort_id
       and m.week_offset >= v_semaine_debut;
    get diagnostics v_jalons = row_count;
  end if;

  perform public.journal_pilotage(
    p_cohort_id, 'reprise',
    case when v_shift > 0
      then 'Parcours repris, calendrier décalé de ' || v_shift || ' semaine(s)'
      else 'Parcours repris sans décalage'
    end,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Reprise sans note.'),
    jsonb_build_object('mode_leve', v_mode, 'semaines', v_shift, 'jalons', v_jalons));

  return query select v_shift, v_jalons;
end;
$$;

grant execute on function
  public.declare_incident(uuid, public.incident_scope, text, text, uuid, date) to authenticated;
grant execute on function public.resolve_incident(uuid, text) to authenticated;
grant execute on function
  public.shift_cohort_calendar(uuid, integer, text, integer, uuid) to authenticated;
