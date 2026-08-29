-- Chantier Médiathèque (A) — migration complète (base + PPTX narré)
-- 1. URL externe (liens web + vidéos par lien)
alter table public.learning_resources
  add column external_url text
  check (external_url is null or external_url ~* '^https?://\S+$');

-- 2. Élargir les assets "source" au nouveau bucket course-sources
-- (noms de contraintes confirmés en live avant ce DROP)
alter table public.learning_resource_assets
  drop constraint asset_bucket_kind_coherent,
  drop constraint learning_resource_assets_bucket_name_check;

alter table public.learning_resource_assets
  add constraint asset_bucket_kind_coherent check (
    (kind = 'source' and bucket_name in ('pptx-sources', 'course-sources'))
    or (kind <> 'source' and bucket_name = 'course-artifacts')
  ),
  add constraint learning_resource_assets_bucket_name_check
    check (bucket_name in ('pptx-sources', 'course-sources', 'course-artifacts'));

-- 3. Bucket privé course-sources (PDF + vidéo uploadée)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-sources', 'course-sources', false, 524288000,
  array['application/pdf', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy storage_staff_read_course_sources on storage.objects
for select to authenticated
using (
  bucket_id = 'course-sources'
  and exists (
    select 1 from public.learning_resource_assets a
    where a.bucket_name = storage.objects.bucket_id
      and a.object_path = storage.objects.name
      and a.kind = 'source'
      and public.is_program_staff(a.program_id)
  )
);

-- 4. Liaison support <-> connaissance/competence
create table public.learning_resource_outcomes (
  resource_id uuid not null references public.learning_resources (id) on delete cascade,
  outcome_id uuid not null references public.outcomes (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resource_id, outcome_id)
);
create index learning_resource_outcomes_outcome_idx on public.learning_resource_outcomes (outcome_id);
alter table public.learning_resource_outcomes enable row level security;
create policy learning_resource_outcomes_select_scoped on public.learning_resource_outcomes
for select to authenticated using (public.can_read_resource(resource_id));
revoke all on public.learning_resource_outcomes from public, anon, authenticated;
grant select on public.learning_resource_outcomes to authenticated;

-- 5. RPC de création (publication immédiate, pas de file d'attente en v1)
create function public.create_learning_resource(
  p_program_id uuid, p_curriculum_version_id uuid, p_title text, p_description text,
  p_format public.resource_format, p_visibility public.resource_visibility,
  p_external_url text, p_outcome_ids uuid[]
) returns public.learning_resources
language plpgsql security definer set search_path = public, pg_temp as $$
declare created public.learning_resources; v_outcome_id uuid;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  insert into public.learning_resources (
    program_id, curriculum_version_id, title, description,
    format, visibility, external_url, is_published, published_at, created_by
  ) values (
    p_program_id, p_curriculum_version_id, p_title, p_description,
    p_format, p_visibility, p_external_url, true, now(), auth.uid()
  ) returning * into created;
  if p_outcome_ids is not null then
    foreach v_outcome_id in array p_outcome_ids loop
      insert into public.learning_resource_outcomes (resource_id, outcome_id, program_id)
      values (created.id, v_outcome_id, p_program_id);
    end loop;
  end if;
  return created;
end; $$;
revoke all on function public.create_learning_resource(
  uuid, uuid, text, text, public.resource_format, public.resource_visibility, text, uuid[]
) from public, anon, authenticated;
grant execute on function public.create_learning_resource(
  uuid, uuid, text, text, public.resource_format, public.resource_visibility, text, uuid[]
) to authenticated;

-- 6. RPC d'enregistrement d'un fichier deja uploade (via URL signee)
create function public.register_learning_resource_asset(
  p_resource_id uuid, p_kind public.asset_kind, p_bucket_name text, p_object_path text,
  p_media_type text, p_original_file_name text, p_byte_size bigint
) returns public.learning_resource_assets
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_program_id uuid; created public.learning_resource_assets;
begin
  select program_id into v_program_id from public.learning_resources where id = p_resource_id;
  if v_program_id is null then raise exception 'Support introuvable.'; end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  insert into public.learning_resource_assets (
    program_id, resource_id, kind, bucket_name, object_path,
    media_type, original_file_name, byte_size, processing_status, created_by
  ) values (
    v_program_id, p_resource_id, p_kind, p_bucket_name, p_object_path,
    p_media_type, p_original_file_name, p_byte_size, 'ready', auth.uid()
  ) returning * into created;
  return created;
end; $$;
revoke all on function public.register_learning_resource_asset(
  uuid, public.asset_kind, text, text, text, text, bigint
) from public, anon, authenticated;
grant execute on function public.register_learning_resource_asset(
  uuid, public.asset_kind, text, text, text, text, bigint
) to authenticated;

-- 7. Publication d'un deck PPTX narre complet (diapositives + chapitres)
create function public.publish_narrated_deck(
  p_resource_id uuid, p_source_asset_id uuid, p_slide_count integer,
  p_duration_ms bigint, p_transcript_available boolean,
  p_slides jsonb, p_chapters jsonb
) returns public.narrated_decks
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_program_id uuid; v_deck public.narrated_decks;
  v_slide jsonb; v_chapter jsonb; v_version integer;
begin
  select program_id into v_program_id from public.learning_resources where id = p_resource_id;
  if v_program_id is null then raise exception 'Support introuvable.'; end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.narrated_decks where resource_id = p_resource_id;

  insert into public.narrated_decks (
    program_id, resource_id, version, status, source_asset_id,
    slide_count, duration_ms, transcript_available, reviewed_by, reviewed_at, published_at
  ) values (
    v_program_id, p_resource_id, v_version, 'published', p_source_asset_id,
    p_slide_count, p_duration_ms, p_transcript_available, auth.uid(), now(), now()
  ) returning * into v_deck;

  for v_slide in select * from jsonb_array_elements(p_slides) loop
    insert into public.narrated_deck_slides (
      resource_id, deck_id, slide_index, title, duration_ms,
      image_asset_id, audio_asset_id, transcript, transcript_language, audio_present
    ) values (
      p_resource_id, v_deck.id, (v_slide->>'slideIndex')::integer,
      coalesce(v_slide->>'title', ''), coalesce((v_slide->>'durationMs')::integer, 0),
      (v_slide->>'imageAssetId')::uuid, nullif(v_slide->>'audioAssetId', '')::uuid,
      nullif(v_slide->>'transcript', ''), nullif(v_slide->>'transcriptLanguage', ''),
      (v_slide->>'audioAssetId') is not null and v_slide->>'audioAssetId' <> ''
    );
  end loop;

  for v_chapter in select * from jsonb_array_elements(p_chapters) loop
    insert into public.narrated_deck_chapters (deck_id, chapter_index, title, starts_at_slide)
    values (v_deck.id, (v_chapter->>'chapterIndex')::integer, v_chapter->>'title', (v_chapter->>'startsAtSlide')::integer);
  end loop;

  return v_deck;
end; $$;

revoke all on function public.publish_narrated_deck(uuid, uuid, integer, bigint, boolean, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.publish_narrated_deck(uuid, uuid, integer, bigint, boolean, jsonb, jsonb)
to authenticated;
