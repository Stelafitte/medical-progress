-- Référentiel des modalités d'évaluation (« Évaluations » / pilotage de programme).
-- Périmètre : liste + création des modalités uniquement. Les sessions passées/à
-- venir par cohorte et l'import de résultats externes restent en maquette
-- (chantier séparé, aucune UI de création de session n'existe encore).

create table public.assessment_modalities (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  mode text not null check (mode in ('in_person', 'online')),
  subtype text not null check (
    subtype in ('oral', 'written', 'practical', 'qcm', 'simulation', 'ai_oral', 'case_study')
  ),
  usage text not null check (
    usage in ('self_assessment', 'formative', 'validation_exam', 'certification')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_modalities_subtype_matches_mode check (
    (mode = 'in_person' and subtype in ('oral', 'written', 'practical'))
    or (mode = 'online' and subtype in ('qcm', 'simulation', 'ai_oral', 'case_study'))
  ),
  unique (program_id, name)
);

comment on table public.assessment_modalities is
  'Référentiel des modalités d''évaluation d''un programme : type, sous-type et '
  'usage prévu. Alimente l''onglet « Évaluations » et la partie Évaluation du '
  'pilotage de programme. Les sessions par cohorte restent hors périmètre.';

create index assessment_modalities_program_idx
  on public.assessment_modalities (program_id, created_at);

create trigger assessment_modalities_set_updated_at
before update on public.assessment_modalities
for each row execute function public.set_updated_at();

-- Verrouillage total par défaut : aucun accès direct table, uniquement via RPC
-- et la policy de lecture ci-dessous (même pattern que learning_resources_and_pptx.sql).
revoke all on public.assessment_modalities from anon, authenticated;

alter table public.assessment_modalities enable row level security;

grant select on public.assessment_modalities to authenticated;

-- Lecture réservée à l'équipe du programme (enseignant, encadrant, administrateur
-- du programme ou de la plateforme) : réutilise is_program_staff, déjà défini
-- dans 20260821092000_rls_and_private_storage.sql. Aucun accès apprenant pour
-- l'instant : aucun écran apprenant ne consomme ce référentiel dans cette itération.
create policy assessment_modalities_select_scoped on public.assessment_modalities
for select to authenticated
using (public.is_program_staff(program_id));

-- Création : réservée à l'administration du programme, via can_administer_program
-- (même fonction que grant_role_assignment, le seul autre RPC SECURITY DEFINER de
-- ce type actuellement câblé côté client), déjà défini dans
-- 20260821092000_rls_and_private_storage.sql.
create or replace function public.create_assessment_modality(
  p_program_id uuid,
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
  created public.assessment_modalities;
  cleaned_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Droits insuffisants pour créer une modalité d''évaluation sur ce programme.';
  end if;

  insert into public.assessment_modalities (program_id, name, mode, subtype, usage, notes)
  values (p_program_id, btrim(p_name), p_mode, p_subtype, p_usage, cleaned_notes)
  returning * into created;

  return created;
end;
$$;

comment on function public.create_assessment_modality is
  'RPC SECURITY DEFINER : crée une modalité d''évaluation après vérification des '
  'droits (can_administer_program). Pas d''écriture dans audit_events (à la '
  'différence de grant_role_assignment) : à revalider si un besoin de trace '
  'apparaît pour ce référentiel.';

-- À exécuter séparément après validation (verrouillage des privilèges d'exécution) :
--
-- revoke all on function public.create_assessment_modality(uuid, text, text, text, text, text) from public, anon;
-- grant execute on function public.create_assessment_modality(uuid, text, text, text, text, text) to authenticated;
