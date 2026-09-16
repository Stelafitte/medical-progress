-- ============================================================================
-- L'INTERRUPTION D'UNE PROMOTION — suspendre, geler, signaler.
--
-- Stef, 16/09 : « quand on parle de Pilotage, on est censé agir… jusqu'à
-- pouvoir stopper, pauser, relancer le programme », puis : « il faut des
-- boutons pour chaque situation que tu envisages avec la Pause ». La pause
-- n'est donc PAS un comportement unique, c'est un choix entre trois degrés :
--
--   suspended  le parcours disparaît pour l'apprenant et pour l'encadrant ;
--   frozen     tout reste visible et relisible, plus rien ne s'écrit ;
--   flagged    rien ne change pour personne, la trace existe pour l'équipe.
--
-- POURQUOI UNE TABLE ET PAS UNE VALEUR D'ENUM. `cohorts.status` porte le CYCLE
-- DE VIE (draft → open → in_progress → completed → archived). Une interruption
-- est un ÉPISODE : elle a un début, un motif, une fin prévue, une fin réelle,
-- et il peut y en avoir plusieurs dans la vie d'une promotion. La mettre dans
-- l'enum ferait perdre l'historique et obligerait à mémoriser « le statut
-- d'avant » pour savoir où revenir. Le statut reste donc intact pendant la
-- pause : c'est l'interruption ouverte qui décide de l'effet.
--
-- CE QUI FAIT VRAIMENT BARRAGE. Les fonctions `security definer` contournent
-- la RLS : une garde posée seulement dans la RLS ne bloquerait donc AUCUNE des
-- écritures de l'apprenant, qui passent toutes par des RPC. La garde est posée
-- en TRIGGER sur les tables écrites — un trigger, lui, ne se contourne pas, et
-- il couvrira aussi les chemins d'écriture qui n'existent pas encore.
--
-- RIEN N'EST DÉTRUIT. Une interruption cache ou fige ; ce qui est rendu reste
-- rendu, ce qui est validé reste validé.
-- ============================================================================

create type public.cohort_interruption_mode as enum ('suspended', 'frozen', 'flagged');

comment on type public.cohort_interruption_mode is
  'Degré d''interruption : suspended = invisible, frozen = lecture seule, flagged = marqueur interne.';

create table public.cohort_interruptions (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  mode public.cohort_interruption_mode not null,
  -- Le motif est OBLIGATOIRE : une promotion arrêtée sans motif, six semaines
  -- plus tard, plus personne ne sait pourquoi.
  reason text not null check (length(btrim(reason)) between 3 and 2000),
  started_on date not null default current_date,
  expected_until date,
  ended_on date,
  ended_note text check (ended_note is null or length(btrim(ended_note)) <= 2000),
  -- Décalage appliqué au calendrier à la reprise, EN SEMAINES — parce que tout
  -- le plan est en semaines (`plan_milestones.week_offset`), et qu'un décalage
  -- exprimé en jours ne saurait pas où pousser un jalon. Zéro est une décision
  -- comme une autre : la promotion rattrape.
  shift_weeks integer not null default 0 check (shift_weeks between 0 and 104),
  declared_by uuid references public.profiles (id),
  ended_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cohort_interruptions_dates_ordered
    check (ended_on is null or ended_on >= started_on),
  constraint cohort_interruptions_until_ordered
    check (expected_until is null or expected_until >= started_on)
);

comment on table public.cohort_interruptions is
  'Épisodes d''interruption d''une promotion. Une seule ouverte à la fois ; l''historique est conservé.';

-- AU PLUS UNE INTERRUPTION OUVERTE PAR PROMOTION. Deux pauses simultanées de
-- degrés différents ne voudraient rien dire : laquelle s'applique ?
create unique index cohort_interruptions_une_seule_ouverte
  on public.cohort_interruptions (cohort_id)
  where ended_on is null;

create index cohort_interruptions_cohort_idx
  on public.cohort_interruptions (cohort_id, started_on desc);

/* ------------------------------------------------------------------ */
/* Lecture : l'apprenant DOIT savoir que son parcours est interrompu   */
/* ------------------------------------------------------------------ */

alter table public.cohort_interruptions enable row level security;

create policy cohort_interruptions_select_scoped
  on public.cohort_interruptions for select
  to authenticated
  using (
    exists (
      select 1 from public.cohorts c
      where c.id = cohort_interruptions.cohort_id
        and (
          public.is_program_staff(c.program_id)
          or exists (
            select 1 from public.enrollments e
            where e.cohort_id = c.id and e.person_id = auth.uid()
          )
        )
    )
  );

-- Aucune écriture directe : tout passe par les deux fonctions ci-dessous.
revoke insert, update, delete on public.cohort_interruptions from authenticated, anon;

/* ------------------------------------------------------------------ */
/* Le mode effectif d'une promotion                                    */
/* ------------------------------------------------------------------ */

create or replace function public.cohort_interruption_mode(p_cohort_id uuid)
returns public.cohort_interruption_mode
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.mode
  from public.cohort_interruptions i
  where i.cohort_id = p_cohort_id and i.ended_on is null
  limit 1
$$;

comment on function public.cohort_interruption_mode(uuid) is
  'Degré d''interruption en cours sur cette promotion, ou NULL si elle tourne normalement.';

/* ------------------------------------------------------------------ */
/* LA GARDE D'ÉCRITURE                                                 */
/* ------------------------------------------------------------------ */

create or replace function public.refuse_si_parcours_interrompu()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment uuid;
  v_mode public.cohort_interruption_mode;
  v_reason text;
begin
  /* Chaque table gardée porte `enrollment_id`, sauf les lignes d'un carnet,
     qui remontent par leur carnet. On lit le champ sans le nommer en dur pour
     que la même fonction serve partout. */
  v_enrollment := (to_jsonb(new) ->> 'enrollment_id')::uuid;
  if v_enrollment is null and (to_jsonb(new) ? 'stage_log_id') then
    select s.enrollment_id into v_enrollment
    from public.stage_logs s where s.id = (to_jsonb(new) ->> 'stage_log_id')::uuid;
  end if;
  if v_enrollment is null then
    return new;
  end if;

  select i.mode, i.reason into v_mode, v_reason
  from public.enrollments e
  join public.cohort_interruptions i
    on i.cohort_id = e.cohort_id and i.ended_on is null
  where e.id = v_enrollment;

  /* `flagged` ne bloque rien, c'est tout son objet : le parcours continue. */
  if v_mode is null or v_mode = 'flagged' then
    return new;
  end if;

  /* Le personnel du programme continue d'écrire pendant une pause : c'est lui
     qui rattrape, corrige et clôture. La pause vise le PARCOURS, pas l'équipe. */
  if exists (
    select 1 from public.enrollments e
    where e.id = v_enrollment and public.is_program_staff(e.program_id)
  ) then
    return new;
  end if;

  raise exception
    'Parcours interrompu : %. Aucun rendu n''est possible tant que la promotion n''a pas repris.',
    v_reason
    using errcode = 'check_violation';
end;
$$;

comment on function public.refuse_si_parcours_interrompu() is
  'Refuse toute écriture d''apprenant sur une promotion suspendue ou gelée. Posée en trigger : une fonction security definer ne la contourne pas.';

do $$
declare
  t text;
begin
  foreach t in array array[
    'question_attempts',
    'stage_logs',
    'stage_log_entries',
    'stage_logbook_reports',
    'outcome_self_reports',
    'outcome_experience_notes',
    'ecos_external_runs',
    'learner_milestone_shifts'
  ]
  loop
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.refuse_si_parcours_interrompu()',
      'zz_' || t || '_parcours_interrompu', t
    );
  end loop;
end $$;

/* ------------------------------------------------------------------ */
/* Les deux gestes du pilotage                                         */
/* ------------------------------------------------------------------ */

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

  return v_id;
end;
$$;

comment on function public.pause_cohort(uuid, public.cohort_interruption_mode, text, date) is
  'Interrompt une promotion selon l''un des trois degrés. Le motif est obligatoire.';

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

  select i.id, i.started_on into v_interruption, v_debut
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

  /* LE DÉCALAGE EST CE QUI SÉPARE UNE PAUSE QUI RÉPARE D'UNE PAUSE QUI LAISSE
     LA PROMOTION EN RETARD DE TROIS SEMAINES.

     Il ne touche QUE ce qui n'a pas encore eu lieu : les jalons posés avant le
     début de l'interruption ont été tenus, les décaler réécrirait le passé.
     La semaine de référence se compte comme partout ailleurs dans le produit
     — floor(jours / 7) depuis le début de la promotion. */
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

  return query select v_shift, v_jalons;
end;
$$;

comment on function public.resume_cohort(uuid, integer, text) is
  'Lève l''interruption en cours et décale, si demandé, la fin de la promotion et les jalons postérieurs au début de la pause.';

grant execute on function public.cohort_interruption_mode(uuid) to authenticated;
grant execute on function public.pause_cohort(uuid, public.cohort_interruption_mode, text, date) to authenticated;
grant execute on function public.resume_cohort(uuid, integer, text) to authenticated;
