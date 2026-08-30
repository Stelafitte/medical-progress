-- RECONSTRUCTION (30/08/2026) : type, table et fonction existants en base sans
-- fichier de migration (chantier #3, connaissances et competences). C'est le
-- fichier auquel renvoie le commentaire "20260828_outcomes.sql" de
-- supabaseDataAccess.ts, qui n'avait jamais ete ecrit. Definition reelle relue
-- en base, sans modification de comportement.
--
-- La colonne archived_at n'est PAS declaree ici : elle est ajoutee par la
-- migration 20260829200000 (archivage reversible), qui doit rester posterieure.

create type public.outcome_nature as enum
  ('knowledge', 'simulated_competence', 'real_competence');

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  curriculum_version_id uuid not null
    references public.curriculum_versions (id) on delete cascade,
  code text not null,
  label text not null,
  description text not null default '',
  nature public.outcome_nature not null,
  domain text not null default '',
  target_mastery public.mastery_level not null default 'not_started',
  created_at timestamptz not null default now(),
  unique (program_id, code)
);

alter table public.outcomes enable row level security;

revoke all on public.outcomes from public, anon;
grant select on public.outcomes to authenticated;

create policy outcomes_select on public.outcomes
for select
using (public.is_program_staff(program_id));

-- Creation d'un acquis. L'ecriture directe n'est jamais ouverte : elle passe
-- par cette fonction, qui verifie les droits cote serveur.
create or replace function public.create_outcome(
  p_program_id uuid,
  p_curriculum_version_id uuid,
  p_code text,
  p_label text,
  p_description text,
  p_nature outcome_nature,
  p_domain text,
  p_target_mastery mastery_level
) returns public.outcomes
language plpgsql security definer
set search_path to 'public' as $function$
declare
  v_row public.outcomes;
begin
  if not can_administer_program(p_program_id) then
    raise exception 'not authorized';
  end if;

  insert into public.outcomes (
    program_id, curriculum_version_id, code, label, description, nature, domain, target_mastery
  )
  values (
    p_program_id, p_curriculum_version_id, p_code, p_label, p_description, p_nature, p_domain, p_target_mastery
  )
  returning * into v_row;

  return v_row;
end;
$function$;

grant execute on function public.create_outcome(uuid, uuid, text, text, text, outcome_nature, text, mastery_level)
to authenticated;
