-- RECONSTRUCTION (30/08/2026) : cette table et son declencheur existaient en
-- base Supabase dev sans fichier de migration correspondant. Le SQL ci-dessous
-- est la definition reelle relue en base (colonnes, contraintes, index, RLS,
-- policies, grants), remise dans l'historique pour que le depot redevienne la
-- source de verite. Aucune modification de comportement.
--
-- Pre-inscriptions et invitations : une personne saisie par le staff avant
-- qu'elle n'ait de compte. A l'activation du compte Supabase, le declencheur
-- sur public.profiles relie la personne a son profil et cree l'inscription.

create table public.people (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  first_name text not null
    check (length(btrim(first_name)) between 1 and 120),
  last_name text not null
    check (length(btrim(last_name)) between 1 and 120),
  institutional_id text
    check (institutional_id is null
      or length(btrim(institutional_id)) between 1 and 80),
  login_email text not null
    check (login_email = lower(btrim(login_email))),
  origin text not null default 'individual'
    check (origin in ('individual', 'import')),
  intended_cohort_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'invited', 'activated', 'cancelled')),
  invited_at timestamptz,
  invited_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  activated_profile_id uuid unique
    references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_cohort_same_program
    foreign key (intended_cohort_id, program_id)
    references public.cohorts (id, program_id) on delete set null,
  constraint people_status_activation_coherent
    check ((status = 'activated') = (activated_profile_id is not null)),
  constraint people_status_cancelled_coherent
    check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint people_status_invited_coherent
    check (status not in ('invited', 'activated') or invited_at is not null),
  unique (program_id, login_email)
);

create trigger people_set_updated_at
before update on public.people
for each row execute function public.set_updated_at();

alter table public.people enable row level security;

revoke all on public.people from public, anon;
grant select, insert, update on public.people to authenticated;

create policy people_select_staff on public.people
for select to authenticated
using (public.is_program_staff(program_id));

create policy people_insert_staff on public.people
for insert to authenticated
with check (public.is_program_staff(program_id) and created_by = auth.uid());

create policy people_update_staff on public.people
for update to authenticated
using (public.is_program_staff(program_id))
with check (public.is_program_staff(program_id));

-- A la creation d'un profil (donc a l'activation du compte), relie la personne
-- pre-inscrite portant la meme adresse, cree son inscription et son role.
create or replace function public.handle_people_activation()
returns trigger
language plpgsql security definer
set search_path to 'public', 'auth', 'pg_temp' as $function$
declare
  activated_email text;
  matched record;
begin
  select lower(btrim(email)) into activated_email
  from auth.users
  where id = new.id;

  if activated_email is null then
    return new;
  end if;

  for matched in
    select id, program_id, intended_cohort_id, origin, created_by
    from public.people
    where login_email = activated_email
      and status = 'invited'
      and activated_profile_id is null
  loop
    update public.people
    set status = 'activated',
        activated_profile_id = new.id
    where id = matched.id;

    if matched.intended_cohort_id is not null then
      insert into public.enrollments (person_id, program_id, cohort_id, status, created_at, updated_at)
      values (new.id, matched.program_id, matched.intended_cohort_id, 'active', now(), now())
      on conflict do nothing;

      insert into public.role_assignments (
        person_id, role, scope_kind, scope_id, program_id, granted_by
      )
      values (
        new.id, 'learner', 'cohort', matched.intended_cohort_id, matched.program_id, matched.created_by
      )
      on conflict do nothing;
    end if;
  end loop;

  return new;
end;
$function$;

create trigger on_profile_created_link_people
after insert on public.profiles
for each row execute function public.handle_people_activation();
