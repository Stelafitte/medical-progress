-- L'IMPORT DE LA BANQUE DE QUESTIONS — rejouable, en trois gestes (15/09).
--
-- Stef : « importer la banque presente sur mon disque, avec la possibilite de
-- supprimer la banque actuelle, de reimporter, ou de fusionner. Une solution
-- agile qui permette de tout modifier tout le temps. »
--
-- UNE RPC, QUATRE MODES, sur les questions d'un programme et d'une SOURCE :
--   dry_run  : ne touche rien, rend le rapport (apparie / non apparie / neuf /
--              a mettre a jour) — c'est la mesure promise le 13/09 ;
--   merge    : les questions dont external_ref existe sont MISES A JOUR
--              (enonce, options, chapitre…), les autres creees, le reste laisse ;
--   replace  : tout ce qui porte cette source est retire, puis tout est cree ;
--   delete   : tout ce qui porte cette source est retire, rien n'est cree.
--
-- « RETIRE » N'EST PAS TOUJOURS « SUPPRIME ». Une question a laquelle un
-- etudiant a deja repondu (question_attempts) est passee au statut `retiree`
-- — son historique reste lisible — ; une question sans aucune reponse est
-- supprimee pour de bon. Le rapport dit combien de chaque.
--
-- LES QUESTIONS SANS ACQUIS SONT ECARTEES, JAMAIS DEVINEES. `outcome_id` est
-- obligatoire (voir 20260914110000) ; une question dont le code `ECN-xxx-yy`
-- ne correspond a aucun acquis du programme est comptee et nommee dans le
-- rapport, pas inseree sous un acquis approximatif.
--
-- STATUT A L'IMPORT : `publiee` si p_publish, sinon `brouillon`. Le tri du
-- 14/09 a conclu qu'on publie avec avertissement et signalement plutot que
-- d'attendre une relecture medicale complete ; p_publish porte ce choix.

create or replace function public.import_question_items(
  p_program_id uuid,
  p_mode text,
  p_source text,
  p_items jsonb,
  p_publish boolean default true
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

  -- 1. Retirer, pour replace et delete -----------------------------------
  if p_mode in ('replace', 'delete') then
    -- Repondues : retirees, pas supprimees.
    update public.question_items q
       set status = 'retiree'
     where q.program_id = p_program_id and q.source = p_source
       and q.status <> 'retiree'
       and exists (select 1 from public.question_attempts a where a.question_id = q.id);
    get diagnostics n_retired = row_count;
    -- Jamais repondues : supprimees (les options suivent par cascade).
    delete from public.question_items q
     where q.program_id = p_program_id and q.source = p_source
       and not exists (select 1 from public.question_attempts a where a.question_id = q.id);
    get diagnostics n_deleted = row_count;
  end if;

  -- 2. Parcourir les questions ------------------------------------------
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

      -- merge : mise a jour si la reference existe ; replace : toujours neuf
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
  end if;

  return jsonb_build_object(
    'mode', p_mode,
    'source', p_source,
    'matched', n_matched,
    'unmatched', n_unmatched,
    'unmatched_codes', to_jsonb(v_unmatched_codes),
    'inserted', n_inserted,
    'updated', n_updated,
    'deleted', n_deleted,
    'retired', n_retired
  );
end;
$$;

revoke all on function public.import_question_items(uuid, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.import_question_items(uuid, text, text, jsonb, boolean)
  to authenticated;

-- Le rapprochement par reference exige qu'elle soit unique par source.
create unique index if not exists question_items_source_ref_unique
  on public.question_items (program_id, source, external_ref)
  where external_ref is not null;

-- Ce que l'ecran affiche avant d'importer : combien la banque compte, par
-- source et par statut. Lecture equipe (la policy select le garantit).
create or replace function public.question_bank_summary(p_program_id uuid)
returns table (source text, status text, questions bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select q.source, q.status, count(*)
    from public.question_items q
   where q.program_id = p_program_id
   group by q.source, q.status
   order by q.source, q.status;
$$;
grant execute on function public.question_bank_summary(uuid) to authenticated;
