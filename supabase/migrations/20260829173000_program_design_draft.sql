-- Brouillon du "Concepteur de programme" : permet de sauvegarder l'état en
-- cours de conception d'un programme (modèle choisi, objectifs, ressources
-- retenues, planning) avant sa finalisation et son passage au pilotage.

alter table public.programs
  add column design_draft jsonb;

create or replace function public.save_program_design_draft(
  p_program_id uuid,
  p_draft jsonb
) returns public.programs
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  updated public.programs;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  update public.programs
  set design_draft = p_draft
  where id = p_program_id
  returning * into updated;

  if updated.id is null then
    raise exception 'Programme introuvable.';
  end if;

  return updated;
end;
$$;

revoke all on function public.save_program_design_draft(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.save_program_design_draft(uuid, jsonb)
to authenticated;
