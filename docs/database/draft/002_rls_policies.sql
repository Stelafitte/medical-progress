-- =====================================================================
-- DRAFT — DO NOT EXECUTE
-- Passeport Éducatif Médical — Lot 1 — matrice RLS (conception)
-- Ce fichier n'est pas une migration et n'a jamais été exécuté.
-- Principes :
--   * auth.uid() est la SEULE identité ; aucun user_id fourni par le client
--     n'est jamais utilisé pour décider d'un droit.
--   * policies séparées par opération (SELECT / INSERT / UPDATE / DELETE),
--     aucun FOR ALL vague.
--   * service_role bypasse la RLS et n'est JAMAIS utilisé côté frontend.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fonctions d'autorisation
-- Toutes : stables, non mutantes, search_path verrouillé.
-- SECURITY DEFINER uniquement là où la policy lirait une table elle-même
-- protégée par RLS (risque de récursion infinie) : role_assignments,
-- enrollments, placement_supervisors. Chaque fonction est justifiée.
-- ---------------------------------------------------------------------

-- Admin plateforme : portée maximale. Lit role_assignments → SECURITY DEFINER
-- obligatoire (sinon récursion : les policies de role_assignments l'appellent).
create or replace function public.is_platform_admin()
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

-- Rôle détenu par l'utilisateur courant sur un programme donné, en tenant
-- compte de l'héritage de portée (platform > program > cohort/placement).
-- SECURITY DEFINER : même raison (lecture de role_assignments).
create or replace function public.has_program_role(_program_id uuid, _role public.role_name)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin() or exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid()
      and ra.role = _role
      and ra.revoked_at is null
      and ra.program_id = _program_id
      and ra.scope_kind in ('program', 'cohort', 'placement')
  );
$$;

-- Administration d'un programme : admin de ce programme ou admin plateforme.
create or replace function public.can_administer_program(_program_id uuid)
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
      and ra.scope_kind = 'program'
      and ra.program_id = _program_id
      and ra.revoked_at is null
  );
$$;

-- L'utilisateur est-il inscrit au programme ? Lit enrollments (RLS) →
-- SECURITY DEFINER pour éviter la récursion depuis les policies d'enrollments
-- et des tables de référentiel.
create or replace function public.is_enrolled_in_program(_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.enrollments e
    where e.person_id = auth.uid()
      and e.program_id = _program_id
      and e.status in ('active', 'suspended', 'completed')
  );
$$;

-- L'inscription appartient-elle à l'utilisateur courant ?
create or replace function public.owns_enrollment(_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = _enrollment_id and e.person_id = auth.uid()
  );
$$;

-- Encadrant explicitement déclaré du stage. Lit placement_supervisors (RLS).
create or replace function public.supervises_placement(_placement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.placement_supervisors ps
    where ps.placement_id = _placement_id
      and ps.person_id = auth.uid()
  );
$$;

-- L'utilisateur encadre-t-il le stage auquel cette preuve est rattachée ?
create or replace function public.supervises_evidence(_evidence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.evidence ev
    join public.placement_assignments pa on pa.id = ev.placement_assignment_id
    join public.placement_supervisors ps on ps.placement_id = pa.placement_id
    where ev.id = _evidence_id
      and ps.person_id = auth.uid()
  );
$$;

-- Peut-on valider cette preuve ? Jamais son propre travail, jamais hors portée.
create or replace function public.can_validate_evidence(_evidence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.evidence ev
    join public.enrollments e on e.id = ev.enrollment_id
    where ev.id = _evidence_id
      and e.person_id <> auth.uid()          -- jamais auto-validation
      and ev.created_by <> auth.uid()        -- ni validation de sa propre saisie
      and (
        public.supervises_evidence(ev.id)
        or public.has_program_role(ev.program_id, 'teacher')
        or public.can_administer_program(ev.program_id)
      )
  );
$$;

-- Durcissement de l'exposition des fonctions : aucune exécution par anon.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.is_platform_admin()',
    'public.has_program_role(uuid, public.role_name)',
    'public.can_administer_program(uuid)',
    'public.is_enrolled_in_program(uuid)',
    'public.owns_enrollment(uuid)',
    'public.supervises_placement(uuid)',
    'public.supervises_evidence(uuid)',
    'public.can_validate_evidence(uuid)'
  ]
  loop
    execute format('alter function %s owner to postgres', fn);
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Activation de la RLS sur TOUTES les tables publiques
-- ---------------------------------------------------------------------
alter table public.profiles                   enable row level security;
alter table public.programs                   enable row level security;
alter table public.curriculum_versions        enable row level security;
alter table public.cohorts                    enable row level security;
alter table public.enrollments                enable row level security;
alter table public.role_assignments           enable row level security;
alter table public.outcomes                   enable row level security;
alter table public.outcome_relations          enable row level security;
alter table public.learning_resources         enable row level security;
alter table public.learning_resource_outcomes enable row level security;
alter table public.placements                 enable row level security;
alter table public.placement_supervisors      enable row level security;
alter table public.placement_assignments      enable row level security;
alter table public.evidence                   enable row level security;
alter table public.evidence_sources           enable row level security;
alter table public.evidence_validations       enable row level security;
alter table public.audit_events               enable row level security;
alter table public.ai_usage_events            enable row level security;
alter table public.ai_quota_policies          enable row level security;

-- ---------------------------------------------------------------------
-- 3. profiles
-- ---------------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());

-- Un encadrant/enseignant/admin voit les profils des apprenants de sa portée.
create policy profiles_select_scoped on public.profiles
  for select to authenticated
  using (exists (
    select 1 from public.enrollments e
    where e.person_id = public.profiles.id
      and (public.has_program_role(e.program_id, 'teacher')
           or public.can_administer_program(e.program_id))
  ));

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Aucune policy DELETE : la suppression passe par auth.users (serveur).

-- ---------------------------------------------------------------------
-- 4. Référentiel : programs / curriculum_versions / cohorts
-- Lecture limitée aux programmes de ses inscriptions ou de ses rôles.
-- ---------------------------------------------------------------------
create policy programs_select_scoped on public.programs
  for select to authenticated
  using (
    public.is_enrolled_in_program(id)
    or public.has_program_role(id, 'teacher')
    or public.has_program_role(id, 'placement_supervisor')
    or public.can_administer_program(id)
  );

create policy programs_insert_admin on public.programs
  for insert to authenticated with check (public.is_platform_admin());
create policy programs_update_admin on public.programs
  for update to authenticated
  using (public.can_administer_program(id))
  with check (public.can_administer_program(id));
create policy programs_delete_platform_admin on public.programs
  for delete to authenticated using (public.is_platform_admin());

create policy curriculum_versions_select_scoped on public.curriculum_versions
  for select to authenticated
  using (public.is_enrolled_in_program(program_id)
         or public.has_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id));
create policy curriculum_versions_insert_admin on public.curriculum_versions
  for insert to authenticated with check (public.can_administer_program(program_id));
create policy curriculum_versions_update_admin on public.curriculum_versions
  for update to authenticated
  using (public.can_administer_program(program_id))
  with check (public.can_administer_program(program_id));
create policy curriculum_versions_delete_admin on public.curriculum_versions
  for delete to authenticated using (public.can_administer_program(program_id));

create policy cohorts_select_scoped on public.cohorts
  for select to authenticated
  using (public.is_enrolled_in_program(program_id)
         or public.has_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id));
create policy cohorts_insert_admin on public.cohorts
  for insert to authenticated with check (public.can_administer_program(program_id));
create policy cohorts_update_admin on public.cohorts
  for update to authenticated
  using (public.can_administer_program(program_id))
  with check (public.can_administer_program(program_id));
create policy cohorts_delete_admin on public.cohorts
  for delete to authenticated using (public.can_administer_program(program_id));

-- ---------------------------------------------------------------------
-- 5. enrollments — l'apprenant lit les siennes, ne s'inscrit pas lui-même
-- ---------------------------------------------------------------------
create policy enrollments_select_own on public.enrollments
  for select to authenticated using (person_id = auth.uid());

create policy enrollments_select_scoped on public.enrollments
  for select to authenticated
  using (public.has_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id)
         or exists (
           select 1 from public.placement_assignments pa
           where pa.enrollment_id = public.enrollments.id
             and public.supervises_placement(pa.placement_id)
         ));

-- Aucune auto-inscription : l'inscription est un acte administratif.
create policy enrollments_insert_admin on public.enrollments
  for insert to authenticated with check (public.can_administer_program(program_id));
create policy enrollments_update_admin on public.enrollments
  for update to authenticated
  using (public.can_administer_program(program_id))
  with check (public.can_administer_program(program_id));
create policy enrollments_delete_platform_admin on public.enrollments
  for delete to authenticated using (public.is_platform_admin());

-- ---------------------------------------------------------------------
-- 6. role_assignments — anti-escalade de privilèges
-- ---------------------------------------------------------------------
create policy role_assignments_select_own on public.role_assignments
  for select to authenticated using (person_id = auth.uid());

create policy role_assignments_select_admin on public.role_assignments
  for select to authenticated
  using (public.is_platform_admin()
         or (program_id is not null and public.can_administer_program(program_id)));

-- Un utilisateur ne peut jamais s'accorder un rôle : person_id <> auth.uid().
-- Un admin de programme ne peut accorder que dans SON programme, et jamais
-- un rôle de portée plateforme.
create policy role_assignments_insert_admin on public.role_assignments
  for insert to authenticated
  with check (
    person_id <> auth.uid()
    and (
      public.is_platform_admin()
      or (scope_kind <> 'platform'
          and program_id is not null
          and public.can_administer_program(program_id))
    )
  );

-- La révocation est une UPDATE ; élargir sa propre portée reste impossible.
create policy role_assignments_update_admin on public.role_assignments
  for update to authenticated
  using (
    person_id <> auth.uid()
    and (public.is_platform_admin()
         or (scope_kind <> 'platform' and program_id is not null
             and public.can_administer_program(program_id)))
  )
  with check (
    person_id <> auth.uid()
    and (public.is_platform_admin()
         or (scope_kind <> 'platform' and program_id is not null
             and public.can_administer_program(program_id)))
  );

-- Pas de DELETE client : on révoque (revoked_at), on ne supprime pas l'historique.

-- ---------------------------------------------------------------------
-- 7. outcomes / outcome_relations — lecture pédagogique
-- ---------------------------------------------------------------------
create policy outcomes_select_scoped on public.outcomes
  for select to authenticated
  using (public.is_enrolled_in_program(program_id)
         or public.has_program_role(program_id, 'teacher')
         or public.has_program_role(program_id, 'placement_supervisor')
         or public.can_administer_program(program_id));
create policy outcomes_insert_admin on public.outcomes
  for insert to authenticated with check (public.can_administer_program(program_id));
create policy outcomes_update_admin on public.outcomes
  for update to authenticated
  using (public.can_administer_program(program_id))
  with check (public.can_administer_program(program_id));
create policy outcomes_delete_admin on public.outcomes
  for delete to authenticated using (public.can_administer_program(program_id));

create policy outcome_relations_select_scoped on public.outcome_relations
  for select to authenticated
  using (exists (select 1 from public.outcomes o
                 where o.id = from_outcome_id
                   and (public.is_enrolled_in_program(o.program_id)
                        or public.has_program_role(o.program_id, 'teacher')
                        or public.can_administer_program(o.program_id))));
create policy outcome_relations_insert_admin on public.outcome_relations
  for insert to authenticated
  with check (exists (select 1 from public.outcomes o
                      where o.id = from_outcome_id
                        and public.can_administer_program(o.program_id)));
create policy outcome_relations_delete_admin on public.outcome_relations
  for delete to authenticated
  using (exists (select 1 from public.outcomes o
                 where o.id = from_outcome_id
                   and public.can_administer_program(o.program_id)));
-- Pas d'UPDATE : la clé primaire porte tout le sens ; on supprime/recrée.

-- ---------------------------------------------------------------------
-- 8. Ressources
-- ---------------------------------------------------------------------
create policy learning_resources_select_scoped on public.learning_resources
  for select to authenticated
  using (
    (is_published and (public.is_enrolled_in_program(program_id)
                       or public.has_program_role(program_id, 'placement_supervisor')))
    or public.has_program_role(program_id, 'teacher')
    or public.can_administer_program(program_id)
  );
create policy learning_resources_insert_staff on public.learning_resources
  for insert to authenticated
  with check (public.has_program_role(program_id, 'teacher')
              or public.can_administer_program(program_id));
create policy learning_resources_update_staff on public.learning_resources
  for update to authenticated
  using (public.has_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id))
  with check (public.has_program_role(program_id, 'teacher')
             or public.can_administer_program(program_id));
create policy learning_resources_delete_admin on public.learning_resources
  for delete to authenticated using (public.can_administer_program(program_id));

create policy lro_select_scoped on public.learning_resource_outcomes
  for select to authenticated
  using (public.is_enrolled_in_program(program_id)
         or public.has_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id));
create policy lro_insert_staff on public.learning_resource_outcomes
  for insert to authenticated
  with check (public.has_program_role(program_id, 'teacher')
              or public.can_administer_program(program_id));
create policy lro_delete_staff on public.learning_resource_outcomes
  for delete to authenticated
  using (public.has_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id));

-- ---------------------------------------------------------------------
-- 9. Stages
-- ---------------------------------------------------------------------
create policy placements_select_scoped on public.placements
  for select to authenticated
  using (public.is_enrolled_in_program(program_id)
         or public.supervises_placement(id)
         or public.has_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id));
create policy placements_insert_admin on public.placements
  for insert to authenticated with check (public.can_administer_program(program_id));
create policy placements_update_admin on public.placements
  for update to authenticated
  using (public.can_administer_program(program_id))
  with check (public.can_administer_program(program_id));
create policy placements_delete_admin on public.placements
  for delete to authenticated using (public.can_administer_program(program_id));

create policy placement_supervisors_select_scoped on public.placement_supervisors
  for select to authenticated
  using (person_id = auth.uid()
         or public.is_enrolled_in_program(program_id)
         or public.can_administer_program(program_id));
-- Personne ne se déclare encadrant soi-même.
create policy placement_supervisors_insert_admin on public.placement_supervisors
  for insert to authenticated
  with check (person_id <> auth.uid() and public.can_administer_program(program_id));
create policy placement_supervisors_update_admin on public.placement_supervisors
  for update to authenticated
  using (person_id <> auth.uid() and public.can_administer_program(program_id))
  with check (person_id <> auth.uid() and public.can_administer_program(program_id));
create policy placement_supervisors_delete_admin on public.placement_supervisors
  for delete to authenticated
  using (person_id <> auth.uid() and public.can_administer_program(program_id));

create policy placement_assignments_select_own on public.placement_assignments
  for select to authenticated using (public.owns_enrollment(enrollment_id));
create policy placement_assignments_select_scoped on public.placement_assignments
  for select to authenticated
  using (public.supervises_placement(placement_id)
         or public.has_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id));
create policy placement_assignments_insert_admin on public.placement_assignments
  for insert to authenticated with check (public.can_administer_program(program_id));
create policy placement_assignments_update_staff on public.placement_assignments
  for update to authenticated
  using (public.supervises_placement(placement_id)
         or public.can_administer_program(program_id))
  with check (public.supervises_placement(placement_id)
              or public.can_administer_program(program_id));
create policy placement_assignments_delete_admin on public.placement_assignments
  for delete to authenticated using (public.can_administer_program(program_id));

-- ---------------------------------------------------------------------
-- 10. evidence — cœur du dispositif
-- ---------------------------------------------------------------------
create policy evidence_select_own on public.evidence
  for select to authenticated using (public.owns_enrollment(enrollment_id));

create policy evidence_select_scoped on public.evidence
  for select to authenticated
  using (
    (placement_assignment_id is not null and public.supervises_evidence(id))
    or public.has_program_role(program_id, 'teacher')
    or public.can_administer_program(program_id)
  );

-- L'apprenant crée SES preuves, en draft ou submitted uniquement,
-- created_by imposé à auth.uid(), statut validated interdit à la création.
create policy evidence_insert_own on public.evidence
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.owns_enrollment(enrollment_id)
    and status in ('draft', 'submitted')
    and self_declared
  );

-- Le staff peut saisir une preuve pour un apprenant de sa portée, mais jamais
-- directement en 'validated' : le passage à validated est réservé au serveur
-- après enregistrement d'une décision dans evidence_validations.
create policy evidence_insert_staff on public.evidence
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and not self_declared
    and status in ('draft', 'submitted')
    and (public.has_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id)
         or (placement_assignment_id is not null and exists (
              select 1 from public.placement_assignments pa
              where pa.id = placement_assignment_id
                and public.supervises_placement(pa.placement_id))))
  );

-- L'apprenant ne modifie que ses brouillons non validés, et ne peut ni
-- s'auto-valider ni changer de propriétaire.
create policy evidence_update_own_draft on public.evidence
  for update to authenticated
  using (
    public.owns_enrollment(enrollment_id)
    and status = 'draft'
    and not exists (select 1 from public.evidence_validations v
                    where v.evidence_id = public.evidence.id)
  )
  with check (
    public.owns_enrollment(enrollment_id)
    and created_by = auth.uid()
    and status in ('draft', 'submitted')
  );

-- Le staff de portée peut requalifier (rejected / expired) sans jamais poser
-- 'validated' depuis le client.
create policy evidence_update_staff on public.evidence
  for update to authenticated
  using (public.has_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id)
         or (placement_assignment_id is not null and public.supervises_evidence(id)))
  with check (status in ('draft', 'submitted', 'rejected', 'expired'));

-- Aucune policy DELETE : une preuve ne se supprime pas, elle change de statut.

create policy evidence_sources_select_scoped on public.evidence_sources
  for select to authenticated
  using (exists (select 1 from public.evidence ev where ev.id = evidence_id));
create policy evidence_sources_insert_own on public.evidence_sources
  for insert to authenticated
  with check (exists (
    select 1 from public.evidence ev
    where ev.id = evidence_id
      and ev.status = 'draft'
      and ev.created_by = auth.uid()
      and public.owns_enrollment(ev.enrollment_id)
  ));
-- Pas d'UPDATE ni de DELETE client : une pièce jointe est immuable.

-- ---------------------------------------------------------------------
-- 11. evidence_validations — append-only
-- ---------------------------------------------------------------------
create policy evidence_validations_select_scoped on public.evidence_validations
  for select to authenticated
  using (
    validator_person_id = auth.uid()
    or exists (select 1 from public.evidence ev
               where ev.id = evidence_id and public.owns_enrollment(ev.enrollment_id))
    or public.can_validate_evidence(evidence_id)
  );

-- Le validateur est TOUJOURS auth.uid() ; la portée est vérifiée en base.
create policy evidence_validations_insert_scoped on public.evidence_validations
  for insert to authenticated
  with check (
    validator_person_id = auth.uid()
    and public.can_validate_evidence(evidence_id)
    and (
      (validator_role = 'placement_supervisor' and public.supervises_evidence(evidence_id))
      or (validator_role = 'teacher' and exists (
            select 1 from public.evidence ev where ev.id = evidence_id
              and public.has_program_role(ev.program_id, 'teacher')))
      or (validator_role = 'administrator' and exists (
            select 1 from public.evidence ev where ev.id = evidence_id
              and public.can_administer_program(ev.program_id)))
    )
  );

-- Aucune policy UPDATE ni DELETE : journal append-only, y compris pour un admin.

-- ---------------------------------------------------------------------
-- 12. audit_events / ai_usage_events — écriture serveur uniquement
-- ---------------------------------------------------------------------
-- Aucune policy INSERT / UPDATE / DELETE pour authenticated, et aucun GRANT
-- correspondant dans 001_core_schema.sql : la double barrière est volontaire.
create policy audit_events_select_admin on public.audit_events
  for select to authenticated
  using (public.is_platform_admin()
         or (program_id is not null and public.can_administer_program(program_id)));

create policy ai_usage_select_admin on public.ai_usage_events
  for select to authenticated
  using (public.is_platform_admin()
         or (program_id is not null and public.can_administer_program(program_id)));

-- Un apprenant peut consulter sa propre consommation IA (transparence quota).
create policy ai_usage_select_self on public.ai_usage_events
  for select to authenticated using (person_id = auth.uid());

-- ---------------------------------------------------------------------
-- 13. ai_quota_policies — configurables par programme
-- ---------------------------------------------------------------------
create policy ai_quota_select_admin on public.ai_quota_policies
  for select to authenticated using (public.can_administer_program(program_id));
create policy ai_quota_insert_admin on public.ai_quota_policies
  for insert to authenticated with check (public.can_administer_program(program_id));
create policy ai_quota_update_admin on public.ai_quota_policies
  for update to authenticated
  using (public.can_administer_program(program_id))
  with check (public.can_administer_program(program_id));
create policy ai_quota_delete_platform_admin on public.ai_quota_policies
  for delete to authenticated using (public.is_platform_admin());

-- FIN — DRAFT — DO NOT EXECUTE
