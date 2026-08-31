-- Retroplanning d'une cohorte : des jalons dates, chacun portant un paquet d'acquis.
--
-- Decision de conception (Stef, 31/08) : PAS une echeance par acquis, mais
-- quatre a six jalons qui regroupent. Sur un telephone, vingt dates a tenir
-- n'est pas un plan, c'est une liste de courses. Le modele PlanScheduleEntry
-- de src/domain/acquisitionPlan.ts (une date par acquis) reste utilisable en
-- presentation : le presenter derive la date d'un acquis de celle de son jalon.
--
-- Les dates ne sont PAS stockees : un jalon porte un rang de semaine, et la
-- date se deduit de cohorts.starts_on. Rejouer le meme retroplanning l'annee
-- suivante ne demande alors que de changer la date de la cohorte, pas de
-- ressaisir six echeances.
--
-- Portee : une cohorte, pas un programme. Un jalon « semaine 4 » n'a de sens
-- que pour un stage donne, la ou une connaissance existe independamment de
-- toute promo. C'est le meme rangement que les objectifs pedagogiques : un
-- bloc du Concepteur, pas d'onglet propre.

create table public.plan_milestones (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null,
  -- Denormalise depuis la cohorte : la RLS decide sans jointure, et la
  -- contrainte composite ci-dessous garantit qu'il ne peut pas mentir.
  program_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 200),
  -- Rang de semaine depuis le debut du stage. 0 = semaine d'accueil.
  week_offset integer not null check (week_offset between 0 and 104),
  -- Echeance institutionnelle : non deplacable par l'etudiant. La regle est
  -- celle de approvalRuleForImpact() dans src/domain/acquisitionPlan.ts, deja
  -- ecrite et testee — official_deadline exige un enseignant, personal_pace
  -- est accepte d'office.
  official boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_milestones_cohort_same_program
    foreign key (cohort_id, program_id)
    references public.cohorts (id, program_id) on delete cascade,
  unique (cohort_id, label),
  -- Cible de la contrainte declarative posee par learner_milestone_shifts
  -- (migration suivante) : un decalage personnel ne peut viser qu'un jalon
  -- non officiel, et c'est PostgreSQL qui le refuse, pas l'ecran.
  unique (id, official)
);

create index plan_milestones_cohort_idx on public.plan_milestones (cohort_id, position);

alter table public.plan_milestones enable row level security;
revoke all on public.plan_milestones from public, anon, authenticated;
grant select on public.plan_milestones to authenticated;

-- L'apprenant inscrit lit le retroplanning de son programme : c'est le coeur
-- de son passeport. L'ecriture n'est jamais ouverte en direct, elle passe par
-- les fonctions ci-dessous.
create policy plan_milestones_select on public.plan_milestones
for select to authenticated
using (
  public.is_program_staff(program_id)
  or public.is_enrolled_in_program(program_id)
);

-- Quels acquis sont attendus a ce jalon. C'est ce qui remplace « une echeance
-- par acquis » : l'acquis herite de la date de son jalon.
create table public.plan_milestone_outcomes (
  milestone_id uuid not null references public.plan_milestones (id) on delete cascade,
  outcome_id uuid not null references public.outcomes (id) on delete cascade,
  position integer not null default 0,
  primary key (milestone_id, outcome_id)
);

create index plan_milestone_outcomes_outcome_idx
  on public.plan_milestone_outcomes (outcome_id);

alter table public.plan_milestone_outcomes enable row level security;
revoke all on public.plan_milestone_outcomes from public, anon, authenticated;
grant select on public.plan_milestone_outcomes to authenticated;

create policy plan_milestone_outcomes_select on public.plan_milestone_outcomes
for select to authenticated
using (
  exists (
    select 1
    from public.plan_milestones m
    where m.id = plan_milestone_outcomes.milestone_id
      and (
        public.is_program_staff(m.program_id)
        or public.is_enrolled_in_program(m.program_id)
      )
  )
);

/* ------------------------------------------------------------------ */
/* Ecriture : reservee a l'administration du programme                 */
/* ------------------------------------------------------------------ */

create function public.create_plan_milestone(
  p_cohort_id uuid,
  p_label text,
  p_week_offset integer,
  p_official boolean default false,
  p_position integer default 0
) returns public.plan_milestones
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.plan_milestones;
begin
  select c.program_id into v_program_id
  from public.cohorts c where c.id = p_cohort_id;

  if v_program_id is null then
    raise exception 'Cohorte introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  insert into public.plan_milestones
    (cohort_id, program_id, label, week_offset, official, position)
  values
    (p_cohort_id, v_program_id, btrim(p_label), p_week_offset,
     coalesce(p_official, false), coalesce(p_position, 0))
  returning * into v_row;

  return v_row;
end;
$$;

create function public.update_plan_milestone(
  p_milestone_id uuid,
  p_label text,
  p_week_offset integer,
  p_official boolean,
  p_position integer
) returns public.plan_milestones
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.plan_milestones;
begin
  select m.program_id into v_program_id
  from public.plan_milestones m where m.id = p_milestone_id;

  if v_program_id is null then
    raise exception 'Jalon introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  update public.plan_milestones
     set label       = coalesce(btrim(p_label), label),
         week_offset = coalesce(p_week_offset, week_offset),
         official    = coalesce(p_official, official),
         position    = coalesce(p_position, position),
         updated_at  = now()
   where id = p_milestone_id
  returning * into v_row;

  return v_row;
end;
$$;

create function public.delete_plan_milestone(p_milestone_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
begin
  select m.program_id into v_program_id
  from public.plan_milestones m where m.id = p_milestone_id;

  if v_program_id is null then
    return;
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  delete from public.plan_milestones where id = p_milestone_id;
end;
$$;

-- Composition d'un jalon : le lot entier en un appel, jamais ligne a ligne.
-- Meme raison que set_outcomes_retained (20260830110000) : l'ecran enregistre
-- l'etat complet d'une liste, et une bascule partielle laisserait l'ecran et
-- la base en desaccord.
--
-- Un acquis d'un autre programme est refuse : le jalon appartient a une
-- cohorte, donc a un programme, et rien a l'ecran ne rendrait visible un
-- rattachement croise.
create function public.set_milestone_outcomes(
  p_milestone_id uuid,
  p_outcome_ids uuid[]
) returns setof public.plan_milestone_outcomes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_foreign integer;
begin
  select m.program_id into v_program_id
  from public.plan_milestones m where m.id = p_milestone_id;

  if v_program_id is null then
    raise exception 'Jalon introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  select count(*) into v_foreign
  from public.outcomes o
  where o.id = any (coalesce(p_outcome_ids, '{}'::uuid[]))
    and o.program_id is distinct from v_program_id;

  if v_foreign > 0 then
    raise exception 'Un jalon ne peut porter que des acquis de son propre programme.';
  end if;

  delete from public.plan_milestone_outcomes
   where milestone_id = p_milestone_id;

  return query
    insert into public.plan_milestone_outcomes (milestone_id, outcome_id, position)
    select p_milestone_id, id, ord::integer
    from unnest(coalesce(p_outcome_ids, '{}'::uuid[])) with ordinality as t(id, ord)
    returning *;
end;
$$;

revoke all on function public.create_plan_milestone(uuid, text, integer, boolean, integer)
  from public, anon, authenticated;
revoke all on function public.update_plan_milestone(uuid, text, integer, boolean, integer)
  from public, anon, authenticated;
revoke all on function public.delete_plan_milestone(uuid)
  from public, anon, authenticated;
revoke all on function public.set_milestone_outcomes(uuid, uuid[])
  from public, anon, authenticated;

grant execute on function public.create_plan_milestone(uuid, text, integer, boolean, integer)
  to authenticated;
grant execute on function public.update_plan_milestone(uuid, text, integer, boolean, integer)
  to authenticated;
grant execute on function public.delete_plan_milestone(uuid)
  to authenticated;
grant execute on function public.set_milestone_outcomes(uuid, uuid[])
  to authenticated;
