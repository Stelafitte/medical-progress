-- 21/09 -- LE MODULE « STAGES » DEVIENT REGLABLE A L'ECRAN.
--
-- `programs.placements_enabled` existe depuis le 21/08 et conditionne l'onglet
-- « Mon carnet de stage » de l'etudiant, mais aucun ecran ne l'ecrivait :
-- l'ancien « Pilotage et parametrage » de la plateforme n'en montrait qu'un
-- interrupteur de maquette. Meme patron que `set_learner_plan_shifts` : un
-- booleen, une fonction, le garde `can_administer_program`, et une trace.
--
-- Les modules « audits de pratique » et « DPC » restent volontairement sans
-- ecran : leurs parcours sont encore des maquettes (decision de Stef, 21/09).

create or replace function public.set_program_placements_enabled(
  p_program_id uuid,
  p_enabled boolean
) returns public.programs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.programs;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  update public.programs
     set placements_enabled = coalesce(p_enabled, true)
   where id = p_program_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Programme introuvable.';
  end if;

  insert into public.audit_events (program_id, actor_person_id, event_type, entity_type, entity_id, detail)
  values (p_program_id, auth.uid(), 'program.placements_module', 'program', p_program_id,
          jsonb_build_object('enabled', v_row.placements_enabled));

  return v_row;
end;
$$;

revoke all on function public.set_program_placements_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_program_placements_enabled(uuid, boolean) to authenticated;
