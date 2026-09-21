-- 21/09 -- LE JOURNAL D'AUDIT DEVIENT LISIBLE.
--
-- `audit_events` est alimentee depuis le 26/08 (attribution de droits, classes,
-- versions de referentiel, acquis) mais n'a AUCUNE politique de lecture : l'ecran
-- « Administration et securite » affichait donc des traces de demonstration.
--
-- On ouvre la lecture par UNE fonction, pas par une politique : elle borne le
-- perimetre (un programme que l'on administre, ou toute la plateforme pour son
-- administrateur), joint le nom de l'auteur, et ecarte `course_opened`, qui est
-- un compteur de couts (une ligne par ouverture de cours), pas une decision.

create or replace function public.list_audit_events(
  p_program_id uuid default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  program_id uuid,
  actor_person_id uuid,
  actor_name text,
  event_type text,
  entity_type text,
  entity_id uuid,
  detail jsonb,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_program_id is null then
    if not public.is_platform_admin() then
      raise exception 'journal reserve a l administration de la plateforme' using errcode = '42501';
    end if;
  elsif not public.can_administer_program(p_program_id) then
    raise exception 'journal reserve aux administrateurs du programme' using errcode = '42501';
  end if;

  return query
    select a.id, a.program_id, a.actor_person_id, p.full_name, a.event_type,
           a.entity_type, a.entity_id, a.detail, a.occurred_at
      from public.audit_events a
      left join public.profiles p on p.id = a.actor_person_id
     where (p_program_id is null or a.program_id = p_program_id)
       and a.event_type <> 'course_opened'
     order by a.occurred_at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.list_audit_events(uuid, integer) from public, anon;
grant execute on function public.list_audit_events(uuid, integer) to authenticated;
