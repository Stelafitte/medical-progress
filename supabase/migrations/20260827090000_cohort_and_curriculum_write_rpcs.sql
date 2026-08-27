-- Campus Santé Augmenté — écriture réelle des classes (cohorts) et versions
-- de curriculum, jusqu'ici lecture seule pour `authenticated` (voir GRANT
-- dans 20260821092000_rls_and_private_storage.sql). Même famille que
-- `grant_role_assignment` (PR #14) : vérification d'autorisation et
-- journalisation d'audit atomiques côté serveur, aucune écriture directe
-- possible depuis le client.

create or replace function public.create_curriculum_version(
  p_program_id uuid,
  p_label text,
  p_effective_from date
)
returns public.curriculum_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version public.curriculum_versions;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Non autorisé à créer une version de curriculum pour ce programme.';
  end if;

  insert into public.curriculum_versions (program_id, label, effective_from)
  values (p_program_id, p_label, p_effective_from)
  returning * into v_version;

  insert into public.audit_events (program_id, actor_person_id, event_type, entity_type, entity_id, detail)
  values (
    p_program_id,
    auth.uid(),
    'curriculum_version.created',
    'curriculum_version',
    v_version.id,
    jsonb_build_object('label', v_version.label)
  );

  return v_version;
end;
$$;

revoke all on function public.create_curriculum_version(uuid, text, date) from public, anon;
grant execute on function public.create_curriculum_version(uuid, text, date) to authenticated;

create or replace function public.create_cohort(
  p_program_id uuid,
  p_curriculum_version_id uuid,
  p_label text,
  p_academic_year text,
  p_starts_on date,
  p_ends_on date
)
returns public.cohorts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cohort public.cohorts;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Non autorisé à créer une classe pour ce programme.';
  end if;

  insert into public.cohorts (program_id, curriculum_version_id, label, academic_year, starts_on, ends_on)
  values (p_program_id, p_curriculum_version_id, p_label, p_academic_year, p_starts_on, p_ends_on)
  returning * into v_cohort;

  insert into public.audit_events (program_id, actor_person_id, event_type, entity_type, entity_id, detail)
  values (
    p_program_id,
    auth.uid(),
    'cohort.created',
    'cohort',
    v_cohort.id,
    jsonb_build_object('label', v_cohort.label, 'academic_year', v_cohort.academic_year)
  );

  return v_cohort;
end;
$$;

revoke all on function public.create_cohort(uuid, uuid, text, text, date, date) from public, anon;
grant execute on function public.create_cohort(uuid, uuid, text, text, date, date) to authenticated;
