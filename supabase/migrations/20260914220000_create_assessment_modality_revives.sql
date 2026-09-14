-- Creer une modalite dont le nom existe ARCHIVE la ressuscite (14/09, tard).
--
-- Mesure : cocher « Journal de stage » dans l'atelier -> « duplicate key value
-- violates unique constraint assessment_modalities_program_id_name_key ».
-- La ligne existait, archivee le jour meme ; l'ecran ne lit que les vivantes,
-- tente de creer, la cle unique (programme, nom) refuse.
--
-- Regle retenue : le nom est l'identite. Recreer un nom archive, c'est le
-- reprendre — meme identifiant, memes epreuves passees si elles reviennent un
-- jour — avec les caracteristiques demandees maintenant, et retenu au parcours.
create or replace function public.create_assessment_modality(
  p_program_id uuid,
  p_name text,
  p_mode text,
  p_subtype text,
  p_usage text,
  p_notes text default null
)
returns public.assessment_modalities
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created public.assessment_modalities;
  cleaned_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_archived_id uuid;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Droits insuffisants pour créer une modalité d''évaluation sur ce programme.';
  end if;

  select id into v_archived_id
    from public.assessment_modalities
   where program_id = p_program_id
     and lower(btrim(name)) = lower(btrim(p_name))
     and archived_at is not null
   limit 1;

  if v_archived_id is not null then
    update public.assessment_modalities
       set name        = btrim(p_name),
           mode        = p_mode,
           subtype     = p_subtype,
           usage       = p_usage,
           notes       = cleaned_notes,
           archived_at = null,
           retained_at = now()
     where id = v_archived_id
     returning * into created;
    return created;
  end if;

  insert into public.assessment_modalities (program_id, name, mode, subtype, usage, notes)
  values (p_program_id, btrim(p_name), p_mode, p_subtype, p_usage, cleaned_notes)
  returning * into created;

  return created;
end;
$$;
