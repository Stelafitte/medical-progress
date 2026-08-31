-- Le passeport de l'etudiant : ce qu'il declare, et comment il decale son plan.
--
-- Seconde moitie du modele de la V1 DFASM (voir docs/architecture/v1_passeport_dfasm.md).
-- La premiere moitie (20260831091000) a pose le retroplanning modele ; celle-ci pose ce
-- que l'etudiant y inscrit.

/* ------------------------------------------------------------------ */
/* Helper : est-ce MON inscription ?                                   */
/* ------------------------------------------------------------------ */

create function public.owns_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment_id
      and e.person_id = auth.uid()
      and e.status in ('active', 'completed')
  );
$$;

revoke all on function public.owns_enrollment(uuid) from public, anon;

/* ------------------------------------------------------------------ */
/* Ce que l'etudiant declare                                           */
/* ------------------------------------------------------------------ */

-- Decision (Stef, 31/08) : l'etudiant POSE SON NIVEAU, il n'accumule pas de
-- preuves. Une seule ligne par (inscription, acquis), mise a jour, jamais
-- accumulee -- c'est ce qui rend la saisie mobile tenable. La regle qui faisait
-- monter le niveau au nombre de preuves (voir computeOutcomeProgress) supposait
-- des epreuves ; la V1 n'en a pas.
create table public.outcome_self_reports (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  outcome_id uuid not null references public.outcomes (id) on delete cascade,
  declared_level public.mastery_level not null,
  declared_at timestamptz not null default now(),
  note text not null default '' check (length(note) <= 2000),
  -- Option « validee par un senior encadrant ». Nulle tant que personne n'a
  -- confirme : c'est l'etat « a valider » du Kanban.
  validated_by uuid references public.profiles (id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (enrollment_id, outcome_id),
  -- Les deux colonnes de validation vont ensemble ou pas du tout.
  constraint outcome_self_reports_validation_complete
    check ((validated_by is null) = (validated_at is null))
);

create index outcome_self_reports_enrollment_idx
  on public.outcome_self_reports (enrollment_id);
create index outcome_self_reports_outcome_idx
  on public.outcome_self_reports (outcome_id);

-- INVARIANT : changer son niveau efface la validation.
-- Sans cela, un senior aurait valide « Decouverte » et l'ecran afficherait
-- « Autonome, valide ». La regle est en base, pas dans un ecran : elle doit
-- tenir quel que soit le chemin d'ecriture.
create function public.outcome_self_reports_reset_validation()
returns trigger
language plpgsql
as $$
begin
  if new.declared_level is distinct from old.declared_level then
    new.validated_by := null;
    new.validated_at := null;
    new.declared_at  := now();
  end if;
  return new;
end;
$$;

create trigger outcome_self_reports_level_change
before update on public.outcome_self_reports
for each row execute function public.outcome_self_reports_reset_validation();

alter table public.outcome_self_reports enable row level security;
revoke all on public.outcome_self_reports from public, anon, authenticated;
grant select on public.outcome_self_reports to authenticated;

-- L'etudiant lit son passeport ; l'equipe du programme lit celui de ses
-- inscrits. Aucune policy d'ecriture : tout passe par les fonctions ci-dessous.
create policy outcome_self_reports_select on public.outcome_self_reports
for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.id = outcome_self_reports.enrollment_id
      and (e.person_id = auth.uid() or public.is_program_staff(e.program_id))
  )
);

-- L'etudiant pose (ou corrige) son niveau sur un acquis de son parcours.
create function public.declare_outcome_level(
  p_enrollment_id uuid,
  p_outcome_id uuid,
  p_level public.mastery_level,
  p_note text default ''
) returns public.outcome_self_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.outcome_self_reports;
begin
  if not public.owns_enrollment(p_enrollment_id) then
    raise exception 'Cette inscription n''est pas la votre.';
  end if;

  select e.program_id into v_program_id
  from public.enrollments e where e.id = p_enrollment_id;

  -- Meme perimetre que ce que l'apprenant voit (20260831090000) : le passeport
  -- ne porte que le PARCOURS, pas le referentiel de travail du concepteur.
  if not exists (
    select 1 from public.outcomes o
    where o.id = p_outcome_id
      and o.program_id = v_program_id
      and o.retained_at is not null
      and o.archived_at is null
  ) then
    raise exception 'Cet acquis n''appartient pas au parcours de ce programme.';
  end if;

  insert into public.outcome_self_reports
    (enrollment_id, outcome_id, declared_level, note)
  values
    (p_enrollment_id, p_outcome_id, p_level, coalesce(p_note, ''))
  on conflict (enrollment_id, outcome_id) do update
    set declared_level = excluded.declared_level,
        note           = excluded.note
  returning * into v_row;

  return v_row;
end;
$$;

-- Un senior confirme une competence. Reservee aux COMPETENCES : la V1 ne teste
-- pas les connaissances et personne n'a a les contresigner. C'est aussi ce qui
-- fait vivre l'invariant du socle -- « une competence REELLE ne peut jamais
-- etre acquise par auto-declaration » (src/domain/mastery.ts) : sans cette
-- signature, le niveau declare sur une competence reelle reste « a valider ».
create function public.validate_outcome_declaration(
  p_enrollment_id uuid,
  p_outcome_id uuid
) returns public.outcome_self_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_nature public.outcome_nature;
  v_row public.outcome_self_reports;
begin
  select e.program_id into v_program_id
  from public.enrollments e where e.id = p_enrollment_id;

  if v_program_id is null then
    raise exception 'Inscription introuvable.';
  end if;
  if not public.is_program_staff(v_program_id) then
    raise exception 'Seul un encadrant, un enseignant ou un administrateur du programme peut valider.';
  end if;

  select o.nature into v_nature
  from public.outcomes o where o.id = p_outcome_id;

  if v_nature = 'knowledge' then
    raise exception 'Une connaissance ne se valide pas : la V1 ne teste pas les connaissances.';
  end if;

  update public.outcome_self_reports
     set validated_by = auth.uid(),
         validated_at = now()
   where enrollment_id = p_enrollment_id
     and outcome_id = p_outcome_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Rien a valider : l''etudiant n''a pas encore declare de niveau sur cet acquis.';
  end if;

  return v_row;
end;
$$;

-- Retirer une validation posee par erreur. Reversible, comme l'archivage.
create function public.revoke_outcome_validation(
  p_enrollment_id uuid,
  p_outcome_id uuid
) returns public.outcome_self_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.outcome_self_reports;
begin
  select e.program_id into v_program_id
  from public.enrollments e where e.id = p_enrollment_id;

  if v_program_id is null then
    raise exception 'Inscription introuvable.';
  end if;
  if not public.is_program_staff(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  update public.outcome_self_reports
     set validated_by = null,
         validated_at = null
   where enrollment_id = p_enrollment_id
     and outcome_id = p_outcome_id
  returning * into v_row;

  return v_row;
end;
$$;

/* ------------------------------------------------------------------ */
/* Le decalage personnel d'un jalon                                    */
/* ------------------------------------------------------------------ */

-- Le retroplanning est une PROPOSITION : l'etudiant l'adapte a ses capacites
-- et a son organisation. Une ligne ici seulement quand il a deplace un jalon ;
-- en son absence, la date de la cohorte s'applique.
--
-- INVARIANT DECLARATIF : un jalon officiel refuse le decalage. La colonne
-- milestone_official est tenue par une cle etrangere composite vers
-- plan_milestones (id, official), et le check la force a false. Ce n'est pas
-- un bouton grise : PostgreSQL refuse la ligne.
--
-- Consequence a connaitre : rendre officiel un jalon que des etudiants ont
-- deja deplace ECHOUE (la cascade violerait le check). C'est voulu -- l'ecran
-- doit alors dire combien d'etudiants sont concernes et demander quoi faire de
-- leurs dates, plutot que de les ecraser en silence.
create table public.learner_milestone_shifts (
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  milestone_id uuid not null,
  milestone_official boolean not null default false,
  shifted_due_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (enrollment_id, milestone_id),
  constraint learner_milestone_shifts_not_official
    check (milestone_official = false),
  constraint learner_milestone_shifts_milestone_fk
    foreign key (milestone_id, milestone_official)
    references public.plan_milestones (id, official)
    on delete cascade on update cascade
);

alter table public.learner_milestone_shifts enable row level security;
revoke all on public.learner_milestone_shifts from public, anon, authenticated;
grant select on public.learner_milestone_shifts to authenticated;

create policy learner_milestone_shifts_select on public.learner_milestone_shifts
for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.id = learner_milestone_shifts.enrollment_id
      and (e.person_id = auth.uid() or public.is_program_staff(e.program_id))
  )
);

create function public.shift_milestone(
  p_enrollment_id uuid,
  p_milestone_id uuid,
  p_due_on date
) returns public.learner_milestone_shifts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_official boolean;
  v_milestone_program uuid;
  v_row public.learner_milestone_shifts;
begin
  if not public.owns_enrollment(p_enrollment_id) then
    raise exception 'Cette inscription n''est pas la votre.';
  end if;

  select e.program_id into v_program_id
  from public.enrollments e where e.id = p_enrollment_id;

  select m.official, m.program_id into v_official, v_milestone_program
  from public.plan_milestones m where m.id = p_milestone_id;

  if v_milestone_program is null then
    raise exception 'Jalon introuvable.';
  end if;
  if v_milestone_program is distinct from v_program_id then
    raise exception 'Ce jalon n''appartient pas a votre programme.';
  end if;
  -- Message lisible avant que la contrainte ne parle a notre place.
  if v_official then
    raise exception 'Ce jalon porte une echeance officielle : il ne peut pas etre deplace.';
  end if;

  insert into public.learner_milestone_shifts
    (enrollment_id, milestone_id, milestone_official, shifted_due_on)
  values
    (p_enrollment_id, p_milestone_id, false, p_due_on)
  on conflict (enrollment_id, milestone_id) do update
    set shifted_due_on = excluded.shifted_due_on,
        updated_at     = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- Revenir a la date de la cohorte.
create function public.reset_milestone_shift(
  p_enrollment_id uuid,
  p_milestone_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.owns_enrollment(p_enrollment_id) then
    raise exception 'Cette inscription n''est pas la votre.';
  end if;

  delete from public.learner_milestone_shifts
   where enrollment_id = p_enrollment_id
     and milestone_id = p_milestone_id;
end;
$$;

revoke all on function public.declare_outcome_level(uuid, uuid, public.mastery_level, text)
  from public, anon, authenticated;
revoke all on function public.validate_outcome_declaration(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.revoke_outcome_validation(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.shift_milestone(uuid, uuid, date)
  from public, anon, authenticated;
revoke all on function public.reset_milestone_shift(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.declare_outcome_level(uuid, uuid, public.mastery_level, text)
  to authenticated;
grant execute on function public.validate_outcome_declaration(uuid, uuid)
  to authenticated;
grant execute on function public.revoke_outcome_validation(uuid, uuid)
  to authenticated;
grant execute on function public.shift_milestone(uuid, uuid, date)
  to authenticated;
grant execute on function public.reset_milestone_shift(uuid, uuid)
  to authenticated;
