-- LE PILOTAGE DES QCM — banques, ouverture, acces libre, fenetres (15/09).
--
-- Stef : « en cliquant sur QCM d'entrainement je dois voir les banques a
-- disposition (fichier, nombre, dates) et choisir ; piloter la modalite :
-- ouvert/ferme, calendrier de mise a disposition sur la duree du stage ; soit
-- l'etudiant a acces a toute la base comme il veut (theme, item, rang, nombre
-- — "je m'evalue maintenant"), soit des auto-evaluations programmees calees
-- sur le plan de montee en connaissance. Il faut les deux. »
--
-- CE QUE CETTE MIGRATION POSE, sans rien casser de ce qui existe :
--   1. question_sources : la provenance d'une banque (fichier, date, nombre) ;
--   2. cohort_assessment_modalities : le PILOTAGE par promotion — ouvert,
--      banque servie, acces libre ;
--   3. assessment_sessions : une epreuve devient une FENETRE (closes_on) et
--      porte une CONFIGURATION (themes, rangs, nombre) ;
--   4. pick_questions : tirer au sort N questions publiees d'une banque,
--      filtrees par theme et rang — la seule lecture dont le joueur a besoin
--      en plus de read_question / answer_question / report_question.

-- 1. La provenance des banques --------------------------------------------
create table if not exists public.question_sources (
  program_id uuid not null references public.programs (id) on delete cascade,
  source text not null,
  file_name text,
  file_modified_at timestamptz,
  last_imported_at timestamptz not null default now(),
  primary key (program_id, source)
);
alter table public.question_sources enable row level security;
revoke all on public.question_sources from public, anon, authenticated;
grant select on public.question_sources to authenticated;
create policy question_sources_select on public.question_sources
for select to authenticated
using (public.is_program_staff(program_id) or public.is_enrolled_in_program(program_id));

-- L'import enregistre la provenance. Signature elargie : les deux nouveaux
-- parametres ont une valeur par defaut, l'ancien appel reste valide.
create or replace function public.import_question_items(
  p_program_id uuid,
  p_mode text,
  p_source text,
  p_items jsonb,
  p_publish boolean default true,
  p_file_name text default null,
  p_file_modified_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_opt jsonb;
  v_ref text;
  v_outcome_id uuid;
  v_question_id uuid;
  v_status text := case when p_publish then 'publiee' else 'brouillon' end;
  n_matched int := 0;
  n_unmatched int := 0;
  n_inserted int := 0;
  n_updated int := 0;
  n_deleted int := 0;
  n_retired int := 0;
  v_unmatched_codes text[] := '{}';
  v_pos int;
begin
  if p_mode not in ('dry_run', 'merge', 'replace', 'delete') then
    raise exception 'Mode inconnu : %', p_mode;
  end if;
  if not public.can_administer_program(p_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  if length(btrim(coalesce(p_source, ''))) = 0 then
    raise exception 'La source est obligatoire.';
  end if;

  if p_mode in ('replace', 'delete') then
    update public.question_items q
       set status = 'retiree'
     where q.program_id = p_program_id and q.source = p_source
       and q.status <> 'retiree'
       and exists (select 1 from public.question_attempts a where a.question_id = q.id);
    get diagnostics n_retired = row_count;
    delete from public.question_items q
     where q.program_id = p_program_id and q.source = p_source
       and not exists (select 1 from public.question_attempts a where a.question_id = q.id);
    get diagnostics n_deleted = row_count;
  end if;

  if p_mode <> 'delete' then
    for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
      v_ref := btrim(v_item->>'external_ref');
      select o.id into v_outcome_id
        from public.outcomes o
       where o.program_id = p_program_id
         and o.code = btrim(v_item->>'outcome_code')
         and o.archived_at is null
       limit 1;
      if v_outcome_id is null then
        n_unmatched := n_unmatched + 1;
        if not (v_item->>'outcome_code') = any (v_unmatched_codes) then
          v_unmatched_codes := array_append(v_unmatched_codes, v_item->>'outcome_code');
        end if;
        continue;
      end if;
      n_matched := n_matched + 1;

      if p_mode = 'dry_run' then
        if exists (select 1 from public.question_items q
                    where q.program_id = p_program_id and q.source = p_source
                      and q.external_ref = v_ref) then
          n_updated := n_updated + 1;
        else
          n_inserted := n_inserted + 1;
        end if;
        continue;
      end if;

      v_question_id := null;
      if p_mode = 'merge' then
        select q.id into v_question_id
          from public.question_items q
         where q.program_id = p_program_id and q.source = p_source
           and q.external_ref = v_ref
         limit 1;
      end if;

      if v_question_id is not null then
        update public.question_items
           set outcome_id    = v_outcome_id,
               format        = coalesce(nullif(v_item->>'format', ''), 'qrm'),
               stem          = v_item->>'stem',
               commentary    = nullif(v_item->>'commentary', ''),
               chapter       = nullif(v_item->>'chapter', '')::int,
               section_label = nullif(v_item->>'section_label', ''),
               version       = version + 1
         where id = v_question_id;
        delete from public.question_options where question_id = v_question_id;
        n_updated := n_updated + 1;
      else
        insert into public.question_items
          (program_id, outcome_id, external_ref, format, stem, commentary, chapter, section_label, status, source)
        values
          (p_program_id, v_outcome_id, v_ref,
           coalesce(nullif(v_item->>'format', ''), 'qrm'),
           v_item->>'stem', nullif(v_item->>'commentary', ''),
           nullif(v_item->>'chapter', '')::int, nullif(v_item->>'section_label', ''),
           v_status, p_source)
        returning id into v_question_id;
        n_inserted := n_inserted + 1;
      end if;

      v_pos := 0;
      for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb)) loop
        v_pos := v_pos + 1;
        insert into public.question_options (question_id, position, letter, body, correct, explanation)
        values (v_question_id, v_pos, upper(v_opt->>'letter'), v_opt->>'body',
                (v_opt->>'correct')::boolean, nullif(v_opt->>'explanation', ''));
      end loop;
    end loop;

    -- La provenance : posee a chaque import qui ecrit.
    if p_mode in ('merge', 'replace') then
      insert into public.question_sources (program_id, source, file_name, file_modified_at, last_imported_at)
      values (p_program_id, p_source, p_file_name, p_file_modified_at, now())
      on conflict (program_id, source) do update
        set file_name        = coalesce(excluded.file_name, question_sources.file_name),
            file_modified_at = coalesce(excluded.file_modified_at, question_sources.file_modified_at),
            last_imported_at = now();
    end if;
  else
    delete from public.question_sources where program_id = p_program_id and source = p_source;
  end if;

  return jsonb_build_object(
    'mode', p_mode, 'source', p_source,
    'matched', n_matched, 'unmatched', n_unmatched, 'unmatched_codes', to_jsonb(v_unmatched_codes),
    'inserted', n_inserted, 'updated', n_updated, 'deleted', n_deleted, 'retired', n_retired
  );
end;
$$;
revoke all on function public.import_question_items(uuid, text, text, jsonb, boolean, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.import_question_items(uuid, text, text, jsonb, boolean, text, timestamptz)
  to authenticated;
-- L'ancienne signature a cinq parametres devient ambigue pour PostgREST : on la retire.
drop function if exists public.import_question_items(uuid, text, text, jsonb, boolean);

-- Ce que l'ecran affiche : chaque banque, son fichier, ses dates, ses comptes.
drop function if exists public.question_bank_summary(uuid);
create or replace function public.question_bank_summary(p_program_id uuid)
returns table (
  source text, file_name text, file_modified_at timestamptz, last_imported_at timestamptz,
  published bigint, drafts bigint, flagged bigint, retired bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select s.source, s.file_name, s.file_modified_at, s.last_imported_at,
         count(q.id) filter (where q.status = 'publiee'),
         count(q.id) filter (where q.status = 'brouillon'),
         count(q.id) filter (where q.status in ('signalee', 'en_revue')),
         count(q.id) filter (where q.status = 'retiree')
    from public.question_sources s
    left join public.question_items q on q.program_id = s.program_id and q.source = s.source
   where s.program_id = p_program_id
   group by s.source, s.file_name, s.file_modified_at, s.last_imported_at
  union all
  -- Les banques importees AVANT cette migration n'ont pas de ligne de provenance.
  select q.source, null, null, min(q.created_at),
         count(*) filter (where q.status = 'publiee'),
         count(*) filter (where q.status = 'brouillon'),
         count(*) filter (where q.status in ('signalee', 'en_revue')),
         count(*) filter (where q.status = 'retiree')
    from public.question_items q
   where q.program_id = p_program_id
     and not exists (select 1 from public.question_sources s where s.program_id = q.program_id and s.source = q.source)
   group by q.source
   order by 1;
$$;
grant execute on function public.question_bank_summary(uuid) to authenticated;

-- 2. Le pilotage par promotion --------------------------------------------
alter table public.cohort_assessment_modalities
  add column if not exists is_open boolean not null default true,
  add column if not exists question_source text,
  add column if not exists free_access boolean not null default true;

comment on column public.cohort_assessment_modalities.is_open is
  'Ouvert / ferme a la main par l''equipe. Ferme = l''etudiant voit la modalite mais ne peut rien lancer.';
comment on column public.cohort_assessment_modalities.question_source is
  'Pour un QCM : la banque servie a cette promotion (question_items.source).';
comment on column public.cohort_assessment_modalities.free_access is
  'Pour un QCM : l''etudiant peut se composer une serie quand il veut (themes, rangs, nombre).';

create or replace function public.set_cohort_assessment_pilotage(
  p_cohort_id uuid,
  p_modality_id uuid,
  p_is_open boolean,
  p_question_source text,
  p_free_access boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
begin
  select program_id into v_program_id
    from public.cohort_assessment_modalities
   where cohort_id = p_cohort_id and modality_id = p_modality_id;
  if v_program_id is null then
    raise exception 'Cette promotion n''utilise pas cette modalité.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  update public.cohort_assessment_modalities
     set is_open = p_is_open,
         question_source = nullif(btrim(coalesce(p_question_source, '')), ''),
         free_access = p_free_access
   where cohort_id = p_cohort_id and modality_id = p_modality_id;
end;
$$;
revoke all on function public.set_cohort_assessment_pilotage(uuid, uuid, boolean, text, boolean)
  from public, anon, authenticated;
grant execute on function public.set_cohort_assessment_pilotage(uuid, uuid, boolean, text, boolean)
  to authenticated;

-- 3. Une epreuve devient une fenetre, et porte sa configuration -------------
alter table public.assessment_sessions
  add column if not exists closes_on date,
  add column if not exists config jsonb;
alter table public.assessment_sessions
  drop constraint if exists assessment_sessions_window_coherent;
alter table public.assessment_sessions
  add constraint assessment_sessions_window_coherent
  check (closes_on is null or closes_on >= scheduled_on);

comment on column public.assessment_sessions.closes_on is
  'Fin de la fenetre d''acces. Nul = epreuve d''un jour (scheduled_on).';
comment on column public.assessment_sessions.config is
  'Pour un QCM : {"theme_ids": [uuid], "ranks": ["A","B"], "count": 20, "milestone_id": uuid|null}.';

drop function if exists public.create_assessment_session(uuid, uuid, date, text, text);
create or replace function public.create_assessment_session(
  p_modality_id uuid,
  p_cohort_id uuid,
  p_scheduled_on date,
  p_location text default null,
  p_notes text default null,
  p_closes_on date default null,
  p_config jsonb default null
)
returns public.assessment_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.assessment_sessions;
begin
  select program_id into v_program_id
    from public.assessment_modalities where id = p_modality_id and archived_at is null;
  if v_program_id is null then
    raise exception 'Modalité d''évaluation introuvable ou archivée.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  insert into public.assessment_sessions
    (program_id, modality_id, cohort_id, scheduled_on, closes_on, location, notes, config)
  values
    (v_program_id, p_modality_id, p_cohort_id, p_scheduled_on, p_closes_on,
     nullif(btrim(coalesce(p_location, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), p_config)
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.create_assessment_session(uuid, uuid, date, text, text, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_assessment_session(uuid, uuid, date, text, text, date, jsonb)
  to authenticated;

drop function if exists public.update_assessment_session(uuid, date, text, text);
create or replace function public.update_assessment_session(
  p_session_id uuid,
  p_scheduled_on date,
  p_location text default null,
  p_notes text default null,
  p_closes_on date default null,
  p_config jsonb default null
)
returns public.assessment_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.assessment_sessions;
begin
  select program_id into v_program_id from public.assessment_sessions where id = p_session_id;
  if v_program_id is null then
    raise exception 'Épreuve introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  update public.assessment_sessions
     set scheduled_on = p_scheduled_on,
         closes_on    = p_closes_on,
         location     = nullif(btrim(coalesce(p_location, '')), ''),
         notes        = nullif(btrim(coalesce(p_notes, '')), ''),
         config       = p_config
   where id = p_session_id
   returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.update_assessment_session(uuid, date, text, text, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_assessment_session(uuid, date, text, text, date, jsonb)
  to authenticated;

-- 4. Tirer une serie ---------------------------------------------------------
--
-- N questions publiees d'une banque, au hasard, filtrees par theme (via
-- l'acquis) et par rang (knowledge_rank de l'acquis ; une question dont
-- l'acquis n'a pas de rang passe si aucun rang n'est demande). Un tableau
-- vide de themes ou de rangs = pas de filtre. Reserve aux inscrits et a
-- l'equipe : les identifiants ne disent rien, read_question fera le reste.
create or replace function public.pick_questions(
  p_program_id uuid,
  p_source text,
  p_theme_ids uuid[] default '{}',
  p_ranks text[] default '{}',
  p_count int default 20
)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select q.id
    from public.question_items q
    join public.outcomes o on o.id = q.outcome_id
   where q.program_id = p_program_id
     and q.source = p_source
     and q.status = 'publiee'
     and (public.is_program_staff(p_program_id) or public.is_enrolled_in_program(p_program_id))
     and (coalesce(array_length(p_theme_ids, 1), 0) = 0 or o.theme_id = any (p_theme_ids))
     and (coalesce(array_length(p_ranks, 1), 0) = 0 or o.knowledge_rank::text = any (p_ranks))
   order by random()
   limit greatest(1, least(coalesce(p_count, 20), 100));
$$;
revoke all on function public.pick_questions(uuid, text, uuid[], text[], int) from public, anon;
grant execute on function public.pick_questions(uuid, text, uuid[], text[], int) to authenticated;

-- Combien de questions repondent a un filtre : l'etudiant le voit AVANT de
-- lancer, pour ne pas demander 40 questions la ou il y en a 12.
create or replace function public.count_questions(
  p_program_id uuid,
  p_source text,
  p_theme_ids uuid[] default '{}',
  p_ranks text[] default '{}'
)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)
    from public.question_items q
    join public.outcomes o on o.id = q.outcome_id
   where q.program_id = p_program_id
     and q.source = p_source
     and q.status = 'publiee'
     and (public.is_program_staff(p_program_id) or public.is_enrolled_in_program(p_program_id))
     and (coalesce(array_length(p_theme_ids, 1), 0) = 0 or o.theme_id = any (p_theme_ids))
     and (coalesce(array_length(p_ranks, 1), 0) = 0 or o.knowledge_rank::text = any (p_ranks));
$$;
revoke all on function public.count_questions(uuid, text, uuid[], text[]) from public, anon;
grant execute on function public.count_questions(uuid, text, uuid[], text[]) to authenticated;
