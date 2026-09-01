-- Un jalon peut couvrir une PERIODE, pas seulement une semaine.
--
-- Decide par Stef le 01/09 : le Concepteur propose « date unique / periode /
-- non date » par chapitre, et la table ne savait tenir qu'une semaine.
--
-- Le modele de la migration d'origine ne bouge pas : on stocke des RANGS DE
-- SEMAINE depuis le debut du stage, jamais des dates. Rejouer le meme
-- retroplanning l'annee suivante ne demande toujours que de changer la date de
-- la promotion.
--
--   week_offset_end null  -> jalon ponctuel  (« semaine 4 »)
--   week_offset_end pose  -> jalon etale     (« semaines 4 a 6 »)
--
-- Aucune ligne existante n'est touchee : la colonne est nullable, donc tous les
-- jalons deja poses restent ponctuels, ce qu'ils sont.

alter table public.plan_milestones
  add column week_offset_end integer;

alter table public.plan_milestones
  add constraint plan_milestones_week_offset_end_range
    check (week_offset_end is null or week_offset_end between 0 and 104);

-- La fin ne precede pas le debut. C'est PostgreSQL qui le refuse, pas l'ecran :
-- l'ecran le verifie deja (`boundsInvalid`), et c'est precisement pour cela
-- qu'il ne faut pas s'y fier seul.
alter table public.plan_milestones
  add constraint plan_milestones_week_range
    check (week_offset_end is null or week_offset_end >= week_offset);

-- ------------------------------------------------------------------
-- Les deux fonctions d'ecriture doivent transporter la nouvelle colonne.
--
-- DROP puis CREATE, jamais une surcharge : deux fonctions de meme nom et
-- d'arite differente font repondre « function is not unique » a PostgREST, et
-- c'est toute l'API qui tombe, pas seulement le nouvel appel. C'est la lecon
-- de create_outcome (01/09).
-- ------------------------------------------------------------------

drop function if exists public.create_plan_milestone(uuid, text, integer, boolean, integer);

create function public.create_plan_milestone(
  p_cohort_id uuid,
  p_label text,
  p_week_offset integer,
  p_official boolean default false,
  p_position integer default 0,
  p_week_offset_end integer default null
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
    (cohort_id, program_id, label, week_offset, week_offset_end, official, position)
  values
    (p_cohort_id, v_program_id, btrim(p_label), p_week_offset, p_week_offset_end,
     coalesce(p_official, false), coalesce(p_position, 0))
  returning * into v_row;

  return v_row;
end;
$$;

drop function if exists public.update_plan_milestone(uuid, text, integer, boolean, integer);

-- ATTENTION AU PIEGE, et c'est pour cela qu'il y a un parametre de plus.
--
-- Cette fonction suit la convention du projet « NULL = inchange ». Mais sur
-- week_offset_end, NULL est une VALEUR qui veut dire quelque chose : « ce jalon
-- est ponctuel ». Sans `p_clear_week_offset_end`, on pourrait etaler un jalon
-- et plus jamais le ramener a une seule semaine — un aller sans retour, que
-- rien a l'ecran n'expliquerait.
create function public.update_plan_milestone(
  p_milestone_id uuid,
  p_label text,
  p_week_offset integer,
  p_official boolean,
  p_position integer,
  p_week_offset_end integer default null,
  p_clear_week_offset_end boolean default false
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
         week_offset_end = case
           when coalesce(p_clear_week_offset_end, false) then null
           else coalesce(p_week_offset_end, week_offset_end)
         end,
         official    = coalesce(p_official, official),
         position    = coalesce(p_position, position),
         updated_at  = now()
   where id = p_milestone_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function
  public.create_plan_milestone(uuid, text, integer, boolean, integer, integer)
  from public, anon, authenticated;
revoke all on function
  public.update_plan_milestone(uuid, text, integer, boolean, integer, integer, boolean)
  from public, anon, authenticated;

grant execute on function
  public.create_plan_milestone(uuid, text, integer, boolean, integer, integer)
  to authenticated;
grant execute on function
  public.update_plan_milestone(uuid, text, integer, boolean, integer, integer, boolean)
  to authenticated;
