-- LOT A — Les epreuves datees, et la modification d'une modalite (14/09 soir).
--
-- CE QUI MANQUAIT. Une modalite dit COMMENT on evalue. Rien ne disait QUAND,
-- ni POUR QUELLE PROMOTION : le commentaire de table du 27/08 l'avait exclu
-- (« les sessions par cohorte restent hors perimetre »). Stef (14/09) veut un
-- onglet ou l'on voit tous les outils possibles, presents ou pas, configures,
-- associes ou non aux promotions. Ce lot pose les deux briques de base :
--   1. modifier une modalite en place — jusqu'ici la seule correction etait
--      d'archiver et de recreer ;
--   2. `assessment_sessions` : une modalite, une promotion, une date.
--
-- CE QUI RESTE HORS PERIMETRE. Les resultats (notes, taux de reussite) et la
-- lecture par l'etudiant : deux lots a part, qui s'appuieront sur ceci.

-- 1. Modifier une modalite ---------------------------------------------------
create or replace function public.update_assessment_modality(
  p_modality_id uuid,
  p_name text,
  p_mode text,
  p_subtype text,
  p_usage text,
  p_notes text default null
)
returns public.assessment_modalities
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.assessment_modalities;
begin
  select program_id into v_program_id
    from public.assessment_modalities where id = p_modality_id;
  if v_program_id is null then
    raise exception 'Modalité d''évaluation introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  update public.assessment_modalities
     set name    = btrim(p_name),
         mode    = p_mode,
         subtype = p_subtype,
         usage   = p_usage,
         notes   = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_modality_id
   returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_assessment_modality(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_assessment_modality(uuid, text, text, text, text, text)
  to authenticated;

-- 2. Une modalite appartient a un programme : la table des epreuves doit
--    pouvoir le garantir sans jointure. Meme procede que cohorts.
alter table public.assessment_modalities
  add constraint assessment_modalities_id_program_unique unique (id, program_id);

-- 3. Les epreuves datees ------------------------------------------------------
create table public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  -- Denormalise : la RLS decide sans jointure, et les deux contraintes
  -- composites ci-dessous garantissent qu'il ne peut pas mentir.
  program_id uuid not null,
  modality_id uuid not null,
  cohort_id uuid not null,
  scheduled_on date not null,
  location text check (location is null or length(btrim(location)) between 1 and 200),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_sessions_modality_same_program
    foreign key (modality_id, program_id)
    references public.assessment_modalities (id, program_id) on delete cascade,
  constraint assessment_sessions_cohort_same_program
    foreign key (cohort_id, program_id)
    references public.cohorts (id, program_id) on delete cascade,
  -- Une meme modalite, une meme promotion, un meme jour : une seule epreuve.
  unique (modality_id, cohort_id, scheduled_on)
);

comment on table public.assessment_sessions is
  'Une epreuve datee : une modalite d''evaluation du programme, programmee pour '
  'une promotion a une date. Les auto-evaluations n''en ont pas (elles sont en '
  'continu). Les resultats restent hors perimetre.';

create index assessment_sessions_cohort_idx
  on public.assessment_sessions (cohort_id, scheduled_on);
create index assessment_sessions_program_idx
  on public.assessment_sessions (program_id, scheduled_on);

create trigger assessment_sessions_set_updated_at
before update on public.assessment_sessions
for each row execute function public.set_updated_at();

revoke all on public.assessment_sessions from public, anon, authenticated;
alter table public.assessment_sessions enable row level security;
grant select on public.assessment_sessions to authenticated;

-- Lecture : l'equipe du programme. L'apprenant viendra dans un lot dedie, avec
-- la meme regle que pour les acquis (sa promotion, modalite retenue).
create policy assessment_sessions_select_staff on public.assessment_sessions
for select to authenticated
using (public.is_program_staff(program_id));

-- 4. Ecriture, par RPC uniquement --------------------------------------------
create or replace function public.create_assessment_session(
  p_modality_id uuid,
  p_cohort_id uuid,
  p_scheduled_on date,
  p_location text default null,
  p_notes text default null
)
returns public.assessment_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.assessment_sessions;
begin
  select program_id into v_program_id
    from public.assessment_modalities where id = p_modality_id and archived_at is null;
  if v_program_id is null then
    raise exception 'Modalité d''évaluation introuvable ou archivée.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  insert into public.assessment_sessions
    (program_id, modality_id, cohort_id, scheduled_on, location, notes)
  values
    (v_program_id, p_modality_id, p_cohort_id, p_scheduled_on,
     nullif(btrim(coalesce(p_location, '')), ''),
     nullif(btrim(coalesce(p_notes, '')), ''))
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.update_assessment_session(
  p_session_id uuid,
  p_scheduled_on date,
  p_location text default null,
  p_notes text default null
)
returns public.assessment_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.assessment_sessions;
begin
  select program_id into v_program_id from public.assessment_sessions where id = p_session_id;
  if v_program_id is null then
    raise exception 'Épreuve introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  update public.assessment_sessions
     set scheduled_on = p_scheduled_on,
         location     = nullif(btrim(coalesce(p_location, '')), ''),
         notes        = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_session_id
   returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_assessment_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
begin
  select program_id into v_program_id from public.assessment_sessions where id = p_session_id;
  if v_program_id is null then
    raise exception 'Épreuve introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  -- Suppression franche : une epreuve datee n'a pas d'historique a proteger
  -- tant que les resultats n'existent pas. A revoir quand ils arriveront.
  delete from public.assessment_sessions where id = p_session_id;
end;
$$;

revoke all on function public.create_assessment_session(uuid, uuid, date, text, text)
  from public, anon, authenticated;
revoke all on function public.update_assessment_session(uuid, date, text, text)
  from public, anon, authenticated;
revoke all on function public.delete_assessment_session(uuid)
  from public, anon, authenticated;
grant execute on function public.create_assessment_session(uuid, uuid, date, text, text)
  to authenticated;
grant execute on function public.update_assessment_session(uuid, date, text, text)
  to authenticated;
grant execute on function public.delete_assessment_session(uuid)
  to authenticated;
