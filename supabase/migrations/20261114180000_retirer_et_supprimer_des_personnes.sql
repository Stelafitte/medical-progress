-- Retirer ou supprimer des personnes d'un programme, une ou plusieurs a la fois.
--
-- DEUX GESTES, VOLONTAIREMENT DISTINCTS
--   * RETIRER (reversible) : la personne sort des listes actives et perd ses
--     droits dans CE programme, mais rien n'est efface. Ses inscriptions passent
--     a « withdrawn », ses droits sont REVOQUES (revoked_at), ses lignes de
--     vivier sont annulees, elle quitte les groupes d'encadrement. Les carnets
--     et l'historique restent. Reintegrer remet exactement ce qui a ete retire,
--     grace a la trace gardee dans audit_events.
--   * SUPPRIMER (definitif) : n'est accorde que si la personne n'a AUCUN
--     historique. Les cles etrangeres `on delete restrict` font le garde-fou :
--     si un carnet, une validation ou une reponse existe, la suppression est
--     refusee avec la raison « historique » et il faut retirer plutot.
--
-- GARDE-FOUS COMMUNS
--   * droits de `can_administer_program` sur le programme ;
--   * on ne s'agit jamais soi-meme ;
--   * un administrateur n'est jamais retire ni supprime en lot (on ne se prive
--     pas de la main sans le vouloir) ;
--   * un compte qui a aussi des droits ou une inscription dans UN AUTRE
--     programme n'est jamais supprime : seul son passage dans celui-ci est
--     retire.
--
-- Les identifiants recus peuvent etre ceux d'un compte (profiles.id) OU ceux
-- d'une ligne de vivier (people.id) : l'ecran melange les deux.

create function public.retirer_personnes(
  p_program_id uuid,
  p_person_ids uuid[],
  p_retirer boolean default true
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_profile uuid;
  v_people_id uuid;
  v_done int := 0;
  v_ignored jsonb := '[]'::jsonb;
  v_ra uuid[];
  v_enr jsonb;
  v_grp jsonb;
  v_last public.audit_events;
  v_row record;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Non autorisé à gérer les personnes de ce programme.';
  end if;

  foreach v_id in array coalesce(p_person_ids, '{}') loop
    v_profile := null;
    v_people_id := null;

    if exists (select 1 from public.profiles where id = v_id) then
      v_profile := v_id;
      select id into v_people_id from public.people
       where activated_profile_id = v_id and program_id = p_program_id limit 1;
    else
      select id, activated_profile_id into v_people_id, v_profile
        from public.people where id = v_id and program_id = p_program_id;
      if v_people_id is null then
        v_ignored := v_ignored || jsonb_build_object('id', v_id, 'raison', 'introuvable');
        continue;
      end if;
    end if;

    if v_profile is not null and v_profile = auth.uid() then
      v_ignored := v_ignored || jsonb_build_object('id', v_id, 'raison', 'vous-meme');
      continue;
    end if;

    if p_retirer then
      if v_profile is not null and exists (
        select 1 from public.role_assignments
         where person_id = v_profile and program_id = p_program_id
           and role = 'administrator' and revoked_at is null
      ) then
        v_ignored := v_ignored || jsonb_build_object('id', v_id, 'raison', 'administrateur');
        continue;
      end if;

      v_ra := '{}';
      v_enr := '[]'::jsonb;
      v_grp := '[]'::jsonb;

      if v_profile is not null then
        with r as (
          update public.role_assignments
             set revoked_at = now()
           where person_id = v_profile and program_id = p_program_id
             and revoked_at is null and scope_kind <> 'platform'
          returning id)
        select coalesce(array_agg(id), '{}') into v_ra from r;

        with e as (
          update public.enrollments
             set status = 'withdrawn', withdrawn_at = now(),
                 withdrawal_reason = 'Retiré par un administrateur', updated_at = now()
           where person_id = v_profile and program_id = p_program_id
             and status <> 'withdrawn'
          returning id)
        select coalesce(jsonb_agg(jsonb_build_object('id', e.id)), '[]'::jsonb) into v_enr from e;
        -- l'ancien statut est reconstruit a la reintegration (active par defaut)

        with g as (
          delete from public.supervision_group_supervisors s
           using public.supervision_groups sg
           where s.group_id = sg.id and sg.program_id = p_program_id
             and s.person_id = v_profile
          returning s.group_id)
        select coalesce(jsonb_agg(group_id), '[]'::jsonb) into v_grp from g;
      end if;

      if v_people_id is not null then
        update public.people
           set status = 'cancelled', cancelled_at = now(), updated_at = now()
         where id = v_people_id and status in ('pending', 'invited');
      end if;

      insert into public.audit_events (program_id, actor_person_id, event_type, entity_type, entity_id, detail)
      values (p_program_id, auth.uid(), 'person.removed', 'person', coalesce(v_profile, v_people_id),
        jsonb_build_object('profile_id', v_profile, 'people_id', v_people_id,
          'role_assignment_ids', to_jsonb(v_ra), 'enrollment_ids', v_enr, 'group_ids', v_grp));
      v_done := v_done + 1;
    else
      select * into v_last from public.audit_events
       where program_id = p_program_id and entity_type = 'person'
         and entity_id = coalesce(v_profile, v_people_id)
         and event_type in ('person.removed', 'person.reinstated')
       order by occurred_at desc limit 1;

      if v_last.id is null or v_last.event_type <> 'person.removed' then
        v_ignored := v_ignored || jsonb_build_object('id', v_id, 'raison', 'rien-a-reintegrer');
        continue;
      end if;

      begin
        update public.role_assignments set revoked_at = null
         where id in (select (x)::uuid from jsonb_array_elements_text(v_last.detail->'role_assignment_ids') x);
        update public.enrollments
           set status = 'active', withdrawn_at = null, withdrawal_reason = null, updated_at = now()
         where id in (select (x->>'id')::uuid from jsonb_array_elements(v_last.detail->'enrollment_ids') x);
        for v_row in select (x)::uuid as gid from jsonb_array_elements_text(v_last.detail->'group_ids') x loop
          insert into public.supervision_group_supervisors (group_id, person_id)
          values (v_row.gid, v_profile) on conflict do nothing;
        end loop;
        if v_people_id is not null then
          update public.people
             set status = case when activated_profile_id is not null then 'activated'
                               when invited_at is not null then 'invited' else 'pending' end,
                 cancelled_at = null, updated_at = now()
           where id = v_people_id and status = 'cancelled';
        end if;
      exception when unique_violation then
        v_ignored := v_ignored || jsonb_build_object('id', v_id, 'raison', 'droit-deja-reattribue');
        continue;
      end;

      insert into public.audit_events (program_id, actor_person_id, event_type, entity_type, entity_id, detail)
      values (p_program_id, auth.uid(), 'person.reinstated', 'person', coalesce(v_profile, v_people_id),
        jsonb_build_object('profile_id', v_profile, 'people_id', v_people_id));
      v_done := v_done + 1;
    end if;
  end loop;

  return jsonb_build_object('traites', v_done, 'ignores', v_ignored);
end;
$$;

create function public.supprimer_personnes(
  p_program_id uuid,
  p_person_ids uuid[]
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_profile uuid;
  v_people_id uuid;
  v_done int := 0;
  v_ignored jsonb := '[]'::jsonb;
  v_nom text;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Non autorisé à gérer les personnes de ce programme.';
  end if;

  foreach v_id in array coalesce(p_person_ids, '{}') loop
    v_profile := null;
    v_people_id := null;

    if exists (select 1 from public.profiles where id = v_id) then
      v_profile := v_id;
      select id into v_people_id from public.people
       where activated_profile_id = v_id and program_id = p_program_id limit 1;
    else
      select id, activated_profile_id into v_people_id, v_profile
        from public.people where id = v_id and program_id = p_program_id;
      if v_people_id is null then
        v_ignored := v_ignored || jsonb_build_object('id', v_id, 'raison', 'introuvable');
        continue;
      end if;
    end if;

    if v_profile is not null then
      if v_profile = auth.uid() then
        v_ignored := v_ignored || jsonb_build_object('id', v_id, 'raison', 'vous-meme');
        continue;
      end if;
      if exists (select 1 from public.role_assignments
                  where person_id = v_profile and role = 'administrator' and revoked_at is null) then
        v_ignored := v_ignored || jsonb_build_object('id', v_id, 'raison', 'administrateur');
        continue;
      end if;
      if exists (select 1 from public.role_assignments
                  where person_id = v_profile and program_id <> p_program_id)
         or exists (select 1 from public.enrollments
                     where person_id = v_profile and program_id <> p_program_id) then
        v_ignored := v_ignored || jsonb_build_object('id', v_id, 'raison', 'autre-programme');
        continue;
      end if;

      select full_name into v_nom from public.profiles where id = v_profile;
      begin
        delete from public.supervision_group_supervisors where person_id = v_profile;
        delete from public.role_assignments where person_id = v_profile;
        delete from public.enrollments where person_id = v_profile;
        if v_people_id is not null then
          delete from public.people where id = v_people_id;
        end if;
        delete from auth.users where id = v_profile;
      exception when foreign_key_violation then
        v_ignored := v_ignored || jsonb_build_object('id', v_id, 'raison', 'historique');
        continue;
      end;
    else
      if exists (select 1 from public.people where id = v_people_id and status = 'activated') then
        v_ignored := v_ignored || jsonb_build_object('id', v_id, 'raison', 'historique');
        continue;
      end if;
      select btrim(first_name || ' ' || last_name) into v_nom from public.people where id = v_people_id;
      begin
        delete from public.people where id = v_people_id;
      exception when foreign_key_violation then
        v_ignored := v_ignored || jsonb_build_object('id', v_id, 'raison', 'historique');
        continue;
      end;
    end if;

    insert into public.audit_events (program_id, actor_person_id, event_type, entity_type, entity_id, detail)
    values (p_program_id, auth.uid(), 'person.deleted', 'person', null,
      jsonb_build_object('nom', v_nom));
    v_done := v_done + 1;
  end loop;

  return jsonb_build_object('traites', v_done, 'ignores', v_ignored);
end;
$$;

revoke all on function public.retirer_personnes(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.retirer_personnes(uuid, uuid[], boolean) to authenticated;
revoke all on function public.supprimer_personnes(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.supprimer_personnes(uuid, uuid[]) to authenticated;
