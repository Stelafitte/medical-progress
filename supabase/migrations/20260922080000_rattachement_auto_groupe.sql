-- 22/09 -- UN INSCRIT ARRIVE DANS SON GROUPE D'ENCADREMENT, TOUT SEUL.
--
-- CONSTAT (Stef, compte test du 22/09 : « Suivi de stage : aucun terrain,
-- aucun groupe… alors que tout a ete fait »). La promotion « centurie A » a son
-- groupe d'encadrement (terrain UMCV, un encadrant), cree par le Concepteur le
-- jour de l'association. Mais a ce moment-la, les etudiants n'etaient pas
-- encore inscrits : une inscription ne nait qu'a l'activation du compte. Le
-- groupe a donc ete cree VIDE, et les 18 inscrits arrives ensuite n'y sont
-- jamais entres : ni groupe, ni encadrants, ni carnet de stage.
--
-- LA REGLE. Quand une inscription active arrive dans une promotion qui a UN
-- SEUL groupe d'encadrement, elle y entre, et son carnet s'ouvre sur le terrain
-- du groupe, pour la periode de la promotion. S'il y a plusieurs groupes
-- (promotion scindee), on ne devine pas : le responsable choisit, comme avant.
-- Une inscription deja rattachee n'est jamais deplacee.

create or replace function public.rattacher_au_groupe_unique()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group public.supervision_groups;
  v_nb integer;
  v_starts date;
  v_ends date;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if exists (select 1 from public.supervision_group_members m where m.enrollment_id = new.id) then
    return new;
  end if;

  select count(*) into v_nb from public.supervision_groups g where g.cohort_id = new.cohort_id;
  if v_nb <> 1 then
    return new;
  end if;
  select * into v_group from public.supervision_groups g where g.cohort_id = new.cohort_id;

  insert into public.supervision_group_members (group_id, enrollment_id)
  values (v_group.id, new.id)
  on conflict do nothing;

  select c.starts_on, c.ends_on into v_starts, v_ends
  from public.cohorts c where c.id = new.cohort_id;

  insert into public.stage_logs
    (program_id, cohort_id, enrollment_id, placement_id, period_starts_on, period_ends_on)
  values (v_group.program_id, v_group.cohort_id, new.id, v_group.placement_id, v_starts, v_ends)
  on conflict (enrollment_id, placement_id) do nothing;

  return new;
end;
$$;

revoke all on function public.rattacher_au_groupe_unique() from public, anon, authenticated;

drop trigger if exists enrollments_rattacher_groupe on public.enrollments;
create trigger enrollments_rattacher_groupe
after insert or update of status, cohort_id on public.enrollments
for each row execute function public.rattacher_au_groupe_unique();

-- RATTRAPAGE : les inscrits actifs deja presents, sans groupe, dans une
-- promotion a groupe unique (centurie A le 22/09 : 18 inscrits).
update public.enrollments e
   set status = e.status
 where e.status = 'active'
   and not exists (select 1 from public.supervision_group_members m where m.enrollment_id = e.id)
   and (select count(*) from public.supervision_groups g where g.cohort_id = e.cohort_id) = 1;
