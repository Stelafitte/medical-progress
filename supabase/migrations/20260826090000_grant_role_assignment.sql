-- RECONSTRUCTION (30/08/2026) : fonction existante en base sans fichier de
-- migration (chantier "Accorder un droit", PR #14). Definition reelle relue en
-- base, sans modification de comportement.
--
-- Attribution d'un role a une personne, avec motif obligatoire et trace
-- d'audit. Autorisation verifiee cote serveur : administrateur de plateforme,
-- ou administrateur du programme pour un role non plateforme.

create or replace function public.grant_role_assignment(
  p_person_id uuid,
  p_role role_name,
  p_scope_kind role_scope_kind,
  p_scope_id uuid,
  p_program_id uuid,
  p_justification text
) returns public.role_assignments
language plpgsql security definer
set search_path to 'public', 'pg_temp' as $function$
declare
  v_row public.role_assignments;
begin
  if p_person_id = auth.uid() then
    raise exception 'Impossible de s''accorder un role a soi-meme.';
  end if;

  if p_justification is null or length(trim(p_justification)) = 0 then
    raise exception 'Le motif de l''attribution est obligatoire.';
  end if;

  if not (
    public.is_platform_admin()
    or (
      p_scope_kind <> 'platform'
      and p_program_id is not null
      and public.can_administer_program(p_program_id)
    )
  ) then
    raise exception 'Droits insuffisants pour accorder ce role.';
  end if;

  insert into public.role_assignments (person_id, role, scope_kind, scope_id, program_id, granted_by)
  values (p_person_id, p_role, p_scope_kind, p_scope_id, p_program_id, auth.uid())
  returning * into v_row;

  insert into public.audit_events (actor_person_id, event_type, entity_type, entity_id, program_id, detail)
  values (
    auth.uid(), 'role_assignment.granted', 'role_assignment', v_row.id, p_program_id,
    jsonb_build_object(
      'person_id', p_person_id, 'role', p_role, 'scope_kind', p_scope_kind,
      'scope_id', p_scope_id, 'justification', p_justification
    )
  );

  return v_row;
end;
$function$;

revoke all on function public.grant_role_assignment(uuid, role_name, role_scope_kind, uuid, uuid, text)
from public, anon;
grant execute on function public.grant_role_assignment(uuid, role_name, role_scope_kind, uuid, uuid, text)
to authenticated;
