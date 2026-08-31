-- Les themes : le chapitre au-dessus des acquis.
--
-- Demande de Stef (31/08) : sur un telephone, l'etudiant doit voir les TITRES
-- DE CHAPITRE, pas les 57 lignes du referentiel. Sept lignes qui se deplient,
-- pas cinquante-sept a plat.
--
-- POURQUOI UNE TABLE A PART, et non un parent_outcome_id sur outcomes.
-- Un acquis porte obligatoirement une NATURE (connaissance, competence simulee,
-- competence reelle) et un NIVEAU CIBLE. Or « Relationnel avec l'equipe
-- soignante » n'est ni une connaissance ni une competence, et l'etudiant n'y
-- declarera jamais un niveau : il declare sur les cinq competences en dessous,
-- et le theme affiche l'agregat. Lui inventer une nature serait un mensonge de
-- modele. Un theme n'est pas un acquis : c'est un rangement.
--
-- Consequence acceptee : la hierarchie est a DEUX niveaux, theme puis acquis.
-- Le referentiel de myDFASM (7 themes, 57 competences) et celui du college sont
-- plats sous leurs chapitres ; trois niveaux ne servent a rien aujourd'hui.

create table public.outcome_themes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 200),
  description text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, label),
  -- Cible de la cle etrangere composite posee sur outcomes : un acquis ne peut
  -- pas etre range sous un theme d'un AUTRE programme. C'est PostgreSQL qui le
  -- refuse, pas l'ecran.
  unique (id, program_id)
);

create index outcome_themes_program_idx on public.outcome_themes (program_id, position);

alter table public.outcome_themes enable row level security;
revoke all on public.outcome_themes from public, anon, authenticated;
grant select on public.outcome_themes to authenticated;

-- Meme portee que les acquis eux-memes : l'equipe du programme et l'apprenant
-- inscrit. Un theme sans acquis visible ne revele rien.
create policy outcome_themes_select on public.outcome_themes
for select to authenticated
using (
  public.is_program_staff(program_id)
  or public.is_enrolled_in_program(program_id)
);

-- Rangement d'un acquis. Nul = acquis non range, ce qui reste valide : le
-- referentiel existant (20 acquis DFASM-CARDIO) n'a pas de themes et ne doit
-- pas devenir invalide du jour au lendemain.
alter table public.outcomes
  add column theme_id uuid,
  add column position integer not null default 0;

-- La cle est COMPOSITE pour interdire de ranger un acquis sous le theme d'un
-- autre programme. Mais un « on delete set null » nu mettrait les DEUX colonnes
-- a null a la suppression du theme -- donc program_id, qui est not null, et la
-- suppression echouerait avec un message incomprehensible.
-- La liste de colonnes (PostgreSQL 15+) ne vide que theme_id : l'acquis
-- redevient non range, il ne perd pas son programme.
alter table public.outcomes
  add constraint outcomes_theme_same_program
  foreign key (theme_id, program_id)
  references public.outcome_themes (id, program_id)
  on delete set null (theme_id);

create index outcomes_theme_idx on public.outcomes (theme_id, position);

comment on column public.outcomes.theme_id is
  'Chapitre auquel appartient l''acquis. Nul = non range. Le theme est un rangement, jamais un acquis : il ne porte ni nature ni niveau cible.';
comment on column public.outcomes.position is
  'Ordre a l''interieur du theme (order_in_theme du referentiel source).';

/* ------------------------------------------------------------------ */
/* Ecriture : reservee a l'administration du programme                 */
/* ------------------------------------------------------------------ */

create function public.create_outcome_theme(
  p_program_id uuid,
  p_label text,
  p_description text default '',
  p_position integer default 0
) returns public.outcome_themes
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.outcome_themes;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  insert into public.outcome_themes (program_id, label, description, position)
  values (p_program_id, btrim(p_label), coalesce(p_description, ''), coalesce(p_position, 0))
  returning * into v_row;

  return v_row;
end;
$$;

create function public.update_outcome_theme(
  p_theme_id uuid,
  p_label text,
  p_description text,
  p_position integer
) returns public.outcome_themes
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.outcome_themes;
begin
  select t.program_id into v_program_id
  from public.outcome_themes t where t.id = p_theme_id;

  if v_program_id is null then
    raise exception 'Theme introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  update public.outcome_themes
     set label       = coalesce(btrim(p_label), label),
         description = coalesce(p_description, description),
         position    = coalesce(p_position, position),
         updated_at  = now()
   where id = p_theme_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Supprimer un theme ne supprime pas ses acquis : ils redeviennent non ranges.
-- C'est la cle etrangere qui s'en charge (on delete set null) ; cette fonction
-- ne fait que verifier les droits.
create function public.delete_outcome_theme(p_theme_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
begin
  select t.program_id into v_program_id
  from public.outcome_themes t where t.id = p_theme_id;

  if v_program_id is null then
    return;
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  delete from public.outcome_themes where id = p_theme_id;
end;
$$;

-- Ranger un lot d'acquis sous un theme, dans l'ordre donne. Le lot entier en un
-- appel, comme set_outcomes_retained et set_milestone_outcomes : l'ecran
-- enregistre l'etat complet d'une liste, et une bascule partielle laisserait
-- l'ecran et la base en desaccord.
--
-- p_theme_id nul retire les acquis de leur theme sans les archiver.
create function public.set_outcomes_theme(
  p_outcome_ids uuid[],
  p_theme_id uuid
) returns setof public.outcomes
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_theme_program uuid;
  v_foreign integer;
begin
  if p_outcome_ids is null or array_length(p_outcome_ids, 1) is null then
    return;
  end if;

  -- Autorisation par programme distinct, pas par ligne : un lot qui toucherait
  -- deux programmes echoue si l'un des deux est interdit.
  for v_program_id in
    select distinct program_id from public.outcomes where id = any (p_outcome_ids)
  loop
    if not public.can_administer_program(v_program_id) then
      raise exception 'Droits insuffisants pour ce programme.';
    end if;
  end loop;

  if p_theme_id is not null then
    select t.program_id into v_theme_program
    from public.outcome_themes t where t.id = p_theme_id;

    if v_theme_program is null then
      raise exception 'Theme introuvable.';
    end if;

    select count(*) into v_foreign
    from public.outcomes o
    where o.id = any (p_outcome_ids)
      and o.program_id is distinct from v_theme_program;

    if v_foreign > 0 then
      raise exception 'Un theme ne peut ranger que des acquis de son propre programme.';
    end if;
  end if;

  return query
    update public.outcomes o
       set theme_id = p_theme_id,
           position = coalesce(t.ord::integer, o.position)
      from unnest(p_outcome_ids) with ordinality as t(id, ord)
     where o.id = t.id
    returning o.*;
end;
$$;

revoke all on function public.create_outcome_theme(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.update_outcome_theme(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.delete_outcome_theme(uuid) from public, anon, authenticated;
revoke all on function public.set_outcomes_theme(uuid[], uuid) from public, anon, authenticated;

grant execute on function public.create_outcome_theme(uuid, text, text, integer) to authenticated;
grant execute on function public.update_outcome_theme(uuid, text, text, integer) to authenticated;
grant execute on function public.delete_outcome_theme(uuid) to authenticated;
grant execute on function public.set_outcomes_theme(uuid[], uuid) to authenticated;
