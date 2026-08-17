-- =====================================================================
-- DRAFT — DO NOT EXECUTE
-- Passeport Éducatif Médical — Lot 1 — schéma cœur (conception)
-- Aucune base n'est activée, ce fichier n'est PAS une migration.
-- Il ne doit jamais être copié tel quel dans supabase/migrations/.
-- Cible : PostgreSQL 15+ / Supabase (schéma public, auth.users existant).
-- Aucun GRANT à anon. Aucune fonction mutante exposée. Aucun SECURITY DEFINER ici.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions attendues (déjà présentes sur Supabase)
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1. Types énumérés — miroir exact des unions TypeScript de src/domain/types.ts
-- ---------------------------------------------------------------------
do $$ begin
  create type public.program_kind as enum ('diu', 'dfasm', 'dpc', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.curriculum_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.enrollment_status as enum ('active', 'suspended', 'completed', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.role_name as enum
    ('learner', 'placement_supervisor', 'teacher', 'administrator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.role_scope_kind as enum ('platform', 'program', 'cohort', 'placement');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.outcome_nature as enum
    ('knowledge', 'simulated_competence', 'real_competence');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.mastery_level as enum
    ('not_started', 'novice', 'intermediate', 'proficient', 'autonomous');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.outcome_relation_kind as enum
    ('prerequisite_of', 'part_of', 'aligned_with', 'migrated_from');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.placement_assignment_status as enum
    ('planned', 'in_progress', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.evidence_kind as enum
    ('quiz', 'real_activity', 'simulation', 'placement', 'human_validation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.evidence_status as enum
    ('draft', 'submitted', 'validated', 'rejected', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.validation_decision as enum
    ('validated', 'rejected', 'needs_revision');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.learning_resource_format as enum
    ('course', 'video', 'quiz', 'checklist', 'reference');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.resource_asset_kind as enum
    ('original', 'derived', 'transcript', 'thumbnail');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.storage_provider as enum ('supabase', 's3', 'r2');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.asset_processing_status as enum
    ('pending', 'processing', 'ready', 'failed', 'quarantined');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Conventions transverses
--   * clé primaire : uuid default gen_random_uuid()
--   * horodatage   : created_at / updated_at timestamptz not null default now()
--   * provenance   : source_system ('native' par défaut), source_id, imported_at,
--                    import_batch_id — présents sur toute table susceptible
--                    d'accueillir des données historiques importées.
--   * la progression n'est JAMAIS stockée : elle est dérivée de public.evidence
--     + public.evidence_validations (cf. src/domain/mastery.ts).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 3. Identités
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null check (length(btrim(full_name)) between 1 and 200),
  -- Pas de mot de passe, pas d'email : auth.users reste la source de vérité
  -- pour les identifiants de connexion (email, MFA, providers).
  locale        text not null default 'fr-FR',
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_provenance_coherent
    check ((source_system = 'native') = (source_id is null))
);
comment on table public.profiles is
  'Données de profil applicatives. auth.users porte l''identité et l''email.';

-- ---------------------------------------------------------------------
-- 4. Programmes, curricula, cohortes
-- ---------------------------------------------------------------------
create table if not exists public.programs (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  kind          public.program_kind not null,
  institution   text not null,
  annual_learner_estimate integer not null default 0 check (annual_learner_estimate >= 0),
  -- Configuration par programme : un seul moteur, plusieurs configurations.
  placements_enabled  boolean not null default true,
  simulation_enabled  boolean not null default false,
  -- Invariant produit non négociable : une compétence réelle exige un tiers.
  real_competence_requires_validator boolean not null default true
    check (real_competence_requires_validator),
  target_mastery public.mastery_level not null default 'proficient',
  locale        text not null default 'fr-FR',
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on column public.programs.real_competence_requires_validator is
  'Toujours true : contrainte CHECK, la règle n''est pas désactivable par configuration.';

create table if not exists public.curriculum_versions (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.programs (id) on delete cascade,
  label         text not null,
  effective_from date not null,
  status        public.curriculum_status not null default 'draft',
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (program_id, label),
  -- Clé alternative servant de cible aux FK composites (garantit l'appartenance
  -- au bon programme sans dénormalisation incohérente).
  unique (id, program_id)
);
create index if not exists curriculum_versions_program_idx
  on public.curriculum_versions (program_id);

create table if not exists public.cohorts (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.programs (id) on delete restrict,
  curriculum_version_id uuid not null,
  label         text not null,
  academic_year text not null check (academic_year ~ '^[0-9]{4}-[0-9]{4}$'),
  starts_on     date not null,
  ends_on       date not null,
  learner_count integer not null default 0 check (learner_count >= 0),
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_on > starts_on),
  unique (program_id, label),
  unique (id, program_id),
  -- FK composite : la version de cursus doit appartenir au même programme.
  constraint cohorts_curriculum_same_program
    foreign key (curriculum_version_id, program_id)
    references public.curriculum_versions (id, program_id) on delete restrict
);
create index if not exists cohorts_program_idx on public.cohorts (program_id);

-- ---------------------------------------------------------------------
-- 5. Inscriptions — un compte, N inscriptions, N programmes
-- ---------------------------------------------------------------------
create table if not exists public.enrollments (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.profiles (id) on delete cascade,
  program_id    uuid not null,
  cohort_id     uuid not null,
  status        public.enrollment_status not null default 'active',
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Un apprenant n'est inscrit qu'une fois dans une cohorte donnée, mais peut
  -- être inscrit dans plusieurs cohortes et plusieurs programmes.
  unique (person_id, cohort_id),
  unique (id, person_id),
  unique (id, program_id),
  constraint enrollments_cohort_same_program
    foreign key (cohort_id, program_id)
    references public.cohorts (id, program_id) on delete restrict
);
create index if not exists enrollments_person_idx on public.enrollments (person_id);
create index if not exists enrollments_program_idx on public.enrollments (program_id, status);
comment on table public.enrollments is
  'Multi-programmes assumé : un seul compte auth peut porter plusieurs inscriptions.';

-- ---------------------------------------------------------------------
-- 6. Rôles contextualisés
-- ---------------------------------------------------------------------
-- Aucun rôle n'est stocké sur profiles : séparation obligatoire pour éviter
-- toute escalade de privilèges.
create table if not exists public.role_assignments (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.profiles (id) on delete cascade,
  role          public.role_name not null,
  scope_kind    public.role_scope_kind not null,
  program_id    uuid references public.programs (id) on delete cascade,
  cohort_id     uuid,
  placement_id  uuid,
  granted_at    timestamptz not null default now(),
  granted_by    uuid references public.profiles (id) on delete set null,
  revoked_at    timestamptz,
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Cohérence scope_kind / colonnes renseignées.
  constraint role_scope_columns_coherent check (
    case scope_kind
      when 'platform'  then program_id is null and cohort_id is null and placement_id is null
      when 'program'   then program_id is not null and cohort_id is null and placement_id is null
      when 'cohort'    then program_id is not null and cohort_id is not null and placement_id is null
      when 'placement' then program_id is not null and placement_id is not null and cohort_id is null
    end
  ),
  -- Cohérence rôle / portée (miroir de isRoleScopeConsistent).
  constraint role_scope_kind_allowed check (
    case role
      when 'learner'              then scope_kind in ('cohort', 'program')
      when 'placement_supervisor' then scope_kind = 'placement'
      when 'teacher'              then scope_kind in ('program', 'cohort')
      when 'administrator'        then scope_kind in ('platform', 'program')
    end
  ),
  constraint role_assignments_cohort_same_program
    foreign key (cohort_id, program_id) references public.cohorts (id, program_id)
    on delete cascade
);
create unique index if not exists role_assignments_unique_active
  on public.role_assignments (
    person_id, role, scope_kind,
    coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(cohort_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(placement_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where (revoked_at is null);
create index if not exists role_assignments_person_idx
  on public.role_assignments (person_id) where (revoked_at is null);
comment on table public.role_assignments is
  'Rôles contextualisés. Jamais modifiable par le titulaire (cf. 002_rls_policies.sql).';

-- ---------------------------------------------------------------------
-- 7. Référentiel d'acquis
-- ---------------------------------------------------------------------
create table if not exists public.outcomes (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null,
  curriculum_version_id uuid not null,
  code          text not null,
  label         text not null,
  description   text not null default '',
  nature        public.outcome_nature not null,
  domain        text not null,
  target_mastery public.mastery_level not null default 'proficient',
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (curriculum_version_id, code),
  unique (id, program_id),
  constraint outcomes_curriculum_same_program
    foreign key (curriculum_version_id, program_id)
    references public.curriculum_versions (id, program_id) on delete cascade
);
create index if not exists outcomes_program_nature_idx
  on public.outcomes (program_id, nature);
comment on column public.outcomes.nature is
  'knowledge | simulated_competence | real_competence — distinction structurante du socle.';

create table if not exists public.outcome_relations (
  from_outcome_id uuid not null references public.outcomes (id) on delete cascade,
  to_outcome_id   uuid not null references public.outcomes (id) on delete cascade,
  kind            public.outcome_relation_kind not null,
  source_system   text not null default 'native',
  source_id       text,
  imported_at     timestamptz,
  import_batch_id uuid,
  created_at      timestamptz not null default now(),
  primary key (from_outcome_id, to_outcome_id, kind),
  check (from_outcome_id <> to_outcome_id)
);
comment on table public.outcome_relations is
  'Graphe des acquis. migrated_from / aligned_with rattachent les 57 compétences historiques.';

-- ---------------------------------------------------------------------
-- 8. Ressources pédagogiques
-- ---------------------------------------------------------------------
create table if not exists public.learning_resources (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.programs (id) on delete cascade,
  title         text not null,
  format        public.learning_resource_format not null,
  estimated_minutes integer not null default 0 check (estimated_minutes >= 0),
  is_published  boolean not null default false,
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, program_id)
);
create index if not exists learning_resources_program_idx
  on public.learning_resources (program_id, is_published);

-- Table de liaison N-N : pas de tableau d'ids dénormalisé côté SQL.
create table if not exists public.learning_resource_outcomes (
  learning_resource_id uuid not null,
  outcome_id           uuid not null,
  program_id           uuid not null,
  created_at           timestamptz not null default now(),
  primary key (learning_resource_id, outcome_id),
  constraint lro_resource_same_program
    foreign key (learning_resource_id, program_id)
    references public.learning_resources (id, program_id) on delete cascade,
  constraint lro_outcome_same_program
    foreign key (outcome_id, program_id)
    references public.outcomes (id, program_id) on delete cascade
);
create index if not exists lro_outcome_idx on public.learning_resource_outcomes (outcome_id);

-- Métadonnées des fichiers pédagogiques. AUCUN binaire en base, AUCUNE URL
-- publique durable stockée : seul le couple (bucket privé, object_path) est
-- conservé, l'accès se fait par URL signée courte générée côté serveur.
-- Voir docs/database/draft/storage_architecture.md.
create table if not exists public.learning_resource_assets (
  id            uuid primary key default gen_random_uuid(),
  learning_resource_id uuid not null,
  program_id    uuid not null,
  asset_kind    public.resource_asset_kind not null,
  storage_provider public.storage_provider not null default 'supabase',
  bucket_name   text not null check (bucket_name = lower(bucket_name)),
  object_path   text not null check (length(btrim(object_path)) > 0),
  mime_type     text not null,
  original_filename text,
  byte_size     bigint not null check (byte_size >= 0),
  checksum_sha256 text check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  processing_status public.asset_processing_status not null default 'pending',
  -- Un chemin d'objet ne doit jamais ressembler à une URL absolue.
  check (object_path not like 'http://%' and object_path not like 'https://%'),
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (storage_provider, bucket_name, object_path),
  -- program_id verrouillé par la ressource parente : pas de fuite inter-programme.
  constraint lra_resource_same_program
    foreign key (learning_resource_id, program_id)
    references public.learning_resources (id, program_id) on delete cascade
);
create index if not exists lra_resource_idx
  on public.learning_resource_assets (learning_resource_id, asset_kind);
create index if not exists lra_status_idx
  on public.learning_resource_assets (processing_status);
comment on table public.learning_resource_assets is
  'Métadonnées d''objets stockés hors base (buckets privés). Jamais de binaire, '
  'jamais d''URL publique durable. RLS calquée sur la ressource parente.';

-- ---------------------------------------------------------------------
-- 9. Stages
-- ---------------------------------------------------------------------
create table if not exists public.placements (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.programs (id) on delete cascade,
  name          text not null,
  site          text not null,
  department    text not null,
  capacity      integer not null default 0 check (capacity >= 0),
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, program_id)
);
create index if not exists placements_program_idx on public.placements (program_id);

-- FK différée du scope placement des rôles vers placements.
-- Ajout idempotent : le fichier doit pouvoir être relu sans erreur.
do $$ begin
  alter table public.role_assignments
    add constraint role_assignments_placement_same_program
    foreign key (placement_id, program_id)
    references public.placements (id, program_id) on delete cascade;
exception
  when duplicate_object then null;
  when duplicate_table then null;
end $$;

-- Encadrants d'un stage : source de vérité de l'autorisation "superviseur".
create table if not exists public.placement_supervisors (
  placement_id  uuid not null,
  program_id    uuid not null,
  person_id     uuid not null references public.profiles (id) on delete cascade,
  is_lead       boolean not null default false,
  starts_on     date,
  ends_on       date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (placement_id, person_id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint placement_supervisors_same_program
    foreign key (placement_id, program_id)
    references public.placements (id, program_id) on delete cascade
);
create index if not exists placement_supervisors_person_idx
  on public.placement_supervisors (person_id);
comment on table public.placement_supervisors is
  'Un encadrant n''est encadrant que pour les stages listés ici — jamais globalement.';

create table if not exists public.placement_assignments (
  id            uuid primary key default gen_random_uuid(),
  placement_id  uuid not null,
  enrollment_id uuid not null,
  program_id    uuid not null,
  supervisor_person_id uuid references public.profiles (id) on delete set null,
  starts_on     date not null,
  ends_on       date not null,
  status        public.placement_assignment_status not null default 'planned',
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (placement_id, enrollment_id, starts_on),
  unique (id, enrollment_id),
  unique (id, placement_id),
  constraint pa_placement_same_program
    foreign key (placement_id, program_id)
    references public.placements (id, program_id) on delete restrict,
  constraint pa_enrollment_same_program
    foreign key (enrollment_id, program_id)
    references public.enrollments (id, program_id) on delete cascade,
  -- Le référent nommé doit être un encadrant déclaré de ce stage.
  constraint pa_supervisor_is_declared
    foreign key (placement_id, supervisor_person_id)
    references public.placement_supervisors (placement_id, person_id) on delete set null
);
create index if not exists pa_enrollment_idx on public.placement_assignments (enrollment_id);
create index if not exists pa_placement_idx on public.placement_assignments (placement_id, status);

-- ---------------------------------------------------------------------
-- 10. Preuves
-- ---------------------------------------------------------------------
create table if not exists public.evidence (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  outcome_id    uuid not null,
  program_id    uuid not null,
  kind          public.evidence_kind not null,
  status        public.evidence_status not null default 'draft',
  title         text not null check (length(btrim(title)) between 1 and 300),
  occurred_at   timestamptz not null,
  -- Résultat brut et lecture pédagogique proposée (jamais une vérité de progression).
  score_raw       numeric(6, 2),
  score_max       numeric(6, 2),
  proposed_mastery public.mastery_level,
  autonomy_level   smallint check (autonomy_level between 1 and 5),
  repetition_count integer not null default 1 check (repetition_count >= 1),
  confidence_level smallint check (confidence_level between 1 and 5),
  context       jsonb not null default '{}'::jsonb,
  self_declared boolean not null default true,
  created_by    uuid not null references public.profiles (id) on delete restrict,
  placement_assignment_id uuid,
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (score_max is null or score_max > 0),
  check (score_raw is null or (score_max is not null and score_raw between 0 and score_max)),
  -- Une preuve de stage doit être rattachée à une affectation de stage.
  check (kind <> 'placement' or placement_assignment_id is not null),
  constraint evidence_outcome_same_program
    foreign key (outcome_id, program_id)
    references public.outcomes (id, program_id) on delete restrict,
  constraint evidence_enrollment_same_program
    foreign key (enrollment_id, program_id)
    references public.enrollments (id, program_id) on delete cascade,
  -- L'affectation de stage doit appartenir à la même inscription.
  constraint evidence_pa_same_enrollment
    foreign key (placement_assignment_id, enrollment_id)
    references public.placement_assignments (id, enrollment_id) on delete restrict
);
create index if not exists evidence_enrollment_idx on public.evidence (enrollment_id, status);
create index if not exists evidence_outcome_idx on public.evidence (outcome_id);
create index if not exists evidence_pa_idx on public.evidence (placement_assignment_id);
create index if not exists evidence_program_status_idx on public.evidence (program_id, status);
comment on table public.evidence is
  'Source unique de la progression. Aucune table de progression n''est stockée : '
  'le niveau de maîtrise est recalculé depuis evidence + evidence_validations.';
comment on column public.evidence.proposed_mastery is
  'Niveau PROPOSÉ (déclaratif ou calculé à la saisie). N''implique jamais l''acquisition.';
comment on column public.evidence.status is
  'Le passage à validated est réservé au serveur après une validation tierce autorisée.';

-- Pièces / sources rattachées à une preuve (fichier, tentative de QCM, session ECOS…).
create table if not exists public.evidence_sources (
  id            uuid primary key default gen_random_uuid(),
  evidence_id   uuid not null references public.evidence (id) on delete cascade,
  source_kind   text not null check (source_kind in
                  ('file', 'quiz_attempt', 'simulation_session', 'external_link', 'legacy_state')),
  storage_path  text,
  external_ref  text,
  payload       jsonb not null default '{}'::jsonb,
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  check (storage_path is not null or external_ref is not null or payload <> '{}'::jsonb)
);
create index if not exists evidence_sources_evidence_idx
  on public.evidence_sources (evidence_id);

-- Journal append-only des décisions de validation.
create table if not exists public.evidence_validations (
  id            uuid primary key default gen_random_uuid(),
  evidence_id   uuid not null references public.evidence (id) on delete restrict,
  validator_person_id uuid not null references public.profiles (id) on delete restrict,
  validator_role public.role_name not null
    check (validator_role in ('placement_supervisor', 'teacher', 'administrator')),
  decision      public.validation_decision not null,
  comment       text,
  decided_at    timestamptz not null default now(),
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now()
);
create index if not exists evidence_validations_evidence_idx
  on public.evidence_validations (evidence_id, decided_at desc);
create index if not exists evidence_validations_validator_idx
  on public.evidence_validations (validator_person_id);
comment on table public.evidence_validations is
  'Append-only : aucune UPDATE/DELETE (ni client ni RLS). Une décision erronée est '
  'corrigée par une nouvelle décision, jamais par réécriture. Un validateur ne peut '
  'jamais être l''auteur de la preuve (contrôlé par RLS + service serveur).';

-- ---------------------------------------------------------------------
-- 11. Audit et comptabilité IA
-- ---------------------------------------------------------------------
create table if not exists public.audit_events (
  id            uuid primary key default gen_random_uuid(),
  actor_person_id uuid references public.profiles (id) on delete set null, -- null = système
  action        text not null,
  target_type   text not null,
  target_id     text not null,
  program_id    uuid references public.programs (id) on delete set null,
  detail        jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists audit_events_target_idx
  on public.audit_events (target_type, target_id, occurred_at desc);
create index if not exists audit_events_program_idx
  on public.audit_events (program_id, occurred_at desc);
comment on table public.audit_events is
  'Écriture serveur/service_role uniquement. Aucun INSERT/UPDATE/DELETE client.';

create table if not exists public.ai_usage_events (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid references public.profiles (id) on delete set null,
  program_id    uuid references public.programs (id) on delete set null,
  enrollment_id uuid,
  feature       text not null,
  provider      text not null default 'openai',
  model         text not null,
  input_tokens  integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  audio_seconds numeric(10, 2) not null default 0 check (audio_seconds >= 0),
  cost_micro_eur bigint not null default 0 check (cost_micro_eur >= 0),
  request_ref   text,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  -- Une consommation rattachée à une inscription impose programme ET personne :
  -- impossible d'imputer un appel IA à un programme qui n'est pas celui de
  -- l'inscription, ni à une personne qui n'en est pas le titulaire.
  constraint ai_usage_enrollment_same_program
    foreign key (enrollment_id, program_id)
    references public.enrollments (id, program_id) on delete set null,
  constraint ai_usage_enrollment_same_person
    foreign key (enrollment_id, person_id)
    references public.enrollments (id, person_id) on delete set null,
  -- Cohérence des null : les FK composites sont MATCH SIMPLE, donc inertes dès
  -- qu'une colonne est null ; ce CHECK ferme la porte laissée ouverte.
  constraint ai_usage_null_coherence check (
    enrollment_id is null
    or (program_id is not null and person_id is not null)
  )
);
create index if not exists ai_usage_program_time_idx
  on public.ai_usage_events (program_id, occurred_at desc);
create index if not exists ai_usage_person_time_idx
  on public.ai_usage_events (person_id, occurred_at desc);
comment on table public.ai_usage_events is
  'Comptabilité de tout appel IA. Écrit exclusivement par le serveur (service_role).';

create table if not exists public.ai_quota_policies (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.programs (id) on delete cascade,
  feature       text not null,
  window_kind   text not null check (window_kind in ('day', 'week', 'month', 'program')),
  max_requests  integer check (max_requests >= 0),
  max_cost_micro_eur bigint check (max_cost_micro_eur >= 0),
  max_audio_seconds  integer check (max_audio_seconds >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (program_id, feature, window_kind),
  check (max_requests is not null or max_cost_micro_eur is not null
         or max_audio_seconds is not null)
);
comment on table public.ai_quota_policies is
  'Quotas IA configurables par programme. Lecture réservée aux admins de portée.';

-- ---------------------------------------------------------------------
-- 12. GRANTS — un privilège pour CHAQUE policy, et rien de plus
-- ---------------------------------------------------------------------
-- Règle de cohérence (checklist : docs/database/draft/grant_policy_checklist.md) :
--   * toute table ayant une policy SELECT reçoit GRANT SELECT ;
--   * toute table SANS policy pour une opération ne reçoit PAS le privilège ;
--   * les tables sensibles reçoivent des GRANT de COLONNES, pour que même une
--     policy trop permissive ne puisse pas laisser réécrire une colonne
--     d'identité, de provenance ou de statut.
-- La RLS reste la barrière d'autorisation ; les GRANT sont la barrière de surface.

-- 12.1 Lecture — toutes les tables ayant au moins une policy SELECT
grant select on
  public.profiles,
  public.programs,
  public.curriculum_versions,
  public.cohorts,
  public.enrollments,
  public.role_assignments,
  public.outcomes,
  public.outcome_relations,
  public.learning_resources,
  public.learning_resource_outcomes,
  public.learning_resource_assets,
  public.placements,
  public.placement_supervisors,
  public.placement_assignments,
  public.evidence,
  public.evidence_sources,
  public.evidence_validations,
  public.audit_events,
  public.ai_usage_events,
  public.ai_quota_policies
  to authenticated;
-- audit_events / ai_usage_events : SELECT seulement (policies admin + self).
-- L'écriture reste exclusivement service_role — aucune policy INSERT n'existe.

-- 12.2 Tables d'administration — DML complet côté privilèges, RLS filtrante
grant insert, update, delete on
  public.programs,
  public.curriculum_versions,
  public.cohorts,
  public.enrollments,
  public.learning_resources,
  public.placements,
  public.placement_supervisors,
  public.placement_assignments,
  public.outcomes,
  public.ai_quota_policies
  to authenticated;

-- learning_resource_assets : AUCUN privilège d'écriture client (12.8).
-- L'écriture des métadonnées de fichier est exclusivement serveur.

-- Tables sans policy UPDATE : on n'accorde pas UPDATE.
grant insert, delete on
  public.outcome_relations,
  public.learning_resource_outcomes
  to authenticated;

-- role_assignments : jamais de DELETE client (révocation par revoked_at).
grant insert, update on public.role_assignments to authenticated;

-- 12.3 profiles — GRANT DE COLONNES
-- Un utilisateur ne peut écrire que son nom d'affichage et sa locale. Les
-- colonnes de provenance legacy (source_system, source_id, imported_at,
-- import_batch_id), created_at et updated_at ne sont pas accordées :
-- falsification d'origine impossible, et updated_at est imposé par le trigger
-- serveur set_updated_at() (003_server_invariants.sql).
grant insert (id, full_name, locale) on public.profiles to authenticated;
grant update (full_name, locale) on public.profiles to authenticated;


-- 12.4 evidence — GRANT DE COLONNES
-- INSERT : le client fournit l'identité de la preuve (une seule fois).
grant insert (
  enrollment_id, outcome_id, program_id, kind, status, title, occurred_at,
  score_raw, score_max, proposed_mastery, autonomy_level, repetition_count,
  confidence_level, context, self_declared, created_by, placement_assignment_id
) on public.evidence to authenticated;
-- UPDATE : les colonnes d'identité et de provenance sont DÉLIBÉRÉMENT absentes.
-- enrollment_id, program_id, outcome_id, created_by, self_declared,
-- placement_assignment_id, source_system, source_id, imported_at,
-- import_batch_id, created_at ne sont donc plus modifiables après création,
-- par privilège et non seulement par policy.
-- updated_at n'est pas accordé : il est imposé par set_updated_at().
grant update (
  title, occurred_at, score_raw, score_max, proposed_mastery, autonomy_level,
  repetition_count, confidence_level, context, status
) on public.evidence to authenticated;
-- Aucun GRANT DELETE : une preuve ne se supprime pas, elle change de statut.

-- 12.5 evidence_sources / evidence_validations — GRANT DE COLONNES
-- Les colonnes de provenance ne sont pas accordées : un client ne peut pas
-- inventer un source_system / source_id / import_batch_id et faire passer une
-- saisie native pour une donnée historique importée.
grant insert (evidence_id, source_kind, storage_path, external_ref, payload)
  on public.evidence_sources to authenticated;
grant insert (evidence_id, validator_person_id, validator_role, decision, comment)
  on public.evidence_validations to authenticated;
-- Aucun UPDATE/DELETE : les deux tables sont append-only.

-- 12.6 service_role — bypass RLS, jamais utilisé côté frontend
grant all on
  public.profiles, public.programs, public.curriculum_versions, public.cohorts,
  public.enrollments, public.role_assignments, public.outcomes,
  public.outcome_relations, public.learning_resources,
  public.learning_resource_outcomes, public.learning_resource_assets,
  public.placements, public.placement_supervisors, public.placement_assignments,
  public.evidence, public.evidence_sources, public.evidence_validations,
  public.audit_events, public.ai_usage_events, public.ai_quota_policies
  to service_role;

-- 12.7 anon — aucun privilège, sur aucune table, volontairement.
-- Liste EXPLICITE des tables de ce draft : on ne révoque pas en masse sur
-- schema public, pour ne jamais toucher par surprise un objet ajouté plus tard
-- par une autre fonctionnalité (ou par une intégration managée).
revoke all on
  public.profiles, public.programs, public.curriculum_versions, public.cohorts,
  public.enrollments, public.role_assignments, public.outcomes,
  public.outcome_relations, public.learning_resources,
  public.learning_resource_outcomes, public.learning_resource_assets,
  public.placements, public.placement_supervisors, public.placement_assignments,
  public.evidence, public.evidence_sources, public.evidence_validations,
  public.audit_events, public.ai_usage_events, public.ai_quota_policies
  from anon;

-- 12.8 learning_resource_assets — ÉCRITURE SERVEUR UNIQUEMENT
-- Le navigateur ne choisit jamais bucket_name, object_path, storage_provider,
-- checksum_sha256, byte_size ni processing_status. Aucun GRANT
-- INSERT/UPDATE/DELETE à authenticated ; seul service_role écrit (12.6), après
-- revérification de l'autorisation métier côté backend (service_role contourne
-- la RLS). Flux détaillé : storage_architecture.md §2.


-- =====================================================================
-- 13. PLAN D'ACQUISITION ET PRÉFÉRENCES DE PARTAGE
-- Alignement de nommage avec le bloc UI déjà livré (une seule vérité) :
--   AcquisitionPlanItem   -> public.acquisition_plan_items
--   AcquisitionPlanTrack  -> DÉRIVÉE de outcomes.nature (aucune colonne track)
--   PlanChangeRequest     -> public.plan_change_requests
-- Le frontend nomme 'accepted' ce que la base nomme 'approved' (vocabulaire
-- décisionnel SQL) ; le mapping est documenté dans plan_acquisition_architecture.md
-- et reste le seul point de traduction autorisé.
-- =====================================================================

-- 13.1 Types énumérés du plan
do $$ begin
  create type public.plan_template_status as enum ('draft', 'published', 'retired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.acquisition_plan_status as enum ('active', 'archived');
exception when duplicate_object then null; end $$;

-- État de PLANIFICATION uniquement. 'done' = action planifiée terminée.
-- 'done' ne signifie JAMAIS « connaissance acquise » ni « compétence acquise » :
-- la maîtrise reste dérivée de public.evidence + public.evidence_validations
-- (cf. src/domain/mastery.ts). La colonne Kanban « Acquis » du frontend est
-- calculée depuis les preuves, pas depuis cette colonne.
do $$ begin
  create type public.plan_item_progress_state as enum
    ('to_plan', 'in_progress', 'to_validate', 'done');
exception when duplicate_object then null; end $$;

-- Impact d'une demande de modification. Les trois valeurs officielles
-- (official_deadline, prerequisite, required_outcome) sont regroupées côté UI
-- sous l'étiquette « échéance officielle ».
do $$ begin
  create type public.plan_change_impact as enum
    ('personal_target', 'personal_pace', 'official_deadline',
     'prerequisite', 'required_outcome', 'clinical_competence');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.plan_approval_rule as enum
    ('auto_accept', 'teacher_or_admin', 'placement_supervisor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.plan_change_status as enum
    ('draft', 'pending', 'approved', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.plan_decision as enum ('approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 13.2 acquisition_plan_templates — modèle versionné défini par admin
-- Un template publié est IMMUABLE : une évolution crée une nouvelle version
-- (invariant appliqué par trigger, 003 §6).
-- ---------------------------------------------------------------------
create table if not exists public.acquisition_plan_templates (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null,
  curriculum_version_id uuid not null,
  -- Optionnel : un template peut viser une cohorte précise (sinon tout le cursus).
  cohort_id     uuid,
  name          text not null check (length(btrim(name)) between 1 and 200),
  version_number integer not null check (version_number >= 1),
  status        public.plan_template_status not null default 'draft',
  published_at  timestamptz,
  retired_at    timestamptz,
  created_by    uuid references public.profiles (id) on delete set null,
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, program_id),
  unique (program_id, curriculum_version_id, cohort_id, version_number),
  constraint apt_provenance_coherent
    check ((source_system = 'native') = (source_id is null)),
  constraint apt_published_has_date
    check ((status = 'draft') = (published_at is null)),
  -- FK COMPOSITES : impossible de rattacher un cursus ou une cohorte
  -- appartenant à un autre programme.
  constraint apt_curriculum_same_program
    foreign key (curriculum_version_id, program_id)
    references public.curriculum_versions (id, program_id) on delete restrict,
  constraint apt_cohort_same_program
    foreign key (cohort_id, program_id)
    references public.cohorts (id, program_id) on delete restrict
);
create index if not exists apt_program_idx
  on public.acquisition_plan_templates (program_id, status);
comment on table public.acquisition_plan_templates is
  'Modèle de plan d''acquisition versionné. Un template published est immuable : '
  'toute évolution crée une nouvelle version_number.';

-- ---------------------------------------------------------------------
-- 13.3 acquisition_plan_template_items
-- La piste (connaissances / compétences) est DÉRIVÉE de outcomes.nature :
-- aucune colonne track ici, donc aucune nature incohérente possible.
-- ---------------------------------------------------------------------
create table if not exists public.acquisition_plan_template_items (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null,
  program_id    uuid not null,
  outcome_id    uuid not null,
  sequence      integer not null check (sequence >= 0),
  official_start_at timestamptz,
  official_due_at   timestamptz,
  is_mandatory  boolean not null default true,
  placement_required boolean not null default false,
  -- Paramètres pédagogiques bornés (durée conseillée, répétitions, modalité…).
  pedagogy_params jsonb not null default '{}'::jsonb,
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, template_id),
  unique (id, program_id),
  unique (template_id, outcome_id),
  unique (template_id, sequence) deferrable initially deferred,
  constraint apti_window_ordered
    check (official_due_at is null or official_start_at is null
           or official_due_at >= official_start_at),
  constraint apti_params_object
    check (jsonb_typeof(pedagogy_params) = 'object'
           and pg_catalog.length(pedagogy_params::text) <= 4000),
  constraint apti_provenance_coherent
    check ((source_system = 'native') = (source_id is null)),
  constraint apti_template_same_program
    foreign key (template_id, program_id)
    references public.acquisition_plan_templates (id, program_id) on delete cascade,
  constraint apti_outcome_same_program
    foreign key (outcome_id, program_id)
    references public.outcomes (id, program_id) on delete restrict
);
create index if not exists apti_template_idx
  on public.acquisition_plan_template_items (template_id, sequence);

-- Prérequis entre items d'un MÊME template (graphe, pas d'arbre).
create table if not exists public.acquisition_plan_template_item_dependencies (
  template_id   uuid not null,
  item_id       uuid not null,
  depends_on_item_id uuid not null,
  relation_kind public.outcome_relation_kind not null default 'prerequisite_of',
  source_system text not null default 'native',
  source_id     text,
  created_at    timestamptz not null default now(),
  primary key (item_id, depends_on_item_id),
  -- Anti auto-dépendance.
  constraint aptid_no_self check (item_id <> depends_on_item_id),
  constraint aptid_provenance_coherent
    check ((source_system = 'native') = (source_id is null)),
  -- Les deux items doivent appartenir AU MÊME template.
  constraint aptid_item_in_template
    foreign key (item_id, template_id)
    references public.acquisition_plan_template_items (id, template_id) on delete cascade,
  constraint aptid_dep_in_template
    foreign key (depends_on_item_id, template_id)
    references public.acquisition_plan_template_items (id, template_id) on delete cascade
);
comment on table public.acquisition_plan_template_item_dependencies is
  'Prérequis intra-template. L''absence de cycle n''est pas exprimable en '
  'contrainte déclarative : elle est vérifiée par le backend à la publication '
  '(cf. plan_acquisition_architecture.md §4).';

-- ---------------------------------------------------------------------
-- 13.4 acquisition_plans — instance individualisée
-- ---------------------------------------------------------------------
create table if not exists public.acquisition_plans (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  program_id    uuid not null,
  template_id   uuid not null,
  status        public.acquisition_plan_status not null default 'active',
  activated_at  timestamptz not null default now(),
  archived_at   timestamptz,
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, enrollment_id),
  unique (id, program_id),
  unique (id, template_id),
  -- Un seul plan actif par inscription (index partiel, pas de contrainte molle).
  constraint ap_archived_coherent
    check ((status = 'archived') = (archived_at is not null)),
  constraint ap_provenance_coherent
    check ((source_system = 'native') = (source_id is null)),
  constraint ap_enrollment_same_program
    foreign key (enrollment_id, program_id)
    references public.enrollments (id, program_id) on delete cascade,
  constraint ap_template_same_program
    foreign key (template_id, program_id)
    references public.acquisition_plan_templates (id, program_id) on delete restrict
);
create unique index if not exists ap_one_active_per_enrollment
  on public.acquisition_plans (enrollment_id) where (status = 'active');

-- ---------------------------------------------------------------------
-- 13.5 acquisition_plan_items — source UNIQUE des vues Liste / Kanban / Gantt / Calendrier
-- Dates officielles (institution) et cible personnelle (apprenant) sont
-- DEUX colonnes distinctes : l'apprenant n'écrase jamais une échéance officielle.
-- ---------------------------------------------------------------------
create table if not exists public.acquisition_plan_items (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null,
  enrollment_id uuid not null,
  program_id    uuid not null,
  outcome_id    uuid not null,
  template_item_id uuid,
  sequence      integer not null check (sequence >= 0),
  official_start_at timestamptz,
  official_due_at   timestamptz,
  -- Cible que l'apprenant se fixe, toujours dans les bornes officielles.
  learner_target_at timestamptz,
  is_mandatory  boolean not null default true,
  -- État de PLANIFICATION, jamais un état d'acquisition (cf. 13.1).
  progress_state public.plan_item_progress_state not null default 'to_plan',
  placement_assignment_id uuid,
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, enrollment_id),
  unique (id, program_id),
  unique (plan_id, outcome_id),
  constraint api_window_ordered
    check (official_due_at is null or official_start_at is null
           or official_due_at >= official_start_at),
  constraint api_provenance_coherent
    check ((source_system = 'native') = (source_id is null)),
  constraint api_plan_same_enrollment
    foreign key (plan_id, enrollment_id)
    references public.acquisition_plans (id, enrollment_id) on delete cascade,
  constraint api_plan_same_program
    foreign key (plan_id, program_id)
    references public.acquisition_plans (id, program_id) on delete cascade,
  constraint api_outcome_same_program
    foreign key (outcome_id, program_id)
    references public.outcomes (id, program_id) on delete restrict,
  constraint api_template_item_same_program
    foreign key (template_item_id, program_id)
    references public.acquisition_plan_template_items (id, program_id) on delete set null,
  -- Le stage rattaché doit être un stage DE CET APPRENANT.
  constraint api_placement_same_enrollment
    foreign key (placement_assignment_id, enrollment_id)
    references public.placement_assignments (id, enrollment_id) on delete set null
);
create index if not exists api_enrollment_idx
  on public.acquisition_plan_items (enrollment_id, sequence);
create index if not exists api_calendar_idx
  on public.acquisition_plan_items (program_id, official_due_at);
create index if not exists api_placement_idx
  on public.acquisition_plan_items (placement_assignment_id);
comment on table public.acquisition_plan_items is
  'Une ligne = un élément planifié. Les quatre vues du frontend (Liste, Kanban, '
  'Gantt, Calendrier) sont des projections de CETTE table ; aucune vue ne '
  'possède sa propre table. progress_state est un état de planification.';

-- ---------------------------------------------------------------------
-- 13.6 plan_change_requests — demande de modification par l'apprenant
-- change_impact et required_approver_role sont DÉRIVÉS par trigger (003 §7) :
-- aucun GRANT client sur ces colonnes (13.9).
-- ---------------------------------------------------------------------
create table if not exists public.plan_change_requests (
  id            uuid primary key default gen_random_uuid(),
  plan_item_id  uuid not null,
  enrollment_id uuid not null,
  program_id    uuid not null,
  requested_by  uuid not null references public.profiles (id) on delete restrict,
  proposed_learner_target_at timestamptz,
  proposed_official_due_at   timestamptz,
  proposed_sequence integer check (proposed_sequence >= 0),
  proposed_pace jsonb not null default '{}'::jsonb,
  justification text,
  change_impact public.plan_change_impact,
  required_approver_role public.plan_approval_rule,
  status        public.plan_change_status not null default 'draft',
  submitted_at  timestamptz,
  decided_at    timestamptz,
  withdrawn_at  timestamptz,
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, enrollment_id),
  unique (id, program_id),
  constraint pcr_pace_object
    check (jsonb_typeof(proposed_pace) = 'object'
           and pg_catalog.length(proposed_pace::text) <= 2000),
  -- Au moins une modification proposée, sinon la demande n'a pas d'objet.
  constraint pcr_has_proposal
    check (proposed_learner_target_at is not null
           or proposed_official_due_at is not null
           or proposed_sequence is not null
           or proposed_pace <> '{}'::jsonb),
  -- Justification OBLIGATOIRE dès que la demande quitte le brouillon.
  constraint pcr_justification_required
    check (status = 'draft'
           or (justification is not null
               and length(btrim(justification)) between 10 and 2000)),
  constraint pcr_derived_set_when_submitted
    check (status = 'draft'
           or (change_impact is not null and required_approver_role is not null)),
  constraint pcr_decision_dates
    check ((status in ('approved', 'rejected')) = (decided_at is not null)
           and (status = 'withdrawn') = (withdrawn_at is not null)),
  constraint pcr_provenance_coherent
    check ((source_system = 'native') = (source_id is null)),
  constraint pcr_item_same_enrollment
    foreign key (plan_item_id, enrollment_id)
    references public.acquisition_plan_items (id, enrollment_id) on delete cascade,
  constraint pcr_item_same_program
    foreign key (plan_item_id, program_id)
    references public.acquisition_plan_items (id, program_id) on delete cascade,
  constraint pcr_enrollment_same_program
    foreign key (enrollment_id, program_id)
    references public.enrollments (id, program_id) on delete cascade
);
create index if not exists pcr_item_idx on public.plan_change_requests (plan_item_id);
create index if not exists pcr_queue_idx
  on public.plan_change_requests (program_id, status, required_approver_role);
create index if not exists pcr_requester_idx on public.plan_change_requests (requested_by);

-- ---------------------------------------------------------------------
-- 13.7 plan_change_decisions — journal APPEND-ONLY
-- Aucun GRANT UPDATE / DELETE, pour aucun rôle client (13.9).
-- ---------------------------------------------------------------------
create table if not exists public.plan_change_decisions (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null,
  program_id    uuid not null,
  reviewer_person_id uuid not null references public.profiles (id) on delete restrict,
  reviewer_role public.role_name not null,
  decision      public.plan_decision not null,
  comment       text check (comment is null or length(btrim(comment)) <= 2000),
  decided_at    timestamptz not null default now(),
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  constraint pcd_reviewer_role_allowed
    check (reviewer_role in ('teacher', 'administrator', 'placement_supervisor')),
  constraint pcd_provenance_coherent
    check ((source_system = 'native') = (source_id is null)),
  constraint pcd_request_same_program
    foreign key (request_id, program_id)
    references public.plan_change_requests (id, program_id) on delete restrict
);
create index if not exists pcd_request_idx
  on public.plan_change_decisions (request_id, decided_at);
comment on table public.plan_change_decisions is
  'Journal append-only des décisions. Une erreur de décision se corrige par une '
  'nouvelle ligne, jamais par une réécriture (aucun UPDATE/DELETE accordé).';

-- ---------------------------------------------------------------------
-- 13.8 passport_share_preferences — partage/export PERSONNEL uniquement
-- ATTENTION (invariant documentaire ET technique) : ces préférences
-- n'interviennent dans AUCUNE policy RLS de 002. Elles ne modifient jamais :
--   * le dossier institutionnel,
--   * la visibilité des enseignants, encadrants et administrateurs de portée,
--   * l'accès aux preuves et validations pour les professionnels autorisés.
-- Elles ne pilotent QUE ce que l'apprenant choisit d'inclure dans un partage
-- ou un export qu'il initie lui-même.
-- ---------------------------------------------------------------------
create table if not exists public.passport_share_preferences (
  enrollment_id uuid not null,
  program_id    uuid not null,
  share_knowledge            boolean not null default true,
  share_simulated_competence boolean not null default true,
  share_real_competence      boolean not null default true,
  share_evidence             boolean not null default false,
  share_validations          boolean not null default false,
  share_placements           boolean not null default false,
  share_history              boolean not null default false,
  share_next_milestones      boolean not null default true,
  source_system text not null default 'native',
  source_id     text,
  imported_at   timestamptz,
  import_batch_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (enrollment_id),
  constraint psp_provenance_coherent
    check ((source_system = 'native') = (source_id is null)),
  constraint psp_enrollment_same_program
    foreign key (enrollment_id, program_id)
    references public.enrollments (id, program_id) on delete cascade
);
comment on table public.passport_share_preferences is
  'Préférences de partage/export personnel. AUCUNE policy RLS ne les consulte : '
  'elles ne restreignent jamais la visibilité institutionnelle.';

-- ---------------------------------------------------------------------
-- 13.9 GRANTS du plan — un privilège pour CHAQUE policy, et rien de plus
-- ---------------------------------------------------------------------
grant select on
  public.acquisition_plan_templates,
  public.acquisition_plan_template_items,
  public.acquisition_plan_template_item_dependencies,
  public.acquisition_plans,
  public.acquisition_plan_items,
  public.plan_change_requests,
  public.plan_change_decisions,
  public.passport_share_preferences
  to authenticated;

-- Templates : administration de programme uniquement (RLS filtrante).
-- Pas de GRANT sur published_at / retired_at : la publication est une opération
-- serveur (elle doit figer le template et vérifier l'absence de cycle).
grant insert (id, program_id, curriculum_version_id, cohort_id, name,
              version_number, created_by)
  on public.acquisition_plan_templates to authenticated;
grant update (name) on public.acquisition_plan_templates to authenticated;
grant delete on public.acquisition_plan_templates to authenticated;  -- draft seulement (RLS)

grant insert (id, template_id, program_id, outcome_id, sequence,
              official_start_at, official_due_at, is_mandatory,
              placement_required, pedagogy_params)
  on public.acquisition_plan_template_items to authenticated;
grant update (sequence, official_start_at, official_due_at, is_mandatory,
              placement_required, pedagogy_params)
  on public.acquisition_plan_template_items to authenticated;
grant delete on public.acquisition_plan_template_items to authenticated;

grant insert (template_id, item_id, depends_on_item_id, relation_kind)
  on public.acquisition_plan_template_item_dependencies to authenticated;
grant delete on public.acquisition_plan_template_item_dependencies to authenticated;

-- acquisition_plans : instanciation = opération serveur (choix de version,
-- dépliage des items, audit). Aucun INSERT/UPDATE/DELETE client.

-- acquisition_plan_items : l'apprenant ne touche QUE sa cible personnelle et
-- son état de planification. official_*, sequence, is_mandatory, outcome_id,
-- plan_id, placement_assignment_id ne sont PAS accordés : ils changent
-- exclusivement par application d'une décision approuvée (003 §9).
grant update (learner_target_at, progress_state)
  on public.acquisition_plan_items to authenticated;

-- plan_change_requests : l'apprenant écrit sa demande et sa justification.
-- change_impact, required_approver_role, submitted_at, decided_at,
-- withdrawn_at et status ne sont PAS accordés en UPDATE : le cycle de vie est
-- imposé par les triggers de 003 §7-§8 via une colonne de transition unique.
grant insert (id, plan_item_id, enrollment_id, program_id, requested_by,
              proposed_learner_target_at, proposed_official_due_at,
              proposed_sequence, proposed_pace, justification)
  on public.plan_change_requests to authenticated;
grant update (proposed_learner_target_at, proposed_official_due_at,
              proposed_sequence, proposed_pace, justification, status)
  on public.plan_change_requests to authenticated;
-- status est accordé car draft -> pending et draft/pending -> withdrawn sont des
-- actions légitimes de l'apprenant ; les transitions interdites (approved /
-- rejected, réécriture d'une décision) sont refusées par le trigger 003 §8 ET
-- par le with check des policies de 002 §15.
-- Aucun GRANT DELETE : une demande se retire (withdrawn), elle ne s'efface pas.

-- plan_change_decisions : insertion seule, colonnes d'identité comprises ;
-- la légitimité du décideur est vérifiée par policy (002 §16) puis re-vérifiée
-- par le trigger d'application (003 §9). Aucun UPDATE, aucun DELETE.
grant insert (request_id, program_id, reviewer_person_id, reviewer_role,
              decision, comment)
  on public.plan_change_decisions to authenticated;

-- passport_share_preferences : pleinement gérées par l'apprenant titulaire.
grant insert (enrollment_id, program_id, share_knowledge,
              share_simulated_competence, share_real_competence,
              share_evidence, share_validations, share_placements,
              share_history, share_next_milestones)
  on public.passport_share_preferences to authenticated;
grant update (share_knowledge, share_simulated_competence,
              share_real_competence, share_evidence, share_validations,
              share_placements, share_history, share_next_milestones)
  on public.passport_share_preferences to authenticated;
grant delete on public.passport_share_preferences to authenticated;

grant all on
  public.acquisition_plan_templates,
  public.acquisition_plan_template_items,
  public.acquisition_plan_template_item_dependencies,
  public.acquisition_plans,
  public.acquisition_plan_items,
  public.plan_change_requests,
  public.plan_change_decisions,
  public.passport_share_preferences
  to service_role;

-- anon : aucun privilège, liste explicite (même politique que 12.7).
revoke all on
  public.acquisition_plan_templates,
  public.acquisition_plan_template_items,
  public.acquisition_plan_template_item_dependencies,
  public.acquisition_plans,
  public.acquisition_plan_items,
  public.plan_change_requests,
  public.plan_change_decisions,
  public.passport_share_preferences
  from anon;


-- FIN — DRAFT — DO NOT EXECUTE
