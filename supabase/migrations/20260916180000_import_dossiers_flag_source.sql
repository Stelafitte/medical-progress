-- L'IMPORT D'UN DOSSIER ECRIT AUSSI LA SOURCE D'UN DRAPEAU (16/09).
--
-- MESURE. L'import du lot 1 (21 mini-DP, 111 etapes, 636 propositions) a ete
-- refuse en bloc :
--   new row for relation "question_options" violates check constraint
--   "question_options_flag_documented"
-- UNE SEULE proposition du lot porte un drapeau (« inacceptable », dossier
-- MDP-19, retour a domicile sur sPESI a 0) -- et elle porte bien sa source,
-- deux lignes de referentiel. Mais `import_question_cases` inserait `flag`
-- SANS `flag_source` : la contrainte, qui interdit un drapeau non documente,
-- faisait tomber tout le lot.
--
-- CORRECTION. La source voyage avec le drapeau. Et si un lot arrive un jour
-- avec un drapeau sans source, c'est le DRAPEAU qui est laisse de cote, pas le
-- lot : la proposition et son explication entrent quand meme. Un drapeau non
-- documente n'a pas sa place en base -- c'est ce que dit la contrainte -- mais
-- il ne doit pas coûter 636 propositions.
--
-- Rien d'autre ne change : meme signature, meme corps.

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
          -- Le drapeau ne vit qu'avec sa source : la contrainte
          -- question_options_flag_documented l'exige, et c'est elle qui refusait
          -- tout le lot 1 pour UNE option sur 636 (16/09). Un drapeau sans source
          -- est laisse de cote ; la proposition et son explication, elles, entrent.
          insert into public.question_options
            (question_id, position, letter, body, correct, explanation, flag, flag_source)
          values (v_question_id, v_pos, upper(v_opt->>'letter'), v_opt->>'body',
                  coalesce((v_opt->>'correct')::boolean, false), nullif(v_opt->>'explanation', ''),
                  case when nullif(btrim(coalesce(v_opt->>'flag_source', '')), '') is null
                       then null else nullif(v_opt->>'flag', '') end,
                  nullif(btrim(coalesce(v_opt->>'flag_source', '')), ''));
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

