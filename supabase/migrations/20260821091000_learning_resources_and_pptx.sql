-- Campus Santé Augmenté — ressources privées et pipeline PPTX sonorisé

create type public.resource_visibility as enum ('staff_only', 'cohort', 'program');
create type public.resource_format as enum
  ('html', 'pdf', 'video', 'narrated_slides', 'link', 'other');
create type public.storage_provider as enum ('supabase', 's3', 'r2');
create type public.asset_kind as enum
  ('source', 'slide_image', 'slide_audio', 'transcript', 'manifest', 'thumbnail', 'fallback_video');
create type public.asset_processing_status as enum
  ('pending', 'uploaded', 'scanning', 'processing', 'ready', 'failed', 'quarantined', 'deleted');
create type public.deck_status as enum
  ('awaiting_upload', 'queued', 'processing', 'review_required', 'ready', 'published', 'failed', 'archived');
create type public.conversion_job_status as enum
  ('queued', 'claimed', 'running', 'succeeded', 'failed', 'cancelled');
create type public.conversion_step_kind as enum
  ('upload', 'analysis', 'slide_render', 'audio_extract', 'transcript', 'packaging', 'review', 'publication');
create type public.conversion_step_status as enum
  ('pending', 'running', 'succeeded', 'warning', 'failed', 'skipped');

create table public.learning_resources (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  curriculum_version_id uuid,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text not null default '',
  format public.resource_format not null,
  visibility public.resource_visibility not null default 'staff_only',
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_curriculum_same_program
    foreign key (curriculum_version_id, program_id)
    references public.curriculum_versions (id, program_id) on delete restrict,
  constraint resource_publication_coherent check (
    (is_published and published_at is not null)
    or (not is_published and published_at is null)
  ),
  unique (id, program_id)
);

create index learning_resources_program_idx
  on public.learning_resources (program_id, is_published, format);

create table public.learning_resource_assets (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  resource_id uuid not null,
  kind public.asset_kind not null,
  storage_provider public.storage_provider not null default 'supabase',
  bucket_name text not null check (bucket_name in ('pptx-sources', 'course-artifacts')),
  object_path text not null check (
    object_path !~* '^(https?|s3)://' and
    object_path = btrim(object_path) and
    object_path <> ''
  ),
  media_type text not null,
  original_file_name text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  processing_status public.asset_processing_status not null default 'pending',
  processing_error text,
  retention_until timestamptz,
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_resource_same_program
    foreign key (resource_id, program_id)
    references public.learning_resources (id, program_id) on delete cascade,
  constraint asset_bucket_kind_coherent check (
    (kind = 'source' and bucket_name = 'pptx-sources')
    or (kind <> 'source' and bucket_name = 'course-artifacts')
  ),
  constraint asset_deleted_coherent check (
    (processing_status = 'deleted' and deleted_at is not null)
    or (processing_status <> 'deleted' and deleted_at is null)
  ),
  unique (bucket_name, object_path),
  unique (id, resource_id)
);

create index learning_resource_assets_resource_idx
  on public.learning_resource_assets (resource_id, processing_status, kind);

create table public.narrated_decks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  resource_id uuid not null,
  version integer not null default 1 check (version > 0),
  status public.deck_status not null default 'awaiting_upload',
  source_asset_id uuid,
  slide_count integer check (slide_count is null or slide_count >= 0),
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  transcript_available boolean not null default false,
  reviewed_by uuid references public.profiles (id) on delete restrict,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deck_resource_same_program
    foreign key (resource_id, program_id)
    references public.learning_resources (id, program_id) on delete cascade,
  constraint deck_source_belongs_to_resource
    foreign key (source_asset_id, resource_id)
    references public.learning_resource_assets (id, resource_id) on delete restrict,
  constraint deck_review_coherent check (
    (reviewed_by is null and reviewed_at is null)
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint deck_publish_requires_review check (
    status <> 'published'
    or (reviewed_by is not null and reviewed_at is not null and published_at is not null)
  ),
  unique (resource_id, version),
  unique (id, resource_id)
);

create index narrated_decks_resource_idx
  on public.narrated_decks (resource_id, version desc);

create table public.conversion_jobs (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.learning_resources (id) on delete cascade,
  deck_id uuid not null,
  source_asset_id uuid not null,
  status public.conversion_job_status not null default 'queued',
  priority smallint not null default 100 check (priority between 0 and 1000),
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  worker_id text,
  queued_at timestamptz not null default now(),
  claimed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint conversion_job_deck_same_resource
    foreign key (deck_id, resource_id)
    references public.narrated_decks (id, resource_id) on delete cascade,
  constraint conversion_job_source_same_resource
    foreign key (source_asset_id, resource_id)
    references public.learning_resource_assets (id, resource_id) on delete restrict,
  constraint conversion_job_claim_coherent check (
    (status = 'queued' and worker_id is null and claimed_at is null)
    or status <> 'queued'
  ),
  constraint conversion_job_finish_coherent check (
    (status in ('succeeded', 'failed', 'cancelled') and finished_at is not null)
    or (status not in ('succeeded', 'failed', 'cancelled') and finished_at is null)
  )
);

create unique index conversion_jobs_one_active_per_deck
  on public.conversion_jobs (deck_id)
  where status in ('queued', 'claimed', 'running');
create index conversion_jobs_claim_idx
  on public.conversion_jobs (priority, queued_at)
  where status = 'queued';

create table public.conversion_job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.conversion_jobs (id) on delete cascade,
  step public.conversion_step_kind not null,
  status public.conversion_step_status not null default 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint conversion_step_detail_object check (jsonb_typeof(detail) = 'object'),
  constraint conversion_step_time_order check (
    finished_at is null or (started_at is not null and finished_at >= started_at)
  ),
  unique (job_id, step)
);

create table public.narrated_deck_slides (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.learning_resources (id) on delete cascade,
  deck_id uuid not null,
  slide_index integer not null check (slide_index >= 0),
  title text not null default '',
  duration_ms integer not null default 0 check (duration_ms >= 0),
  image_asset_id uuid not null,
  audio_asset_id uuid,
  transcript text,
  transcript_language text,
  audio_present boolean not null default false,
  created_at timestamptz not null default now(),
  constraint narrated_slide_deck_same_resource
    foreign key (deck_id, resource_id)
    references public.narrated_decks (id, resource_id) on delete cascade,
  constraint narrated_slide_image_same_resource
    foreign key (image_asset_id, resource_id)
    references public.learning_resource_assets (id, resource_id) on delete restrict,
  constraint narrated_slide_audio_same_resource
    foreign key (audio_asset_id, resource_id)
    references public.learning_resource_assets (id, resource_id) on delete restrict,
  constraint narrated_slide_audio_coherent check (
    audio_present = (audio_asset_id is not null)
  ),
  unique (deck_id, slide_index)
);

create index narrated_deck_slides_deck_idx
  on public.narrated_deck_slides (deck_id, slide_index);

create table public.narrated_deck_chapters (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.narrated_decks (id) on delete cascade,
  chapter_index integer not null check (chapter_index >= 0),
  title text not null check (length(btrim(title)) between 1 and 240),
  starts_at_slide integer not null check (starts_at_slide >= 0),
  created_at timestamptz not null default now(),
  unique (deck_id, chapter_index)
);

create table public.narrated_deck_progress (
  deck_id uuid not null references public.narrated_decks (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  last_slide_index integer not null default 0 check (last_slide_index >= 0),
  position_ms integer not null default 0 check (position_ms >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (deck_id, enrollment_id)
);

create trigger learning_resources_set_updated_at
before update on public.learning_resources
for each row execute function public.set_updated_at();
create trigger learning_resource_assets_set_updated_at
before update on public.learning_resource_assets
for each row execute function public.set_updated_at();
create trigger narrated_decks_set_updated_at
before update on public.narrated_decks
for each row execute function public.set_updated_at();
create trigger narrated_deck_progress_set_updated_at
before update on public.narrated_deck_progress
for each row execute function public.set_updated_at();

create function public.claim_next_conversion_job(p_worker_id text)
returns public.conversion_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed public.conversion_jobs;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) < 3 then
    raise exception 'worker_id invalide';
  end if;

  with candidate as (
    select id
    from public.conversion_jobs
    where status = 'queued' and attempt < max_attempts
    order by priority asc, queued_at asc
    for update skip locked
    limit 1
  )
  update public.conversion_jobs j
  set status = 'claimed',
      worker_id = p_worker_id,
      claimed_at = clock_timestamp(),
      heartbeat_at = clock_timestamp(),
      attempt = attempt + 1
  from candidate
  where j.id = candidate.id
  returning j.* into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_next_conversion_job(text) from public, anon, authenticated;
grant execute on function public.claim_next_conversion_job(text) to service_role;

revoke all on public.learning_resources,
  public.learning_resource_assets,
  public.narrated_decks,
  public.conversion_jobs,
  public.conversion_job_steps,
  public.narrated_deck_slides,
  public.narrated_deck_chapters,
  public.narrated_deck_progress
from anon, authenticated;
