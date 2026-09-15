-- LE RANG DE LA QUESTION (15/09, soir).
--
-- Mesure a l'ecran par Stef : item 235 + rang A = « 0 question ». Le filtre
-- lisait le rang de l'ACQUIS (outcomes.knowledge_rank), souvent absent ou
-- different ; la banque porte pourtant un rang PAR QUESTION (1031 A, 454 B,
-- 8 C), valide par Stef, que l'import ne conservait pas. Ici : la colonne, son
-- import, et le filtre qui la lit — repli sur le rang de l'acquis si la
-- question n'en a pas (banque importee avant cette migration).
alter table public.question_items
  add column if not exists rank text check (rank in ('A', 'B', 'C'));

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
               chapter_title = nullif(v_item->>'chapter_title', ''),
               section_label = nullif(v_item->>'section_label', ''),
               rank          = nullif(upper(btrim(v_item->>'rank')), ''),
               version       = version + 1
         where id = v_question_id;
        delete from public.question_options where question_id = v_question_id;
        n_updated := n_updated + 1;
      else
        insert into public.question_items
          (program_id, outcome_id, external_ref, format, stem, commentary,
           chapter, chapter_title, section_label, rank, status, source)
        values
          (p_program_id, v_outcome_id, v_ref,
           coalesce(nullif(v_item->>'format', ''), 'qrm'),
           v_item->>'stem', nullif(v_item->>'commentary', ''),
           nullif(v_item->>'chapter', '')::int, nullif(v_item->>'chapter_title', ''),
           nullif(v_item->>'section_label', ''),
           nullif(upper(btrim(v_item->>'rank')), ''),
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

-- Le filtre : rang de la question d'abord, celui de l'acquis a defaut.
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
     and (public.is_program_staff(p_program_id) or public.is_enrolled_in_program(p_program_id))
     and (coalesce(array_length(p_theme_ids, 1), 0) = 0 or o.theme_id = any (p_theme_ids))
     and (coalesce(array_length(p_ranks, 1), 0) = 0 or coalesce(q.rank, o.knowledge_rank::text) = any (p_ranks))
     and (coalesce(array_length(p_chapters, 1), 0) = 0 or q.chapter = any (p_chapters))
     and (coalesce(array_length(p_sections, 1), 0) = 0
          or (q.chapter || '|' || coalesce(q.section_label, '')) = any (p_sections))
   order by random()
   limit greatest(1, least(coalesce(p_count, 20), 100));
$$;
revoke all on function public.pick_questions(uuid, text, uuid[], text[], int, int[], text[]) from public, anon;
grant execute on function public.pick_questions(uuid, text, uuid[], text[], int, int[], text[]) to authenticated;

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
     and (public.is_program_staff(p_program_id) or public.is_enrolled_in_program(p_program_id))
     and (coalesce(array_length(p_theme_ids, 1), 0) = 0 or o.theme_id = any (p_theme_ids))
     and (coalesce(array_length(p_ranks, 1), 0) = 0 or coalesce(q.rank, o.knowledge_rank::text) = any (p_ranks))
     and (coalesce(array_length(p_chapters, 1), 0) = 0 or q.chapter = any (p_chapters))
     and (coalesce(array_length(p_sections, 1), 0) = 0
          or (q.chapter || '|' || coalesce(q.section_label, '')) = any (p_sections));
$$;
revoke all on function public.count_questions(uuid, text, uuid[], text[], int[], text[]) from public, anon;
grant execute on function public.count_questions(uuid, text, uuid[], text[], int[], text[]) to authenticated;
