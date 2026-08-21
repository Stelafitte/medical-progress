-- Campus Santé Augmenté — RLS fermée par défaut et stockage privé

create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid()
      and ra.role = 'administrator'
      and ra.scope_kind = 'platform'
      and ra.revoked_at is null
  );
$$;

create function public.can_administer_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin() or exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid()
      and ra.role = 'administrator'
      and ra.program_id = p_program_id
      and ra.revoked_at is null
  );
$$;

create function public.is_program_staff(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.can_administer_program(p_program_id) or exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid()
      and ra.program_id = p_program_id
      and ra.role in ('teacher', 'placement_supervisor')
      and ra.revoked_at is null
  );
$$;

create function public.is_enrolled_in_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.enrollments e
    where e.person_id = auth.uid()
      and e.program_id = p_program_id
      and e.status in ('active', 'completed')
  );
$$;

create function public.can_read_profile(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_person_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1
      from public.enrollments e
      where e.person_id = p_person_id
        and public.is_program_staff(e.program_id)
    );
$$;

create function public.can_read_resource(p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.learning_resources r
    where r.id = p_resource_id
      and (
        public.is_program_staff(r.program_id)
        or (
          r.is_published
          and r.visibility in ('cohort', 'program')
          and public.is_enrolled_in_program(r.program_id)
        )
      )
  );
$$;

revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.can_administer_program(uuid) from public, anon;
revoke all on function public.is_program_staff(uuid) from public, anon;
revoke all on function public.is_enrolled_in_program(uuid) from public, anon;
revoke all on function public.can_read_profile(uuid) from public, anon;
revoke all on function public.can_read_resource(uuid) from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.can_administer_program(uuid) to authenticated;
grant execute on function public.is_program_staff(uuid) to authenticated;
grant execute on function public.is_enrolled_in_program(uuid) to authenticated;
grant execute on function public.can_read_profile(uuid) to authenticated;
grant execute on function public.can_read_resource(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.programs enable row level security;
alter table public.curriculum_versions enable row level security;
alter table public.cohorts enable row level security;
alter table public.enrollments enable row level security;
alter table public.role_assignments enable row level security;
alter table public.audit_events enable row level security;
alter table public.learning_resources enable row level security;
alter table public.learning_resource_assets enable row level security;
alter table public.narrated_decks enable row level security;
alter table public.conversion_jobs enable row level security;
alter table public.conversion_job_steps enable row level security;
alter table public.narrated_deck_slides enable row level security;
alter table public.narrated_deck_chapters enable row level security;
alter table public.narrated_deck_progress enable row level security;

grant select on public.profiles,
  public.programs,
  public.curriculum_versions,
  public.cohorts,
  public.enrollments,
  public.role_assignments,
  public.learning_resources,
  public.learning_resource_assets,
  public.narrated_decks,
  public.narrated_deck_slides,
  public.narrated_deck_chapters,
  public.narrated_deck_progress
to authenticated;
grant update (full_name, locale) on public.profiles to authenticated;
grant insert (deck_id, enrollment_id, last_slide_index, position_ms, completed_at),
  update (last_slide_index, position_ms, completed_at)
on public.narrated_deck_progress to authenticated;

create policy profiles_select_scoped on public.profiles
for select to authenticated
using (public.can_read_profile(id));
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy programs_select_scoped on public.programs
for select to authenticated
using (
  public.is_program_staff(id)
  or public.is_enrolled_in_program(id)
);

create policy curriculum_select_scoped on public.curriculum_versions
for select to authenticated
using (
  public.is_program_staff(program_id)
  or public.is_enrolled_in_program(program_id)
);

create policy cohorts_select_scoped on public.cohorts
for select to authenticated
using (
  public.is_program_staff(program_id)
  or exists (
    select 1 from public.enrollments e
    where e.cohort_id = cohorts.id and e.person_id = auth.uid()
  )
);

create policy enrollments_select_scoped on public.enrollments
for select to authenticated
using (
  person_id = auth.uid()
  or public.is_program_staff(program_id)
);

create policy role_assignments_select_scoped on public.role_assignments
for select to authenticated
using (
  person_id = auth.uid()
  or public.can_administer_program(program_id)
  or public.is_platform_admin()
);

create policy learning_resources_select_scoped on public.learning_resources
for select to authenticated
using (public.can_read_resource(id));

create policy learning_resource_assets_select_scoped on public.learning_resource_assets
for select to authenticated
using (
  public.is_program_staff(program_id)
  or (
    kind <> 'source'
    and processing_status = 'ready'
    and public.can_read_resource(resource_id)
  )
);

create policy narrated_decks_select_scoped on public.narrated_decks
for select to authenticated
using (
  public.is_program_staff(program_id)
  or (status = 'published' and public.can_read_resource(resource_id))
);

create policy narrated_deck_slides_select_scoped on public.narrated_deck_slides
for select to authenticated
using (
  exists (
    select 1 from public.narrated_decks d
    where d.id = narrated_deck_slides.deck_id
      and (
        public.is_program_staff(d.program_id)
        or (d.status = 'published' and public.can_read_resource(d.resource_id))
      )
  )
);

create policy narrated_deck_chapters_select_scoped on public.narrated_deck_chapters
for select to authenticated
using (
  exists (
    select 1 from public.narrated_decks d
    where d.id = narrated_deck_chapters.deck_id
      and (
        public.is_program_staff(d.program_id)
        or (d.status = 'published' and public.can_read_resource(d.resource_id))
      )
  )
);

create policy narrated_deck_progress_select_own on public.narrated_deck_progress
for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.id = narrated_deck_progress.enrollment_id
      and e.person_id = auth.uid()
  )
);
create policy narrated_deck_progress_insert_own on public.narrated_deck_progress
for insert to authenticated
with check (
  exists (
    select 1
    from public.enrollments e
    join public.narrated_decks d on d.id = narrated_deck_progress.deck_id
    where e.id = narrated_deck_progress.enrollment_id
      and e.person_id = auth.uid()
      and e.program_id = d.program_id
      and e.status = 'active'
      and d.status = 'published'
  )
);
create policy narrated_deck_progress_update_own on public.narrated_deck_progress
for update to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.id = narrated_deck_progress.enrollment_id
      and e.person_id = auth.uid()
      and e.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.enrollments e
    where e.id = narrated_deck_progress.enrollment_id
      and e.person_id = auth.uid()
      and e.status = 'active'
  )
);

-- Buckets privés. Aucun objet n'est public et aucune écriture client directe
-- n'est autorisée : les uploads passent par une URL signée créée côté serveur.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'pptx-sources',
    'pptx-sources',
    false,
    262144000,
    array['application/vnd.openxmlformats-officedocument.presentationml.presentation']
  ),
  (
    'course-artifacts',
    'course-artifacts',
    false,
    104857600,
    array['image/webp', 'image/png', 'audio/mpeg', 'audio/mp4', 'application/json', 'text/vtt', 'video/mp4']
  )
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy storage_staff_read_pptx_sources on storage.objects
for select to authenticated
using (
  bucket_id = 'pptx-sources'
  and exists (
    select 1
    from public.learning_resource_assets a
    where a.bucket_name = storage.objects.bucket_id
      and a.object_path = storage.objects.name
      and a.kind = 'source'
      and public.is_program_staff(a.program_id)
  )
);

create policy storage_scoped_read_course_artifacts on storage.objects
for select to authenticated
using (
  bucket_id = 'course-artifacts'
  and exists (
    select 1
    from public.learning_resource_assets a
    where a.bucket_name = storage.objects.bucket_id
      and a.object_path = storage.objects.name
      and a.processing_status = 'ready'
      and (
        public.is_program_staff(a.program_id)
        or (a.kind <> 'source' and public.can_read_resource(a.resource_id))
      )
  )
);
