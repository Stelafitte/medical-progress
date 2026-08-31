-- Carnet de stage virtuel : presence, recit de la journee, validation par bloc.
--
-- Ajout au perimetre V1 demande par Stef le 31/08, activable programme par
-- programme depuis le Concepteur -- l'interrupteur existe deja :
-- programs.placements_enabled, sur lequel l'ecran Stage est deja conditionne.
--
-- Le modele de domaine existe deja et fait autorite : src/domain/stageLog.ts.
-- Cette migration lui donne un stockage, elle n'invente pas un second modele.
-- Ses trois regles non negociables restent entieres :
--   * la photo est un fragment explicitement autorise, jamais un document entier ;
--   * aucune acquisition n'est JAMAIS derivee d'une photo ;
--   * aucun champ patient nominatif n'existe dans le modele.
-- La V1 ne construit pas les photos : la politique est stockee, rien de plus.

/* ================================================================== */
/* 1. Le terrain de stage                                             */
/* ================================================================== */

-- Une seule ligne pour la V1 : le service de Stef. La table existe surtout
-- pour rendre le role placement_supervisor LEGAL -- la contrainte
-- placement_supervisor_scope (20260821090000) exige une portee 'placement',
-- et sans terrain aucun encadrant ne pouvait etre cree en base.
-- Les cinq autres services de cardiologie du CHU sont hors perimetre ; la
-- table les accueillera sans changement le jour venu.
create table public.placements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  site text not null default '',
  department text not null default '',
  capacity integer not null default 0 check (capacity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, name),
  unique (id, program_id)
);

create index placements_program_idx on public.placements (program_id);

alter table public.placements enable row level security;
revoke all on public.placements from public, anon, authenticated;
grant select on public.placements to authenticated;

create policy placements_select on public.placements
for select to authenticated
using (
  public.is_program_staff(program_id)
  or public.is_enrolled_in_program(program_id)
);

/* ================================================================== */
/* 2. Les groupes d'encadrement                                       */
/* ================================================================== */

-- Le terrain reel (Stef, 31/08) : UN service, plusieurs encadrants, et des
-- groupes d'etudiants a l'interieur. Un encadrant peut suivre plusieurs
-- groupes ; un groupe peut avoir plusieurs encadrants.
--
-- Le groupe appartient a une COHORTE : chez Stef une cohorte est la promo qui
-- arrive pour 12 semaines, quatre fois par an. C'est la meme cohorte que celle
-- qui ancre le retroplanning (20260831091000).
--
-- Principe : le ROLE dit ce qu'un senior a le droit de faire, le GROUPE dit
-- sur quels etudiants. Separer les deux evite de toucher a l'enumeration
-- role_scope_kind et a ses contraintes, qui sont du socle.
create table public.supervision_groups (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null,
  program_id uuid not null,
  placement_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint supervision_groups_cohort_same_program
    foreign key (cohort_id, program_id)
    references public.cohorts (id, program_id) on delete cascade,
  constraint supervision_groups_placement_same_program
    foreign key (placement_id, program_id)
    references public.placements (id, program_id) on delete cascade,
  unique (cohort_id, label)
);

create index supervision_groups_cohort_idx on public.supervision_groups (cohort_id);

-- Un etudiant appartient a UN groupe. Contrainte volontairement simple : si un
-- etudiant devait tourner entre deux groupes en cours de stage, retirer cet
-- unique suffirait -- rien d'autre n'en depend.
create table public.supervision_group_members (
  group_id uuid not null references public.supervision_groups (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, enrollment_id),
  unique (enrollment_id)
);

create table public.supervision_group_supervisors (
  group_id uuid not null references public.supervision_groups (id) on delete cascade,
  person_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, person_id)
);

create index supervision_group_supervisors_person_idx
  on public.supervision_group_supervisors (person_id);

alter table public.supervision_groups enable row level security;
alter table public.supervision_group_members enable row level security;
alter table public.supervision_group_supervisors enable row level security;
revoke all on public.supervision_groups from public, anon, authenticated;
revoke all on public.supervision_group_members from public, anon, authenticated;
revoke all on public.supervision_group_supervisors from public, anon, authenticated;
grant select on public.supervision_groups to authenticated;
grant select on public.supervision_group_members to authenticated;
grant select on public.supervision_group_supervisors to authenticated;

create policy supervision_groups_select on public.supervision_groups
for select to authenticated
using (
  public.is_program_staff(program_id)
  or public.is_enrolled_in_program(program_id)
);

create policy supervision_group_members_select on public.supervision_group_members
for select to authenticated
using (
  exists (
    select 1 from public.supervision_groups g
    where g.id = supervision_group_members.group_id
      and (public.is_program_staff(g.program_id) or public.is_enrolled_in_program(g.program_id))
  )
);

create policy supervision_group_supervisors_select on public.supervision_group_supervisors
for select to authenticated
using (
  exists (
    select 1 from public.supervision_groups g
    where g.id = supervision_group_supervisors.group_id
      and (public.is_program_staff(g.program_id) or public.is_enrolled_in_program(g.program_id))
  )
);

-- Qui peut regarder le carnet de CET etudiant ?
--
-- Attention : is_program_staff() ne convient PAS ici. Elle est vraie pour tout
-- placement_supervisor du programme, ce qui donnerait a l'encadrant du groupe A
-- les carnets du groupe B et viderait les groupes de leur sens. Seule
-- l'administration du programme voit tout ; un encadrant ne voit que SES
-- groupes.
create function public.supervises_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment_id
      and public.can_administer_program(e.program_id)
  )
  or exists (
    select 1
    from public.supervision_group_supervisors s
    join public.supervision_group_members m on m.group_id = s.group_id
    where s.person_id = auth.uid()
      and m.enrollment_id = p_enrollment_id
  );
$$;

revoke all on function public.supervises_enrollment(uuid) from public, anon;

/* ================================================================== */
/* 3. Le carnet                                                       */
/* ================================================================== */

create type public.stage_log_status as enum
  ('draft', 'submitted', 'needs_revision', 'validated', 'transmitted');

-- Modele de carnet : la configuration decrite par StageLogTemplate. Les
-- sous-objets (champs, objectifs, politique photo) sont stockes tels quels :
-- c'est de la configuration que le domaine sait relire, pas des donnees a
-- interroger en SQL.
create table public.stage_log_templates (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  label text not null check (length(btrim(label)) between 1 and 200),
  description text not null default '',
  module_label text not null default '',
  -- Liste vide = toutes les cohortes du programme (convention du domaine).
  cohort_ids uuid[] not null default '{}',
  enabled boolean not null default true,
  fields jsonb not null default '[]'::jsonb,
  objectives jsonb not null default '[]'::jsonb,
  entry_frequency text not null default 'per_entry'
    check (entry_frequency in ('per_entry', 'weekly', 'per_placement', 'per_semester')),
  validator_role public.role_name not null default 'placement_supervisor'
    check (validator_role in ('placement_supervisor', 'teacher')),
  completeness_rules text[] not null default '{}',
  photo_policy jsonb not null default '{"enabled": false, "automaticCheck": "not_active"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, label, version)
);

alter table public.stage_log_templates enable row level security;
revoke all on public.stage_log_templates from public, anon, authenticated;
grant select on public.stage_log_templates to authenticated;

create policy stage_log_templates_select on public.stage_log_templates
for select to authenticated
using (
  public.is_program_staff(program_id)
  or public.is_enrolled_in_program(program_id)
);

-- UN carnet par etudiant et par terrain de stage : le carnet des 12 semaines.
-- Le decoupage en « blocs » n'est pas ici, il est porte par les validations,
-- qui couvrent chacune une periode. C'est ce qui permet a l'encadrant de
-- valider une semaine, deux, ou tout le stage, sans que le modele impose un
-- decoupage a l'avance.
create table public.stage_logs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.stage_log_templates (id) on delete set null,
  template_version integer not null default 1,
  program_id uuid not null references public.programs (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  placement_id uuid not null references public.placements (id) on delete cascade,
  period_starts_on date not null,
  period_ends_on date not null,
  status public.stage_log_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage_logs_period_ordered check (period_ends_on >= period_starts_on),
  unique (enrollment_id, placement_id)
);

create index stage_logs_enrollment_idx on public.stage_logs (enrollment_id);
create index stage_logs_program_idx on public.stage_logs (program_id, status);

-- Une entree = une journee PRESENTE. La presence n'est pas une colonne : c'est
-- l'existence de la ligne. Decision de Stef -- un geste, pas deux. Les jours
-- sans entree sont simplement vides.
--
-- Le texte est dicte au clavier du telephone (touche micro native), jamais
-- enregistre en audio : on ne conserve que le texte.
create table public.stage_log_entries (
  id uuid primary key default gen_random_uuid(),
  stage_log_id uuid not null references public.stage_logs (id) on delete cascade,
  occurred_on date not null,
  narrative text not null default '' check (length(narrative) <= 10000),
  -- Champs configures par le modele de carnet, quand il y en a.
  values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage_log_id, occurred_on)
);

create index stage_log_entries_log_idx on public.stage_log_entries (stage_log_id, occurred_on);

-- Une journee hors de la periode du carnet n'a pas de sens : ni l'ecran ni la
-- validation ne sauraient quoi en faire.
create function public.stage_log_entries_check_period()
returns trigger
language plpgsql
as $$
declare
  v_from date;
  v_to date;
begin
  select l.period_starts_on, l.period_ends_on into v_from, v_to
  from public.stage_logs l where l.id = new.stage_log_id;

  if new.occurred_on < v_from or new.occurred_on > v_to then
    raise exception 'Cette journee (%) est hors de la periode du stage (% a %).',
      new.occurred_on, v_from, v_to;
  end if;
  return new;
end;
$$;

create trigger stage_log_entries_period
before insert or update on public.stage_log_entries
for each row execute function public.stage_log_entries_check_period();

-- La validation par BLOC : elle couvre une periode, pas une journee. « Semaine
-- ou plus » (Stef, 31/08). L'historique est conserve : une demande de
-- correction puis une validation sont deux lignes, pas un ecrasement.
create table public.stage_log_validations (
  id uuid primary key default gen_random_uuid(),
  stage_log_id uuid not null references public.stage_logs (id) on delete cascade,
  covers_from date not null,
  covers_to date not null,
  validator_person_id uuid not null references public.profiles (id) on delete restrict,
  validator_role public.role_name not null
    check (validator_role in ('placement_supervisor', 'teacher', 'administrator')),
  decision text not null check (decision in ('validated', 'needs_revision')),
  comment text not null default '' check (length(comment) <= 4000),
  decided_at timestamptz not null default now(),
  constraint stage_log_validations_period_ordered check (covers_to >= covers_from)
);

create index stage_log_validations_log_idx
  on public.stage_log_validations (stage_log_id, covers_from);

alter table public.stage_logs enable row level security;
alter table public.stage_log_entries enable row level security;
alter table public.stage_log_validations enable row level security;
revoke all on public.stage_logs from public, anon, authenticated;
revoke all on public.stage_log_entries from public, anon, authenticated;
revoke all on public.stage_log_validations from public, anon, authenticated;
grant select on public.stage_logs to authenticated;
grant select on public.stage_log_entries to authenticated;
grant select on public.stage_log_validations to authenticated;

create policy stage_logs_select on public.stage_logs
for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.id = stage_logs.enrollment_id and e.person_id = auth.uid()
  )
  or public.supervises_enrollment(stage_logs.enrollment_id)
);

create policy stage_log_entries_select on public.stage_log_entries
for select to authenticated
using (
  exists (
    select 1 from public.stage_logs l
    join public.enrollments e on e.id = l.enrollment_id
    where l.id = stage_log_entries.stage_log_id
      and (e.person_id = auth.uid() or public.supervises_enrollment(l.enrollment_id))
  )
);

create policy stage_log_validations_select on public.stage_log_validations
for select to authenticated
using (
  exists (
    select 1 from public.stage_logs l
    join public.enrollments e on e.id = l.enrollment_id
    where l.id = stage_log_validations.stage_log_id
      and (e.person_id = auth.uid() or public.supervises_enrollment(l.enrollment_id))
  )
);

/* ================================================================== */
/* 4. Ecriture : rien en direct, tout par fonction                    */
/* ================================================================== */

create function public.create_placement(
  p_program_id uuid,
  p_name text,
  p_site text default '',
  p_department text default '',
  p_capacity integer default 0
) returns public.placements
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.placements;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  insert into public.placements (program_id, name, site, department, capacity)
  values (p_program_id, btrim(p_name), coalesce(p_site, ''),
          coalesce(p_department, ''), coalesce(p_capacity, 0))
  returning * into v_row;

  return v_row;
end;
$$;

create function public.create_supervision_group(
  p_cohort_id uuid,
  p_placement_id uuid,
  p_label text
) returns public.supervision_groups
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_placement_program uuid;
  v_row public.supervision_groups;
begin
  select c.program_id into v_program_id
  from public.cohorts c where c.id = p_cohort_id;

  if v_program_id is null then
    raise exception 'Cohorte introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  select pl.program_id into v_placement_program
  from public.placements pl where pl.id = p_placement_id;

  if v_placement_program is distinct from v_program_id then
    raise exception 'Ce terrain de stage n''appartient pas au programme de la cohorte.';
  end if;

  insert into public.supervision_groups (cohort_id, program_id, placement_id, label)
  values (p_cohort_id, v_program_id, p_placement_id, btrim(p_label))
  returning * into v_row;

  return v_row;
end;
$$;

-- Le lot entier en un appel, comme set_outcomes_retained et
-- set_milestone_outcomes : l'ecran enregistre l'etat complet d'une liste.
create function public.set_group_members(
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
  where e.id = any (coalesce(p_enrollment_ids, '{}'::uuid[]))
    and e.cohort_id is distinct from v_cohort_id;

  if v_foreign > 0 then
    raise exception 'Un groupe ne peut contenir que des etudiants de sa propre cohorte.';
  end if;

  delete from public.supervision_group_members where group_id = p_group_id;

  return query
    insert into public.supervision_group_members (group_id, enrollment_id)
    select p_group_id, id from unnest(coalesce(p_enrollment_ids, '{}'::uuid[])) as t(id)
    returning *;
end;
$$;

create function public.set_group_supervisors(
  p_group_id uuid,
  p_person_ids uuid[]
) returns setof public.supervision_group_supervisors
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
begin
  select g.program_id into v_program_id
  from public.supervision_groups g where g.id = p_group_id;

  if v_program_id is null then
    raise exception 'Groupe introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  delete from public.supervision_group_supervisors where group_id = p_group_id;

  return query
    insert into public.supervision_group_supervisors (group_id, person_id)
    select p_group_id, id from unnest(coalesce(p_person_ids, '{}'::uuid[])) as t(id)
    returning *;
end;
$$;

-- L'etudiant note sa journee. Le carnet s'ouvre tout seul a la premiere
-- journee saisie : lui demander d'abord « ouvrir un carnet » serait un ecran
-- de plus pour rien. Sa periode est celle de la cohorte -- les 12 semaines.
create function public.save_stage_log_day(
  p_enrollment_id uuid,
  p_placement_id uuid,
  p_occurred_on date,
  p_narrative text default '',
  p_values jsonb default '{}'::jsonb
) returns public.stage_log_entries
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_cohort_id uuid;
  v_starts date;
  v_ends date;
  v_log_id uuid;
  v_row public.stage_log_entries;
begin
  if not public.owns_enrollment(p_enrollment_id) then
    raise exception 'Cette inscription n''est pas la votre.';
  end if;

  select e.program_id, e.cohort_id into v_program_id, v_cohort_id
  from public.enrollments e where e.id = p_enrollment_id;

  if not exists (
    select 1 from public.placements pl
    where pl.id = p_placement_id and pl.program_id = v_program_id
  ) then
    raise exception 'Ce terrain de stage n''appartient pas a votre programme.';
  end if;

  select c.starts_on, c.ends_on into v_starts, v_ends
  from public.cohorts c where c.id = v_cohort_id;

  insert into public.stage_logs
    (program_id, cohort_id, enrollment_id, placement_id, period_starts_on, period_ends_on)
  values
    (v_program_id, v_cohort_id, p_enrollment_id, p_placement_id, v_starts, v_ends)
  on conflict (enrollment_id, placement_id) do update
    set updated_at = now()
  returning id into v_log_id;

  insert into public.stage_log_entries (stage_log_id, occurred_on, narrative, values)
  values (v_log_id, p_occurred_on, coalesce(p_narrative, ''), coalesce(p_values, '{}'::jsonb))
  on conflict (stage_log_id, occurred_on) do update
    set narrative  = excluded.narrative,
        values     = excluded.values,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- Se retirer une journee : l'etudiant s'etait trompe de jour. Supprimer la
-- ligne, c'est declarer l'absence -- la presence n'ayant pas d'autre support.
create function public.delete_stage_log_day(
  p_enrollment_id uuid,
  p_placement_id uuid,
  p_occurred_on date
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.owns_enrollment(p_enrollment_id) then
    raise exception 'Cette inscription n''est pas la votre.';
  end if;

  delete from public.stage_log_entries e
  using public.stage_logs l
  where e.stage_log_id = l.id
    and l.enrollment_id = p_enrollment_id
    and l.placement_id = p_placement_id
    and e.occurred_on = p_occurred_on;
end;
$$;

-- L'encadrant valide un BLOC : une semaine, deux, ou tout le stage. Le role
-- inscrit est celui que l'appelant detient reellement, pas celui qu'il declare.
create function public.validate_stage_log_block(
  p_stage_log_id uuid,
  p_covers_from date,
  p_covers_to date,
  p_decision text,
  p_comment text default ''
) returns public.stage_log_validations
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment_id uuid;
  v_program_id uuid;
  v_from date;
  v_to date;
  v_role public.role_name;
  v_row public.stage_log_validations;
begin
  select l.enrollment_id, l.program_id, l.period_starts_on, l.period_ends_on
    into v_enrollment_id, v_program_id, v_from, v_to
  from public.stage_logs l where l.id = p_stage_log_id;

  if v_enrollment_id is null then
    raise exception 'Carnet introuvable.';
  end if;
  if not public.supervises_enrollment(v_enrollment_id) then
    raise exception 'Vous n''encadrez pas cet etudiant.';
  end if;
  if p_decision not in ('validated', 'needs_revision') then
    raise exception 'Decision invalide : attendu validated ou needs_revision.';
  end if;
  if p_covers_to < p_covers_from then
    raise exception 'La periode validee est a l''envers.';
  end if;
  if p_covers_from < v_from or p_covers_to > v_to then
    raise exception 'La periode validee deborde du stage (% a %).', v_from, v_to;
  end if;

  if public.can_administer_program(v_program_id) then
    v_role := 'administrator';
  elsif exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid() and ra.program_id = v_program_id
      and ra.role = 'teacher' and ra.revoked_at is null
  ) then
    v_role := 'teacher';
  else
    v_role := 'placement_supervisor';
  end if;

  insert into public.stage_log_validations
    (stage_log_id, covers_from, covers_to, validator_person_id, validator_role, decision, comment)
  values
    (p_stage_log_id, p_covers_from, p_covers_to, auth.uid(), v_role,
     p_decision, coalesce(p_comment, ''))
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_placement(uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.create_supervision_group(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.set_group_members(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.set_group_supervisors(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.save_stage_log_day(uuid, uuid, date, text, jsonb) from public, anon, authenticated;
revoke all on function public.delete_stage_log_day(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.validate_stage_log_block(uuid, date, date, text, text) from public, anon, authenticated;

grant execute on function public.create_placement(uuid, text, text, text, integer) to authenticated;
grant execute on function public.create_supervision_group(uuid, uuid, text) to authenticated;
grant execute on function public.set_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.set_group_supervisors(uuid, uuid[]) to authenticated;
grant execute on function public.save_stage_log_day(uuid, uuid, date, text, jsonb) to authenticated;
grant execute on function public.delete_stage_log_day(uuid, uuid, date) to authenticated;
grant execute on function public.validate_stage_log_block(uuid, date, date, text, text) to authenticated;
