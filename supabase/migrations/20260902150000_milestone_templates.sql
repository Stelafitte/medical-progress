-- Modeles de retroplanning : rejouer un calendrier de jalons ailleurs.
--
-- Demande de Stef (02/09) : « il faut pouvoir enregistrer les jalons de la
-- promotion a titre de modele afin de l'exploiter sur une autre promotion ».
--
-- CE QU'UN MODELE CONTIENT, ET SURTOUT CE QU'IL NE CONTIENT PAS.
--
-- Il porte des CHAPITRES et des SEMAINES, jamais des acquis. Ce n'est pas une
-- economie de place, c'est une lecture du code existant : la composition d'un
-- jalon n'a jamais ete saisie a la main. ProgramMilestonePlanner passe a
-- setMilestoneOutcomes tous les acquis du chapitre (outcomesByTheme). Un jalon
-- « Valvulopathies » contient donc, par construction, les acquis de
-- « Valvulopathies » -- rien de plus, rien de moins.
--
-- Transporter des identifiants d'acquis serait donc doublement mauvais : cela
-- attacherait le modele a son programme d'origine sans rien apporter, et cela
-- le FIGERAIT -- un acquis ajoute au chapitre l'annee suivante n'entrerait
-- jamais dans les jalons rejoues.
--
-- Consequence voulue : un modele traverse les programmes. Il se pose la ou les
-- chapitres portent les memes intitules, et la composition se recalcule sur
-- place. C'est le meme rapprochement par libelle que planMilestoneIntent fait
-- deja entre un jalon enregistre et un chapitre du referentiel.
--
-- Les semaines restent des RANGS depuis le debut du stage, jamais des dates :
-- c'est ce qui rendait deja le retroplanning rejouable, et c'est ce qui rend ce
-- modele possible sans convertir quoi que ce soit.

create table public.milestone_templates (
  id uuid primary key default gen_random_uuid(),
  -- Programme d'ORIGINE. Il decide QUI VOIT le modele, pas OU il s'applique :
  -- appliquer ailleurs reste permis a qui administre les deux programmes.
  program_id uuid not null references public.programs (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 200),
  description text not null default '',
  -- Tracabilite : de quelle promotion ce calendrier a ete releve. Nul si la
  -- promotion disparait -- le modele, lui, survit. C'est sa raison d'etre :
  -- une copie de promotion a promotion mourrait avec sa source.
  source_cohort_id uuid references public.cohorts (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, label)
);

create table public.milestone_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null
    references public.milestone_templates (id) on delete cascade,
  -- L'intitule du CHAPITRE : c'est la cle de rapprochement a l'arrivee.
  label text not null check (length(btrim(label)) between 1 and 200),
  week_offset integer not null check (week_offset between 0 and 104),
  week_offset_end integer
    check (week_offset_end is null or week_offset_end between 0 and 104),
  official boolean not null default false,
  position integer not null default 0,
  -- Les memes contraintes que plan_milestones, mot pour mot : un modele ne doit
  -- pas pouvoir contenir ce qu'un retroplanning refuserait.
  constraint milestone_template_items_week_range
    check (week_offset_end is null or week_offset_end >= week_offset),
  unique (template_id, label)
);

create index milestone_templates_program_idx
  on public.milestone_templates (program_id, label);
create index milestone_template_items_template_idx
  on public.milestone_template_items (template_id, position);

comment on table public.milestone_templates is
  'Calendrier de jalons detache de toute promotion. Porte des chapitres et des semaines, jamais des acquis : la composition se recalcule a l''arrivee depuis le chapitre.';
comment on column public.milestone_templates.source_cohort_id is
  'Promotion dont ce calendrier a ete releve. Nul si elle a disparu : le modele lui survit.';

alter table public.milestone_templates enable row level security;
alter table public.milestone_template_items enable row level security;
revoke all on public.milestone_templates from public, anon, authenticated;
revoke all on public.milestone_template_items from public, anon, authenticated;
grant select on public.milestone_templates to authenticated;
grant select on public.milestone_template_items to authenticated;

-- Meme portee que le retroplanning dont il est tire : l'equipe du programme.
-- L'apprenant n'a rien a faire ici -- un modele n'est pas un calendrier, c'est
-- un outil de conception.
create policy milestone_templates_select on public.milestone_templates
for select to authenticated
using (public.is_program_staff(program_id));

create policy milestone_template_items_select on public.milestone_template_items
for select to authenticated
using (
  exists (
    select 1 from public.milestone_templates t
    where t.id = template_id and public.is_program_staff(t.program_id)
  )
);

/* ------------------------------------------------------------------ */
/* Relever un modele sur une promotion                                 */
/* ------------------------------------------------------------------ */

create function public.save_milestone_template(
  p_cohort_id uuid,
  p_label text,
  p_description text default ''
) returns public.milestone_templates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_count integer;
  v_row public.milestone_templates;
begin
  select c.program_id into v_program_id
  from public.cohorts c where c.id = p_cohort_id;

  if v_program_id is null then
    raise exception 'Promotion introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  select count(*) into v_count
  from public.plan_milestones m where m.cohort_id = p_cohort_id;

  -- Un modele vide ne se distinguerait pas d'un modele qu'on aurait oublie de
  -- remplir : il vaut mieux refuser que produire un objet muet.
  if v_count = 0 then
    raise exception 'Cette promotion ne porte aucun jalon : il n''y a rien a relever.';
  end if;

  insert into public.milestone_templates
    (program_id, label, description, source_cohort_id, created_by)
  values
    (v_program_id, btrim(p_label), coalesce(btrim(p_description), ''),
     p_cohort_id, auth.uid())
  returning * into v_row;

  insert into public.milestone_template_items
    (template_id, label, week_offset, week_offset_end, official, position)
  select v_row.id, m.label, m.week_offset, m.week_offset_end, m.official, m.position
  from public.plan_milestones m
  where m.cohort_id = p_cohort_id;

  return v_row;
end;
$$;

create function public.update_milestone_template(
  p_template_id uuid,
  p_label text,
  p_description text
) returns public.milestone_templates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.milestone_templates;
begin
  select t.program_id into v_program_id
  from public.milestone_templates t where t.id = p_template_id;

  if v_program_id is null then
    raise exception 'Modele introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  update public.milestone_templates
     set label       = coalesce(btrim(p_label), label),
         description = coalesce(btrim(p_description), description),
         updated_at  = now()
   where id = p_template_id
  returning * into v_row;

  return v_row;
end;
$$;

create function public.delete_milestone_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
begin
  select t.program_id into v_program_id
  from public.milestone_templates t where t.id = p_template_id;

  if v_program_id is null then
    return;
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  -- Les items partent en cascade. Aucun retroplanning n'est touche : un modele
  -- deja pose a produit des jalons autonomes, qui ne le referencent pas.
  delete from public.milestone_templates where id = p_template_id;
end;
$$;

/* ------------------------------------------------------------------ */
/* Poser un modele sur une promotion                                   */
/* ------------------------------------------------------------------ */

-- p_mode : 'keep' complete sans toucher a l'existant, 'replace' repart de zero.
-- Stef (02/09) : l'ecran doit PROPOSER les deux, pas en imposer un.
--
-- p_dry_run : compte sans ecrire. Meme rapport, aucune ligne posee.
create function public.apply_milestone_template(
  p_template_id uuid,
  p_cohort_id uuid,
  p_mode text default 'keep',
  p_dry_run boolean default false
) returns table (
  poses integer,
  ignores integer,
  sans_chapitre text[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_starts date;
  v_ends date;
  v_last_week integer;
  v_template_last integer;
  v_matched integer;
  v_shifts integer;
  v_poses integer := 0;
  v_ignores integer := 0;
  v_orphans text[];
  v_milestone_id uuid;
  r record;
begin
  if p_mode is null or p_mode not in ('keep', 'replace') then
    raise exception 'Mode inconnu : %. Attendu keep ou replace.', p_mode;
  end if;

  select c.program_id, c.starts_on, c.ends_on
    into v_program_id, v_starts, v_ends
  from public.cohorts c where c.id = p_cohort_id;

  if v_program_id is null then
    raise exception 'Promotion introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  if not exists (select 1 from public.milestone_templates t where t.id = p_template_id) then
    raise exception 'Modele introuvable.';
  end if;

  -- La duree de la promotion en rangs de semaine. MEME calcul que
  -- learningWeeks() dans src/domain/acquisitionPlan.ts : floor(jours / 7).
  -- Deux calculs differents feraient refuser ici ce que l'ecran accepte.
  v_last_week := floor((v_ends - v_starts) / 7.0);

  select max(coalesce(i.week_offset_end, i.week_offset)) into v_template_last
  from public.milestone_template_items i where i.template_id = p_template_id;

  if v_template_last is null then
    raise exception 'Ce modele ne contient aucun jalon.';
  end if;

  -- REFUS, decide par Stef le 02/09. Un modele plus long que la promotion
  -- poserait des echeances apres le dernier jour du stage. Les tasser
  -- decideraient de la pedagogie a sa place ; les poser en silence donnerait
  -- un retroplanning faux des la premiere seconde. On refuse en disant les
  -- deux chiffres, seule facon d'agir en connaissance de cause.
  if v_template_last > v_last_week then
    raise exception
      'Ce modele va jusqu''a la semaine %, cette promotion s''arrete a la semaine %.',
      v_template_last, v_last_week;
  end if;

  select count(*) into v_matched
  from public.milestone_template_items i
  join public.outcome_themes th
    on th.program_id = v_program_id and th.label = i.label
  where i.template_id = p_template_id;

  select coalesce(array_agg(i.label order by i.position), '{}'::text[])
    into v_orphans
  from public.milestone_template_items i
  where i.template_id = p_template_id
    and not exists (
      select 1 from public.outcome_themes th
      where th.program_id = v_program_id and th.label = i.label
    );

  -- Aucun chapitre reconnu : le modele vient d'un referentiel etranger. Poser
  -- des jalons qui ne correspondent a aucun chapitre les rendrait orphelins --
  -- l'ecran les affiche alors comme « a supprimer », ce qui est le contraire
  -- du service rendu.
  if v_matched = 0 then
    raise exception
      'Aucun chapitre de ce modele n''existe dans ce programme : tous les jalons seraient orphelins.';
  end if;

  if p_mode = 'replace' then
    select count(*) into v_shifts
    from public.learner_milestone_shifts s
    join public.plan_milestones m on m.id = s.milestone_id
    where m.cohort_id = p_cohort_id;

    -- learner_milestone_shifts cascade sur plan_milestones : remplacer
    -- effacerait sans un mot les decalages personnels des apprenants.
    if v_shifts > 0 then
      raise exception
        '% decalage(s) personnel(s) d''apprenant portent sur ces jalons : les remplacer les effacerait.',
        v_shifts;
    end if;

    if not p_dry_run then
      delete from public.plan_milestones m where m.cohort_id = p_cohort_id;
    end if;
  end if;

  for r in
    select i.label, i.week_offset, i.week_offset_end, i.official, i.position,
           th.id as theme_id
    from public.milestone_template_items i
    join public.outcome_themes th
      on th.program_id = v_program_id and th.label = i.label
    where i.template_id = p_template_id
    order by i.position
  loop
    if p_mode = 'keep' and exists (
      select 1 from public.plan_milestones m
      where m.cohort_id = p_cohort_id and m.label = r.label
    ) then
      v_ignores := v_ignores + 1;
      continue;
    end if;

    v_poses := v_poses + 1;
    if p_dry_run then
      continue;
    end if;

    insert into public.plan_milestones
      (cohort_id, program_id, label, week_offset, week_offset_end, official, position)
    values
      (p_cohort_id, v_program_id, r.label, r.week_offset, r.week_offset_end,
       r.official, r.position)
    returning id into v_milestone_id;

    -- La composition se RECALCULE ici : les acquis RETENUS du chapitre, tels
    -- qu'ils sont aujourd'hui dans CE programme. C'est exactement ce que fait
    -- l'ecran a l'enregistrement, et c'est ce qui permet au modele de ne
    -- transporter aucun acquis.
    insert into public.plan_milestone_outcomes (milestone_id, outcome_id, position)
    select v_milestone_id, o.id, o.position
    from public.outcomes o
    where o.theme_id = r.theme_id
      and o.retained_at is not null;
  end loop;

  return query select v_poses, v_ignores, v_orphans;
end;
$$;

/* ------------------------------------------------------------------ */
/* Droits : rien d'implicite                                           */
/* ------------------------------------------------------------------ */

revoke all on function public.save_milestone_template(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.update_milestone_template(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.delete_milestone_template(uuid)
  from public, anon, authenticated;
revoke all on function public.apply_milestone_template(uuid, uuid, text, boolean)
  from public, anon, authenticated;

grant execute on function public.save_milestone_template(uuid, text, text)
  to authenticated;
grant execute on function public.update_milestone_template(uuid, text, text)
  to authenticated;
grant execute on function public.delete_milestone_template(uuid)
  to authenticated;
grant execute on function public.apply_milestone_template(uuid, uuid, text, boolean)
  to authenticated;
