-- ============================================================================
-- LES PIÈCES EXIGÉES REPRENNENT LE MODÈLE QUI EXISTAIT DÉJÀ DANS LE DÉPÔT.
--
-- Deuxième correction de ma part en deux heures, et elle va dans le même sens
-- que la première : j'ai modélisé sans regarder assez. `src/domain/
-- documentRequirement.ts` décrit depuis plusieurs jours une pièce exigée avec
-- QUI LA FOURNIT, QUI LA VALIDE, QUAND ELLE EST ATTENDUE et des notes. Ma
-- table du matin n'en gardait que l'intitulé.
--
-- LE POINT QUI COMPTE : L'ÉCHÉANCE EST UN MOMENT, PAS UNE SEMAINE.
-- J'avais écrit `due_week_offset`, en semaines depuis le début de promotion.
-- Le domaine dit mieux : « à l'inscription », « avant le début du stage »,
-- « à la fin du stage », « à la fin du programme ». Un catalogue ne connaît
-- pas les promotions — c'est justement ce qui en fait un catalogue. La colonne
-- en semaines disparaît (personne ne l'a encore remplie).
--
-- CE QUE ÇA DÉBLOQUE. `documentRequirementStore.ts` dit de lui-même : « Rien
-- n'est persisté : l'état disparaît au rechargement — c'est volontaire. » Ce
-- n'était volontaire que faute de table. Les pièces saisies dans le Concepteur
-- de programme survivront désormais au rechargement.
-- ============================================================================

do $$ begin
  create type public.document_provider as enum (
    'learner',
    'supervisor',
    'administration'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.document_validator as enum (
    'supervisor',
    'administration'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.document_due_moment as enum (
    'enrollment',
    'before_placement',
    'end_of_placement',
    'end_of_program'
  );
exception when duplicate_object then null;
end $$;

alter table public.admin_document_requirements
  add column if not exists provider public.document_provider
    not null default 'learner',
  add column if not exists validator public.document_validator
    not null default 'administration',
  add column if not exists due_moment public.document_due_moment
    not null default 'enrollment',
  add column if not exists notes text not null default '';

/* L'échéance en semaines était une erreur de modélisation : un catalogue ne
   connaît pas les promotions. Aucune ligne ne la porte encore. */
alter table public.admin_document_requirements
  drop column if exists due_week_offset;

/* La signature change : l'ancienne fonction part avec elle. */
drop function if exists public.declare_document_requirement(
  uuid, text, text, boolean, integer, integer);

create or replace function public.declare_document_requirement(
  p_program_id uuid,
  p_document_key text,
  p_label text,
  p_mandatory boolean default true,
  p_provider public.document_provider default 'learner',
  p_validator public.document_validator default 'administration',
  p_due_moment public.document_due_moment default 'enrollment',
  p_notes text default '',
  p_position integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Seule l''administration du programme définit les pièces exigées.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_label), '') = '' or coalesce(trim(p_document_key), '') = '' then
    raise exception 'Une pièce exigée a une clé et un libellé.'
      using errcode = 'check_violation';
  end if;

  insert into public.admin_document_requirements
    (program_id, document_key, label, mandatory, provider, validator,
     due_moment, notes, position, created_by)
  values
    (p_program_id, trim(p_document_key), trim(p_label), p_mandatory, p_provider,
     p_validator, p_due_moment, trim(coalesce(p_notes, '')), p_position, auth.uid())
  on conflict (program_id, document_key) do update
    set label = excluded.label,
        mandatory = excluded.mandatory,
        provider = excluded.provider,
        validator = excluded.validator,
        due_moment = excluded.due_moment,
        notes = excluded.notes,
        position = excluded.position,
        archived_at = null,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.declare_document_requirement(
  uuid, text, text, boolean, public.document_provider, public.document_validator,
  public.document_due_moment, text, integer) is
  'Déclare ou corrige une pièce exigée par un programme. Le catalogue ignore les promotions : l''échéance est un MOMENT, pas une date.';

grant execute on function public.declare_document_requirement(
  uuid, text, text, boolean, public.document_provider, public.document_validator,
  public.document_due_moment, text, integer) to authenticated;
