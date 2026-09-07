-- Ouvrir les carnets de stage d'un groupe d'encadrement.
--
-- Decision de Stef (07/09) : le carnet existe DES la constitution du groupe,
-- pas a la premiere journee saisie. `save_stage_log_day` sait deja creer le
-- carnet au vol, mais un etudiant qui n'a rien ecrit resterait alors invisible
-- pour son encadrant -- qui ne pourrait donc pas le relancer. Le carnet vide
-- est precisement l'information utile.
--
-- Idempotente : rejouable sans effet de bord, y compris apres l'arrivee de
-- nouveaux inscrits dans le groupe.

create function public.open_stage_logs_for_group(p_group_id uuid)
returns setof public.stage_logs
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_cohort_id uuid;
  v_placement_id uuid;
  v_starts date;
  v_ends date;
begin
  select g.program_id, g.cohort_id, g.placement_id
    into v_program_id, v_cohort_id, v_placement_id
  from public.supervision_groups g
  where g.id = p_group_id;

  if v_program_id is null then
    raise exception 'Groupe introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  -- La periode du carnet est celle de la cohorte : c'est elle qui ancre les
  -- semaines de stage, comme pour le retroplanning.
  select c.starts_on, c.ends_on into v_starts, v_ends
  from public.cohorts c
  where c.id = v_cohort_id;

  return query
  insert into public.stage_logs
    (program_id, cohort_id, enrollment_id, placement_id, period_starts_on, period_ends_on)
  select v_program_id, v_cohort_id, m.enrollment_id, v_placement_id, v_starts, v_ends
  from public.supervision_group_members m
  where m.group_id = p_group_id
  on conflict (enrollment_id, placement_id) do update
    set updated_at = now()
  returning *;
end;
$$;

revoke all on function public.open_stage_logs_for_group(uuid) from public, anon, authenticated;
grant execute on function public.open_stage_logs_for_group(uuid) to authenticated;
