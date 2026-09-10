-- L ETUDIANT CHOISIT SON GROUPE, ET ON GARDE L HISTOIRE.
--
-- DEMANDE DE STEF, 10/09 : les etudiants savent entre eux qui est dans quelle
-- moitie ; l administration, non. C est donc a eux de le renseigner. Et un
-- etudiant doit pouvoir changer de groupe EN COURS DE STAGE, parce que les
-- echanges arrivent.
--
-- ⚠️ POURQUOI UN JOURNAL, ET PAS SEULEMENT LE GROUPE COURANT. Le groupe dit
-- quelles semaines on attendait l etudiant dans le service. Si l on ne garde
-- que son groupe ACTUEL, changer de groupe REECRIT LE PASSE : une semaine
-- manquee dans l ancien groupe disparait, et une semaine off devient une
-- semaine manquee. Le journal rend chaque semaine relisible avec le groupe qui
-- valait CETTE semaine-la. C est ce qui permet d autoriser le changement sans
-- rien geler.
--
-- LE JOURNAL SURVIT A LA SUPPRESSION DU GROUPE : ses colonnes ne portent donc
-- PAS de cle etrangere cascadee, et il conserve le libelle du groupe tel qu il
-- etait. Une histoire qu une suppression efface n est pas une histoire.

/* ================================================================== */
/* 1. Le journal                                                       */
/* ================================================================== */

create table public.supervision_group_membership_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  group_id uuid not null,
  group_label text not null default '',
  action text not null check (action in ('joined', 'left')),
  occurred_at timestamptz not null default now(),
  actor_person_id uuid references public.profiles (id) on delete set null
);

create index supervision_group_membership_events_idx
  on public.supervision_group_membership_events (enrollment_id, occurred_at);

alter table public.supervision_group_membership_events enable row level security;
revoke all on public.supervision_group_membership_events from public, anon, authenticated;
grant select on public.supervision_group_membership_events to authenticated;

-- Lisible par qui peut deja lire le carnet de cet etudiant : l encadrant de
-- ses groupes et l administration. Et par l etudiant lui-meme, qui doit
-- pouvoir verifier ce qu on lui attribue.
create policy supervision_group_membership_events_select
on public.supervision_group_membership_events
for select to authenticated
using (
  public.owns_enrollment(enrollment_id)
  or public.supervises_enrollment(enrollment_id)
);

/* ================================================================== */
/* 2. Le journal s ecrit tout seul                                     */
/* ================================================================== */

create function public.journal_supervision_group_membership()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
  v_enrollment_id uuid;
  v_action text;
  v_label text;
begin
  if tg_op = 'INSERT' then
    v_group_id := new.group_id;
    v_enrollment_id := new.enrollment_id;
    v_action := 'joined';
  else
    v_group_id := old.group_id;
    v_enrollment_id := old.enrollment_id;
    v_action := 'left';
  end if;

  select g.label into v_label from public.supervision_groups g where g.id = v_group_id;

  insert into public.supervision_group_membership_events
    (enrollment_id, group_id, group_label, action, actor_person_id)
  values (v_enrollment_id, v_group_id, coalesce(v_label, ''), v_action, auth.uid());

  return null;
end;
$$;

create trigger supervision_group_members_journal
after insert or delete on public.supervision_group_members
for each row execute function public.journal_supervision_group_membership();

/* ================================================================== */
/* 3. La composition d un groupe se modifie PAR DIFFERENCE             */
/* ================================================================== */

-- ⚠️ L ANCIENNE VERSION VIDAIT LE GROUPE PUIS LE REMPLISSAIT. Innocent tant
-- que rien ne pendait a ces lignes ; avec le journal ci-dessus, chaque
-- enregistrement aurait ecrit que TOUTE la promotion a quitte le groupe puis
-- l a rejoint. On ne touche donc plus qu aux lignes qui changent vraiment --
-- ce qui est de toute facon ce que le nom de la fonction promettait.
create or replace function public.set_group_members(
  p_group_id uuid,
  p_enrollment_ids uuid[]
) returns setof public.supervision_group_members
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_cohort_id uuid;
  v_foreign integer;
  v_voulus uuid[] := coalesce(p_enrollment_ids, '{}'::uuid[]);
begin
  select g.program_id, g.cohort_id into v_program_id, v_cohort_id
  from public.supervision_groups g where g.id = p_group_id;

  if v_program_id is null then
    raise exception 'Groupe introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  -- Un groupe encadre les etudiants de SA cohorte : melanger deux promos
  -- casserait le retroplanning, qui est ancre sur la cohorte.
  select count(*) into v_foreign
  from public.enrollments e
  where e.id = any (v_voulus)
    and e.cohort_id is distinct from v_cohort_id;

  if v_foreign > 0 then
    raise exception 'Un groupe ne peut contenir que des etudiants de sa propre cohorte.';
  end if;

  delete from public.supervision_group_members m
   where m.group_id = p_group_id
     and not (m.enrollment_id = any (v_voulus));

  insert into public.supervision_group_members (group_id, enrollment_id)
  select p_group_id, id from unnest(v_voulus) as t(id)
  on conflict (group_id, enrollment_id) do nothing;

  return query
    select * from public.supervision_group_members m where m.group_id = p_group_id;
end;
$$;

/* ================================================================== */
/* 4. L etudiant rejoint un groupe                                     */
/* ================================================================== */

-- IL NE PEUT SE PLACER QUE LUI-MEME, et seulement dans un groupe de SA
-- promotion : la fonction retrouve son inscription depuis `auth.uid()`, elle
-- n accepte aucun identifiant d etudiant en argument. Il n y a donc pas de
-- geste a detourner.
--
-- UN SEUL GROUPE A LA FOIS : rejoindre l un quitte les autres groupes de la
-- meme promotion. Etre dans les deux moities n a pas de sens -- le calendrier
-- ne saurait plus quelle semaine etait attendue.
create function public.join_supervision_group(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cohort_id uuid;
  v_program_id uuid;
  v_placement_id uuid;
  v_enrollment_id uuid;
  v_starts date;
  v_ends date;
begin
  select g.cohort_id, g.program_id, g.placement_id
    into v_cohort_id, v_program_id, v_placement_id
  from public.supervision_groups g where g.id = p_group_id;

  if v_cohort_id is null then
    raise exception 'Groupe introuvable.';
  end if;

  select e.id into v_enrollment_id
  from public.enrollments e
  where e.cohort_id = v_cohort_id
    and e.person_id = auth.uid()
    and e.status in ('active', 'completed')
  limit 1;

  if v_enrollment_id is null then
    raise exception 'Vous n''etes pas inscrit dans la promotion de ce groupe.';
  end if;

  delete from public.supervision_group_members m
   using public.supervision_groups g
   where m.group_id = g.id
     and g.cohort_id = v_cohort_id
     and m.enrollment_id = v_enrollment_id
     and m.group_id <> p_group_id;

  insert into public.supervision_group_members (group_id, enrollment_id)
  values (p_group_id, v_enrollment_id)
  on conflict (group_id, enrollment_id) do nothing;

  -- LE CARNET SUIT L INSCRIPTION ET LE TERRAIN, PAS LE GROUPE
  -- (`unique (enrollment_id, placement_id)`) : changer de groupe ne fait donc
  -- perdre ni le carnet ni les journees deja ecrites. On l ouvre seulement
  -- s il n existe pas encore, parce que l etudiant ne peut pas appeler
  -- `open_stage_logs_for_group`, reservee a l administration.
  select c.starts_on, c.ends_on into v_starts, v_ends
  from public.cohorts c where c.id = v_cohort_id;

  insert into public.stage_logs
    (program_id, cohort_id, enrollment_id, placement_id, period_starts_on, period_ends_on)
  values (v_program_id, v_cohort_id, v_enrollment_id, v_placement_id, v_starts, v_ends)
  on conflict (enrollment_id, placement_id) do nothing;

  return v_enrollment_id;
end;
$$;

revoke all on function public.join_supervision_group(uuid) from public, anon;
grant execute on function public.join_supervision_group(uuid) to authenticated;
