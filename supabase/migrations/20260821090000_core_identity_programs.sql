-- Campus Santé Augmenté — noyau global
-- PostgreSQL 15 / Supabase. Migration additive initiale.

create extension if not exists "pgcrypto";

create type public.program_kind as enum ('diu', 'dfasm', 'dpc', 'other');
create type public.curriculum_status as enum ('draft', 'active', 'archived');
create type public.cohort_status as enum ('draft', 'open', 'in_progress', 'completed', 'archived');
create type public.enrollment_status as enum ('active', 'suspended', 'completed', 'withdrawn');
create type public.role_name as enum
  ('learner', 'placement_supervisor', 'teacher', 'administrator');
create type public.role_scope_kind as enum ('platform', 'program', 'cohort', 'placement');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 200),
  locale text not null default 'fr-FR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Profil applicatif. Email, mot de passe, MFA et fournisseurs restent dans auth.users.';

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(btrim(code)) between 1 and 50),
  name text not null check (length(btrim(name)) between 1 and 240),
  kind public.program_kind not null,
  institution text not null check (length(btrim(institution)) between 1 and 240),
  locale text not null default 'fr-FR',
  time_zone text not null default 'Europe/Paris',
  placements_enabled boolean not null default true,
  audits_enabled boolean not null default false,
  dpc_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programs_dpc_kind_coherent check (not dpc_enabled or kind = 'dpc')
);

create table public.curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 160),
  effective_from date not null,
  status public.curriculum_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, label),
  unique (id, program_id)
);

create index curriculum_versions_program_idx
  on public.curriculum_versions (program_id, status);

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete restrict,
  curriculum_version_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 200),
  academic_year text not null check (academic_year ~ '^[0-9]{4}-[0-9]{4}$'),
  starts_on date not null,
  ends_on date not null,
  status public.cohort_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cohorts_dates_ordered check (ends_on >= starts_on),
  constraint cohorts_curriculum_same_program
    foreign key (curriculum_version_id, program_id)
    references public.curriculum_versions (id, program_id) on delete restrict,
  unique (program_id, label),
  unique (id, program_id)
);

create index cohorts_program_idx on public.cohorts (program_id, status);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.profiles (id) on delete restrict,
  program_id uuid not null references public.programs (id) on delete restrict,
  cohort_id uuid not null,
  status public.enrollment_status not null default 'active',
  enrolled_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollments_cohort_same_program
    foreign key (cohort_id, program_id)
    references public.cohorts (id, program_id) on delete restrict,
  constraint enrollments_withdrawal_coherent check (
    (status = 'withdrawn' and withdrawn_at is not null)
    or (status <> 'withdrawn' and withdrawn_at is null and withdrawal_reason is null)
  ),
  unique (person_id, cohort_id),
  unique (id, program_id)
);

create index enrollments_person_idx on public.enrollments (person_id, status);
create index enrollments_cohort_idx on public.enrollments (cohort_id, status);

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.profiles (id) on delete cascade,
  role public.role_name not null,
  scope_kind public.role_scope_kind not null,
  scope_id uuid,
  program_id uuid references public.programs (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint role_scope_shape check (
    (scope_kind = 'platform' and scope_id is null and program_id is null)
    or (scope_kind = 'program' and scope_id = program_id and program_id is not null)
    or (scope_kind in ('cohort', 'placement') and scope_id is not null and program_id is not null)
  ),
  constraint learner_scope check (role <> 'learner' or scope_kind = 'cohort'),
  constraint placement_supervisor_scope check (
    role <> 'placement_supervisor' or scope_kind = 'placement'
  )
);

create unique index role_assignments_active_unique
  on public.role_assignments (
    person_id,
    role,
    scope_kind,
    coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where revoked_at is null;

create index role_assignments_program_idx
  on public.role_assignments (program_id, person_id) where revoked_at is null;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs (id) on delete restrict,
  actor_person_id uuid references public.profiles (id) on delete set null,
  event_type text not null check (length(btrim(event_type)) between 1 and 120),
  entity_type text not null check (length(btrim(entity_type)) between 1 and 120),
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint audit_detail_object check (jsonb_typeof(detail) = 'object')
);

create index audit_events_program_time_idx
  on public.audit_events (program_id, occurred_at desc);
create index audit_events_entity_idx
  on public.audit_events (entity_type, entity_id, occurred_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
create trigger programs_set_updated_at
before update on public.programs
for each row execute function public.set_updated_at();
create trigger curriculum_versions_set_updated_at
before update on public.curriculum_versions
for each row execute function public.set_updated_at();
create trigger cohorts_set_updated_at
before update on public.cohorts
for each row execute function public.set_updated_at();
create trigger enrollments_set_updated_at
before update on public.enrollments
for each row execute function public.set_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Utilisateur'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'locale'), ''), 'fr-FR')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
