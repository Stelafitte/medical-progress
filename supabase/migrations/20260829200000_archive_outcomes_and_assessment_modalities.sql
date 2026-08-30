-- Archivage réversible des connaissances/compétences (outcomes) et des
-- modalités d'évaluation.
--
-- Contexte : dans le Concepteur de programme, l'analyse IA du référentiel
-- peut être relancée plusieurs fois (nouvel import de fichier, texte des
-- objectifs enrichi). Le concepteur doit pouvoir retirer un élément déjà
-- associé au programme sans le supprimer définitivement : archivage,
-- récupérable, plutôt que suppression.
--
-- Un élément archivé n'apparaît plus dans les listes actives
-- (listOutcomes / listAssessmentModalities filtrent sur archived_at is
-- null), mais reste en base — aucune perte des preuves (Evidence) déjà
-- rattachées à un outcome archivé.

alter table public.outcomes
  add column if not exists archived_at timestamptz;

alter table public.assessment_modalities
  add column if not exists archived_at timestamptz;

-- ------------------------------------------------------------------
-- outcomes
-- ------------------------------------------------------------------

create or replace function public.archive_outcome(p_outcome_id uuid)
returns public.outcomes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_row public.outcomes;
begin
  select program_id into v_program_id from public.outcomes where id = p_outcome_id;
  if v_program_id is null then
    raise exception 'Connaissance/compétence introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  update public.outcomes
    set archived_at = now()
    where id = p_outcome_id
    returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.unarchive_outcome(p_outcome_id uuid)
returns public.outcomes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_row public.outcomes;
begin
  select program_id into v_program_id from public.outcomes where id = p_outcome_id;
  if v_program_id is null then
    raise exception 'Connaissance/compétence introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  update public.outcomes
    set archived_at = null
    where id = p_outcome_id
    returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.archive_outcome(uuid) from public, anon;
revoke all on function public.unarchive_outcome(uuid) from public, anon;
grant execute on function public.archive_outcome(uuid) to authenticated;
grant execute on function public.unarchive_outcome(uuid) to authenticated;

-- ------------------------------------------------------------------
-- assessment_modalities
-- ------------------------------------------------------------------

create or replace function public.archive_assessment_modality(p_modality_id uuid)
returns public.assessment_modalities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_row public.assessment_modalities;
begin
  select program_id into v_program_id from public.assessment_modalities where id = p_modality_id;
  if v_program_id is null then
    raise exception 'Modalité d''évaluation introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  update public.assessment_modalities
    set archived_at = now()
    where id = p_modality_id
    returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.unarchive_assessment_modality(p_modality_id uuid)
returns public.assessment_modalities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_row public.assessment_modalities;
begin
  select program_id into v_program_id from public.assessment_modalities where id = p_modality_id;
  if v_program_id is null then
    raise exception 'Modalité d''évaluation introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  update public.assessment_modalities
    set archived_at = null
    where id = p_modality_id
    returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.archive_assessment_modality(uuid) from public, anon;
revoke all on function public.unarchive_assessment_modality(uuid) from public, anon;
grant execute on function public.archive_assessment_modality(uuid) to authenticated;
grant execute on function public.unarchive_assessment_modality(uuid) to authenticated;
