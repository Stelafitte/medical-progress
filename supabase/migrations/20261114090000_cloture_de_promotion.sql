-- Cloturer une promotion : elle a fini son stage, elle ne doit plus gener celle
-- qui est en cours.
--
-- POURQUOI PAS L'ARCHIVAGE. `set_cohort_archived` cache une classe de toutes les
-- listes : c'est le bon geste pour une promotion creee par erreur, pas pour une
-- promotion qui a vecu. Une promotion cloturee reste CONSULTABLE (carnets,
-- resultats, export) ; elle cesse seulement d'etre proposee par defaut.
--
-- Le statut `completed` existe depuis la creation de `cohort_status`, mais rien
-- ne le posait jamais. On ne cree donc aucune colonne, aucun type : une seule
-- fonction, sur le modele exact de `set_cohort_archived` (une fonction pour les
-- deux sens, droits de `can_administer_program`, trace dans `audit_events`).
--
-- Rouvrir rend le statut `in_progress`. Une promotion cloturee par erreur
-- retrouve ainsi son etat d'avant, sans qu'on ait a memoriser lequel c'etait.
--
-- Cette fonction ne touche ni les inscriptions, ni les carnets, ni les jalons.

create function public.set_cohort_closed(
  p_cohort_id uuid,
  p_closed boolean
) returns public.cohorts
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.cohorts;
  v_after public.cohorts;
begin
  select * into v_before from public.cohorts where id = p_cohort_id;
  if v_before.id is null then
    raise exception 'Classe introuvable.';
  end if;
  if not public.can_administer_program(v_before.program_id) then
    raise exception 'Non autorisé à clôturer une classe de ce programme.';
  end if;
  if v_before.archived_at is not null then
    raise exception 'Cette classe est archivée : la désarchiver avant de la clôturer ou de la rouvrir.';
  end if;

  if p_closed and v_before.status = 'completed' then
    return v_before;
  end if;
  if not p_closed and v_before.status <> 'completed' then
    return v_before;
  end if;

  update public.cohorts
     set status     = case when p_closed then 'completed'::public.cohort_status
                           else 'in_progress'::public.cohort_status end,
         updated_at = now()
   where id = p_cohort_id
  returning * into v_after;

  insert into public.audit_events (program_id, actor_person_id, event_type, entity_type, entity_id, detail)
  values (
    v_after.program_id,
    auth.uid(),
    case when p_closed then 'cohort.closed' else 'cohort.reopened' end,
    'cohort',
    v_after.id,
    jsonb_build_object('label', v_after.label,
                       'statut_avant', v_before.status,
                       'statut_apres', v_after.status)
  );

  return v_after;
end;
$$;

revoke all on function public.set_cohort_closed(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_cohort_closed(uuid, boolean) to authenticated;
