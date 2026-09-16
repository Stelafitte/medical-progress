-- LES DOSSIERS PROGRESSIFS (mini-DP) ET KFP (15/09, soir).
--
-- Le chat DEV EVALUATION livre un premier lot : 21 mini-DP, 111 etapes, formats
-- qru / qrm / qrp_longue, chaque etape rattachee a un acquis (ECN-xxx-yy), avec
-- des donnees nouvelles (« reveal ») entre les etapes et un corrige par etape.
--
-- LE MODELE : un DOSSIER (question_cases : vignette, item, titre) et ses ETAPES,
-- qui SONT des question_items (case_id, case_position, reveal, expected,
-- answer_note). Une etape se note avec answer_question, au bareme EDN deja en
-- place : une seule bonne reponse -> 1 ou 0 ; plusieurs -> discordances ;
-- « nombre attendu revele » (qrp_longue) -> proportion. Rien n'est duplique.
--
-- LES ETAPES NE SORTENT JAMAIS DANS UNE SERIE DE QCM LIBRE : pick_questions,
-- count_questions et list_question_sections ne servent que les questions
-- sans dossier. Un dossier se joue entier, dans l'ordre, sans retour.

-- 1. Les dossiers ----------------------------------------------------------
create table if not exists public.question_cases (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  source text not null,
  external_ref text not null check (length(btrim(external_ref)) between 1 and 80),
  kind text not null check (kind in ('mini_dp', 'kfp')),
  title text not null check (length(btrim(title)) between 1 and 300),
  vignette text not null check (length(btrim(vignette)) between 10 and 8000),
  chapter integer check (chapter between 1 and 99),
  chapter_title text,
  item_code text,
  status text not null default 'publiee' check (status in ('brouillon', 'publiee', 'retiree')),
  validated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, external_ref)
);
alter table public.question_cases enable row level security;
revoke all on public.question_cases from public, anon, authenticated;
grant select on public.question_cases to authenticated;
drop policy if exists question_cases_select on public.question_cases;
create policy question_cases_select on public.question_cases
for select to authenticated
using (
  public.is_program_staff(program_id)
  or (status = 'publiee' and public.is_enrolled_in_program(program_id))
);

alter table public.question_items
  add column if not exists case_id uuid references public.question_cases (id) on delete cascade,
  add column if not exists case_position integer check (case_position >= 1),
  add column if not exists reveal text,
  add column if not exists expected integer check (expected >= 1),
  add column if not exists answer_note text;
create index if not exists question_items_case_idx on public.question_items (case_id, case_position);

comment on column public.question_items.case_id is 'Etape d''un dossier progressif : jamais servie seule dans une serie libre.';
comment on column public.question_items.reveal is 'Donnees nouvelles affichees AVANT cette etape, ajoutees a la vignette.';
comment on column public.question_items.expected is 'qrp_longue : nombre de reponses attendues, revele a l''etudiant (score proportionnel).';
comment on column public.question_items.answer_note is 'Le corrige de l''etape, montre apres la reponse.';

-- 2. Les series libres ignorent les etapes ------------------------------------
create or replace function public.pick_questions(
  p_program_id uuid,
  p_source text,
  p_theme_ids uuid[] default '{}',
  p_ranks text[] default '{}',
  p_count int default 20,
  p_chapters int[] default '{}',
  p_sections text[] default '{}'
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
     and q.case_id is null
     and (public.is_program_staff(p_program_id) or public.is_enrolled_in_program(p_program_id))
     and (coalesce(array_length(p_theme_ids, 1), 0) = 0 or o.theme_id = any (p_theme_ids))
     and (coalesce(array_length(p_ranks, 1), 0) = 0 or coalesce(q.rank, o.knowledge_rank::text) = any (p_ranks))
     and (coalesce(array_length(p_chapters, 1), 0) = 0 or q.chapter = any (p_chapters))
     and (coalesce(array_length(p_sections, 1), 0) = 0
          or (q.chapter || '|' || coalesce(q.section_label, '')) = any (p_sections))
   order by random()
   limit greatest(1, least(coalesce(p_count, 20), 100));
$$;

create or replace function public.count_questions(
  p_program_id uuid,
  p_source text,
  p_theme_ids uuid[] default '{}',
  p_ranks text[] default '{}',
  p_chapters int[] default '{}',
  p_sections text[] default '{}'
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
     and q.case_id is null
     and (public.is_program_staff(p_program_id) or public.is_enrolled_in_program(p_program_id))
     and (coalesce(array_length(p_theme_ids, 1), 0) = 0 or o.theme_id = any (p_theme_ids))
     and (coalesce(array_length(p_ranks, 1), 0) = 0 or coalesce(q.rank, o.knowledge_rank::text) = any (p_ranks))
     and (coalesce(array_length(p_chapters, 1), 0) = 0 or q.chapter = any (p_chapters))
     and (coalesce(array_length(p_sections, 1), 0) = 0
          or (q.chapter || '|' || coalesce(q.section_label, '')) = any (p_sections));
$$;

create or replace function public.list_question_sections(p_program_id uuid, p_source text)
returns table (
  chapter int, chapter_title text, item_code text,
  section_key text, section_label text, published bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select q.chapter,
         coalesce(max(q.chapter_title),
                  'Chapitre ' || q.chapter || ' · item ' || min(split_part(o.code, '-', 2))),
         min(split_part(o.code, '-', 2)),
         q.chapter || '|' || coalesce(q.section_label, ''),
         coalesce(q.section_label, 'Sans section'),
         count(*)
    from public.question_items q
    join public.outcomes o on o.id = q.outcome_id
   where q.program_id = p_program_id
     and q.source = p_source
     and q.status = 'publiee'
     and q.case_id is null
     and q.chapter is not null
     and (public.is_program_staff(p_program_id) or public.is_enrolled_in_program(p_program_id))
   group by q.chapter, q.section_label
   order by q.chapter, min(q.external_ref);
$$;

-- 3. Le resume des banques dit combien de dossiers elles portent ---------------
drop function if exists public.question_bank_summary(uuid);
create or replace function public.question_bank_summary(p_program_id uuid)
returns table (
  source text, file_name text, file_modified_at timestamptz, last_imported_at timestamptz,
  published bigint, drafts bigint, flagged bigint, retired bigint, cases bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select s.source, s.file_name, s.file_modified_at, s.last_imported_at,
         count(q.id) filter (where q.status = 'publiee' and q.case_id is null),
         count(q.id) filter (where q.status = 'brouillon' and q.case_id is null),
         count(q.id) filter (where q.status in ('signalee', 'en_revue')),
         count(q.id) filter (where q.status = 'retiree'),
         (select count(*) from public.question_cases c
           where c.program_id = s.program_id and c.source = s.source and c.status = 'publiee')
    from public.question_sources s
    left join public.question_items q on q.program_id = s.program_id and q.source = s.source
   where s.program_id = p_program_id
   group by s.program_id, s.source, s.file_name, s.file_modified_at, s.last_imported_at
  union all
  select q.source, null, null, min(q.created_at),
         count(*) filter (where q.status = 'publiee' and q.case_id is null),
         count(*) filter (where q.status = 'brouillon' and q.case_id is null),
         count(*) filter (where q.status in ('signalee', 'en_revue')),
         count(*) filter (where q.status = 'retiree'),
         0::bigint
    from public.question_items q
   where q.program_id = p_program_id
     and not exists (select 1 from public.question_sources s where s.program_id = q.program_id and s.source = q.source)
   group by q.source
   order by 1;
$$;
grant execute on function public.question_bank_summary(uuid) to authenticated;

-- 4. L'import des dossiers ------------------------------------------------------
--
-- Meme quatre modes que import_question_items. Un dossier = { external_ref,
-- kind, title, vignette, chapter, chapter_title, item_code, validated,
-- steps: [{ position, format, outcome_code, reveal, expected, stem,
-- answer_note, options: [{letter, body, correct, explanation, flag}] }] }.
-- Une etape dont l'acquis est introuvable prend l'acquis d'une autre etape du
-- meme dossier ; un dossier sans aucun acquis reconnu est ecarte et compte.
create or replace function public.import_question_cases(
  p_program_id uuid,
  p_mode text,
  p_source text,
  p_cases jsonb,
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
  v_case jsonb;
  v_step jsonb;
  v_opt jsonb;
  v_ref text;
  v_step_ref text;
  v_case_id uuid;
  v_question_id uuid;
  v_outcome_id uuid;
  v_fallback_outcome uuid;
  v_status text := case when p_publish then 'publiee' else 'brouillon' end;
  n_matched int := 0;
  n_unmatched int := 0;
  n_inserted int := 0;
  n_updated int := 0;
  n_deleted int := 0;
  n_retired int := 0;
  v_unmatched_codes text[] := '{}';
  v_pos int;
  v_exists boolean;
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
     where q.program_id = p_program_id and q.source = p_source and q.case_id is not null
       and q.status <> 'retiree'
       and exists (select 1 from public.question_attempts a where a.question_id = q.id);
    get diagnostics n_retired = row_count;
    delete from public.question_items q
     where q.program_id = p_program_id and q.source = p_source and q.case_id is not null
       and not exists (select 1 from public.question_attempts a where a.question_id = q.id);
    get diagnostics n_deleted = row_count;
    -- Un dossier dont toutes les etapes ont ete retirees est retire ; sans etape, supprime.
    update public.question_cases c set status = 'retiree', updated_at = now()
     where c.program_id = p_program_id and c.source = p_source
       and exists (select 1 from public.question_items q where q.case_id = c.id);
    delete from public.question_cases c
     where c.program_id = p_program_id and c.source = p_source
       and not exists (select 1 from public.question_items q where q.case_id = c.id);
  end if;

  if p_mode <> 'delete' then
    for v_case in select * from jsonb_array_elements(coalesce(p_cases, '[]'::jsonb)) loop
      v_ref := btrim(v_case->>'external_ref');

      -- L'acquis de repli : le premier reconnu parmi les etapes du dossier.
      select o.id into v_fallback_outcome
        from jsonb_array_elements(coalesce(v_case->'steps', '[]'::jsonb)) s
        join public.outcomes o on o.program_id = p_program_id
                              and o.code = btrim(s->>'outcome_code')
                              and o.archived_at is null
       limit 1;
      if v_fallback_outcome is null then
        n_unmatched := n_unmatched + 1;
        for v_step in select * from jsonb_array_elements(coalesce(v_case->'steps', '[]'::jsonb)) loop
          if not coalesce(v_step->>'outcome_code', '') = any (v_unmatched_codes) then
            v_unmatched_codes := array_append(v_unmatched_codes, coalesce(v_step->>'outcome_code', ''));
          end if;
        end loop;
        continue;
      end if;
      n_matched := n_matched + 1;

      select exists (select 1 from public.question_cases c
                      where c.program_id = p_program_id and c.external_ref = v_ref)
        into v_exists;
      if p_mode = 'dry_run' then
        if v_exists then n_updated := n_updated + 1; else n_inserted := n_inserted + 1; end if;
        continue;
      end if;

      v_case_id := null;
      if p_mode = 'merge' and v_exists then
        select c.id into v_case_id from public.question_cases c
         where c.program_id = p_program_id and c.external_ref = v_ref;
        update public.question_cases
           set source = p_source,
               kind = coalesce(nullif(v_case->>'kind', ''), 'mini_dp'),
               title = v_case->>'title',
               vignette = v_case->>'vignette',
               chapter = nullif(v_case->>'chapter', '')::int,
               chapter_title = nullif(v_case->>'chapter_title', ''),
               item_code = nullif(v_case->>'item_code', ''),
               validated = coalesce((v_case->>'validated')::boolean, false),
               status = v_status,
               updated_at = now()
         where id = v_case_id;
        n_updated := n_updated + 1;
      else
        insert into public.question_cases
          (program_id, source, external_ref, kind, title, vignette, chapter, chapter_title, item_code, validated, status)
        values
          (p_program_id, p_source, v_ref, coalesce(nullif(v_case->>'kind', ''), 'mini_dp'),
           v_case->>'title', v_case->>'vignette',
           nullif(v_case->>'chapter', '')::int, nullif(v_case->>'chapter_title', ''),
           nullif(v_case->>'item_code', ''),
           coalesce((v_case->>'validated')::boolean, false), v_status)
        returning id into v_case_id;
        n_inserted := n_inserted + 1;
      end if;

      -- Les etapes
      for v_step in select * from jsonb_array_elements(coalesce(v_case->'steps', '[]'::jsonb)) loop
        v_step_ref := v_ref || '-' || coalesce(v_step->>'position', '0');
        select o.id into v_outcome_id
          from public.outcomes o
         where o.program_id = p_program_id
           and o.code = btrim(v_step->>'outcome_code')
           and o.archived_at is null
         limit 1;
        v_outcome_id := coalesce(v_outcome_id, v_fallback_outcome);

        v_question_id := null;
        select q.id into v_question_id from public.question_items q
         where q.program_id = p_program_id and q.external_ref = v_step_ref;

        if v_question_id is not null then
          update public.question_items
             set source = p_source,
                 case_id = v_case_id,
                 case_position = nullif(v_step->>'position', '')::int,
                 outcome_id = v_outcome_id,
                 format = coalesce(nullif(v_step->>'format', ''), 'qrm'),
                 stem = v_step->>'stem',
                 commentary = null,
                 reveal = nullif(v_step->>'reveal', ''),
                 expected = nullif(v_step->>'expected', '')::int,
                 answer_note = nullif(v_step->>'answer_note', ''),
                 chapter = nullif(v_case->>'chapter', '')::int,
                 chapter_title = nullif(v_case->>'chapter_title', ''),
                 rank = nullif(upper(btrim(v_step->>'rank')), ''),
                 status = case when status in ('retiree') then v_status else status end,
                 version = version + 1
           where id = v_question_id;
          delete from public.question_options where question_id = v_question_id;
        else
          insert into public.question_items
            (program_id, outcome_id, external_ref, format, stem, chapter, chapter_title, rank,
             status, source, case_id, case_position, reveal, expected, answer_note)
          values
            (p_program_id, v_outcome_id, v_step_ref,
             coalesce(nullif(v_step->>'format', ''), 'qrm'), v_step->>'stem',
             nullif(v_case->>'chapter', '')::int, nullif(v_case->>'chapter_title', ''),
             nullif(upper(btrim(v_step->>'rank')), ''),
             v_status, p_source, v_case_id, nullif(v_step->>'position', '')::int,
             nullif(v_step->>'reveal', ''), nullif(v_step->>'expected', '')::int,
             nullif(v_step->>'answer_note', ''))
          returning id into v_question_id;
        end if;

        v_pos := 0;
        for v_opt in select * from jsonb_array_elements(coalesce(v_step->'options', '[]'::jsonb)) loop
          v_pos := v_pos + 1;
          insert into public.question_options (question_id, position, letter, body, correct, explanation, flag)
          values (v_question_id, v_pos, upper(v_opt->>'letter'), v_opt->>'body',
                  coalesce((v_opt->>'correct')::boolean, false), nullif(v_opt->>'explanation', ''),
                  nullif(v_opt->>'flag', ''));
        end loop;
      end loop;
    end loop;

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
revoke all on function public.import_question_cases(uuid, text, text, jsonb, boolean, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.import_question_cases(uuid, text, text, jsonb, boolean, text, timestamptz)
  to authenticated;

-- 5. Lire les dossiers ---------------------------------------------------------
create or replace function public.list_question_cases(p_program_id uuid, p_source text)
returns table (
  id uuid, external_ref text, kind text, title text, chapter int, chapter_title text,
  item_code text, status text, validated boolean, steps bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.external_ref, c.kind, c.title, c.chapter, c.chapter_title, c.item_code,
         c.status, c.validated,
         (select count(*) from public.question_items q where q.case_id = c.id and q.status = 'publiee')
    from public.question_cases c
   where c.program_id = p_program_id
     and c.source = p_source
     and (public.is_program_staff(p_program_id)
          or (c.status = 'publiee' and public.is_enrolled_in_program(p_program_id)))
   order by c.chapter nulls last, c.external_ref;
$$;
revoke all on function public.list_question_cases(uuid, text) from public, anon;
grant execute on function public.list_question_cases(uuid, text) to authenticated;

-- Un dossier entier, SANS ses reponses : ce que le lecteur affiche.
create or replace function public.read_case(p_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'id', c.id, 'external_ref', c.external_ref, 'kind', c.kind, 'title', c.title,
           'vignette', c.vignette, 'chapter', c.chapter, 'chapter_title', c.chapter_title,
           'item_code', c.item_code,
           'steps', (
             select coalesce(jsonb_agg(
               jsonb_build_object(
                 'id', q.id, 'position', q.case_position, 'format', q.format,
                 'reveal', q.reveal, 'stem', q.stem, 'expected', q.expected,
                 'options', (
                   select coalesce(jsonb_agg(jsonb_build_object('letter', o.letter, 'body', o.body) order by o.position), '[]'::jsonb)
                     from public.question_options o where o.question_id = q.id
                 )
               ) order by q.case_position), '[]'::jsonb)
               from public.question_items q
              where q.case_id = c.id and q.status = 'publiee'
           )
         )
    from public.question_cases c
   where c.id = p_case_id
     and (public.is_program_staff(c.program_id)
          or (c.status = 'publiee' and public.is_enrolled_in_program(c.program_id)));
$$;
revoke all on function public.read_case(uuid) from public, anon;
grant execute on function public.read_case(uuid) to authenticated;

-- Repondre a une etape : answer_question, plus le corrige. Le nombre attendu
-- d'une qrp_longue est revele a l'etudiant : la note est proportionnelle.
create or replace function public.answer_case_step(
  p_question_id uuid,
  p_enrollment_id uuid,
  p_selected text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_q public.question_items;
  v_result jsonb;
begin
  select * into v_q from public.question_items where id = p_question_id;
  if v_q.id is null or v_q.case_id is null then
    raise exception 'Cette question n''est pas l''etape d''un dossier.';
  end if;
  v_result := public.answer_question(p_question_id, p_enrollment_id, p_selected,
                                     v_q.format = 'qrp_longue' and v_q.expected is not null);
  return v_result || jsonb_build_object('note', v_q.answer_note);
end;
$$;
revoke all on function public.answer_case_step(uuid, uuid, text[]) from public, anon;
grant execute on function public.answer_case_step(uuid, uuid, text[]) to authenticated;

-- 6. Les resultats des dossiers ---------------------------------------------------
create or replace function public.my_case_results(p_enrollment_id uuid)
returns table (
  case_id uuid, external_ref text, title text, kind text, chapter int, item_code text,
  steps bigint, answered bigint, avg_score numeric, last_answered_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.external_ref, c.title, c.kind, c.chapter, c.item_code,
         (select count(*) from public.question_items s where s.case_id = c.id and s.status = 'publiee'),
         count(distinct a.question_id), round(avg(a.score), 2), max(a.answered_at)
    from public.question_attempts a
    join public.enrollments e on e.id = a.enrollment_id
    join public.question_items q on q.id = a.question_id
    join public.question_cases c on c.id = q.case_id
   where a.enrollment_id = p_enrollment_id
     and e.person_id = auth.uid()
   group by c.id
   order by max(a.answered_at) desc;
$$;
revoke all on function public.my_case_results(uuid) from public, anon;
grant execute on function public.my_case_results(uuid) to authenticated;

create or replace function public.case_results_by_cohort(p_cohort_id uuid)
returns table (
  case_id uuid, external_ref text, title text, kind text, chapter int, item_code text,
  learners bigint, attempts bigint, avg_score numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.external_ref, c.title, c.kind, c.chapter, c.item_code,
         count(distinct a.enrollment_id), count(a.id), round(avg(a.score), 2)
    from public.question_attempts a
    join public.enrollments e on e.id = a.enrollment_id
    join public.question_items q on q.id = a.question_id
    join public.question_cases c on c.id = q.case_id
   where e.cohort_id = p_cohort_id
     and public.is_program_staff(e.program_id)
   group by c.id
   order by c.chapter nulls last, c.external_ref;
$$;
revoke all on function public.case_results_by_cohort(uuid) from public, anon;
grant execute on function public.case_results_by_cohort(uuid) to authenticated;
