-- Rattacher des encadrants à un groupe d'encadrement, tout de suite.
-- Additif : ajoute UNE fonction, ne touche à aucune donnée existante.
--
-- Pourquoi : `supervision_group_supervisors.person_id` référence `profiles`.
-- Une personne qui a déjà un compte (même retirée plus tôt) peut donc être
-- rattachée immédiatement ; l'automatisme d'activation ne couvre que ceux qui
-- portent un terrain prévu. Les identifiants reçus peuvent être des profils OU
-- des lignes du vivier (people.id) ; sans compte, la ligne est ignorée avec la
-- raison « pas-de-compte » (il reste à inviter la personne).
create or replace function public.rattacher_encadrants_groupe(
  p_program_id uuid,
  p_person_ids uuid[],
  p_group_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_profile uuid;
  v_group public.supervision_groups;
  v_done int := 0;
  v_ignored jsonb := '[]'::jsonb;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Non autorisé à gérer les personnes de ce programme.';
  end if;

  select * into v_group from public.supervision_groups
   where id = p_group_id and program_id = p_program_id;
  if not found then
    raise exception 'Groupe d''encadrement introuvable dans ce programme.';
  end if;

  foreach v_id in array coalesce(p_person_ids, '{}') loop
    v_profile := null;
    if exists (select 1 from public.profiles where id = v_id) then
      v_profile := v_id;
    else
      select activated_profile_id into v_profile from public.people
       where id = v_id and program_id = p_program_id;
    end if;

    if v_profile is null then
      v_ignored := v_ignored || jsonb_build_object('id', v_id,
        'raison', case when exists (select 1 from public.people where id = v_id)
                       then 'pas-de-compte' else 'introuvable' end);
      continue;
    end if;

    -- Le droit passe par le terrain du groupe : rôle actif s'il n'existe pas.
    if not exists (
      select 1 from public.role_assignments
       where person_id = v_profile and role = 'placement_supervisor'
         and scope_kind = 'placement' and scope_id = v_group.placement_id
         and revoked_at is null
    ) then
      insert into public.role_assignments (person_id, role, scope_kind, scope_id, program_id, granted_by)
      values (v_profile, 'placement_supervisor', 'placement', v_group.placement_id, p_program_id, auth.uid());
    end if;

    insert into public.supervision_group_supervisors (group_id, person_id)
    values (p_group_id, v_profile)
    on conflict do nothing;

    insert into public.audit_events (program_id, actor_person_id, event_type, entity_type, entity_id, detail)
    values (p_program_id, auth.uid(), 'person.attached', 'person', v_profile,
      jsonb_build_object('group_id', p_group_id, 'placement_id', v_group.placement_id));
    v_done := v_done + 1;
  end loop;

  return jsonb_build_object('traites', v_done, 'ignores', v_ignored);
end;
$$;

revoke all on function public.rattacher_encadrants_groupe(uuid, uuid[], uuid) from public, anon;
grant execute on function public.rattacher_encadrants_groupe(uuid, uuid[], uuid) to authenticated;
