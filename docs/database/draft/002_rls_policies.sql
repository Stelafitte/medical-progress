-- =====================================================================
-- DRAFT — DO NOT EXECUTE
-- Passeport Éducatif Médical — Lot 1 — matrice RLS (conception)
-- Ce fichier n'est pas une migration et n'a jamais été exécuté.
--
-- Principes :
--   * auth.uid() est la SEULE identité ; aucun identifiant fourni par le
--     client n'est jamais utilisé pour décider d'un droit.
--   * policies séparées par opération (SELECT / INSERT / UPDATE / DELETE),
--     aucun FOR ALL vague.
--   * service_role bypasse la RLS et n'est JAMAIS utilisé côté frontend.
--   * PORTÉES EXACTES : un rôle de portée cohorte n'est jamais promu en rôle
--     de programme, un encadrant n'existe que pour les stages où il est
--     explicitement déclaré dans public.placement_supervisors.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fonctions d'autorisation
--
-- Toutes : language sql, STABLE, non mutantes, search_path verrouillé sur
-- `pg_catalog, public` (pg_catalog en tête : aucun objet du search_path
-- utilisateur ne peut masquer un opérateur ou une fonction système ;
-- pg_temp est volontairement absent pour interdire toute résolution vers
-- un objet temporaire créé par l'appelant).
-- Toutes les tables sont schéma-qualifiées et auth.uid() est qualifié.
--
-- SECURITY DEFINER : uniquement là où la policy devrait lire une table
-- elle-même protégée par RLS, ce qui provoquerait soit une récursion
-- infinie, soit un résultat faussement vide. Justification par fonction :
--
--   is_platform_admin              lit role_assignments, dont les policies
--                                  appellent cette fonction → récursion.
--   has_program_wide_role          idem (role_assignments).
--   has_cohort_role                idem + cohorts.
--   has_any_program_role           idem (lecture de référentiel seulement).
--   can_administer_program         idem (role_assignments).
--   is_enrolled_in_program         lit enrollments, dont les policies
--                                  appellent les helpers → récursion.
--   owns_enrollment                idem (enrollments).
--   supervises_placement           lit placement_supervisors, dont les
--                                  policies dépendent de la portée stage.
--   supervises_enrollment_placement idem (jointure supervisors/assignments).
--   is_enrollment_academic_staff   composition des précédentes.
--   can_read_enrollment            composition des précédentes.
--   supervises_evidence            lit evidence + placement_* sous RLS.
--   can_read_evidence              composition des précédentes.
--   can_validate_evidence          composition des précédentes.
--
-- Aucune de ces fonctions n'écrit : elles sont toutes STABLE et ne
-- contiennent aucun INSERT / UPDATE / DELETE / DDL. Aucune fonction MUTANTE
-- n'est exécutable par `authenticated` (cf. 003_server_invariants.sql, dont
-- la seule fonction mutante est révoquée à PUBLIC, anon ET authenticated).
-- ---------------------------------------------------------------------

-- Admin plateforme : portée maximale.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid()
      and ra.role = 'administrator'
      and ra.scope_kind = 'platform'
      and ra.revoked_at is null
  );
$$;

-- Administration d'un programme : admin de CE programme, ou admin plateforme.
create or replace function public.can_administer_program(_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
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

-- Rôle LARGE sur un programme : uniquement scope_kind = 'program'.
-- Un rôle de portée cohorte ou stage NE remonte PAS ici.
create or replace function public.has_program_wide_role(
  _program_id uuid, _role public.role_name)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid()
      and ra.role = _role
      and ra.scope_kind = 'program'
      and ra.program_id = _program_id
      and ra.revoked_at is null
  );
$$;

-- Rôle sur une COHORTE précise : rôle de portée cohorte sur cette cohorte,
-- ou rôle large sur le programme de cette cohorte (héritage descendant only).
create or replace function public.has_cohort_role(
  _cohort_id uuid, _role public.role_name)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid()
      and ra.role = _role
      and ra.scope_kind = 'cohort'
      and ra.cohort_id = _cohort_id
      and ra.revoked_at is null
  ) or exists (
    select 1 from public.cohorts c
    where c.id = _cohort_id
      and public.has_program_wide_role(c.program_id, _role)
  );
$$;

-- Rôle détenu à N'IMPORTE QUELLE portée dans un programme.
-- USAGE STRICTEMENT LIMITÉ à la lecture du RÉFÉRENTIEL non nominatif
-- (programme, curriculum, acquis, ressources) : un enseignant de cohorte doit
-- pouvoir lire le référentiel du programme. Cette fonction ne doit JAMAIS
-- servir à autoriser l'accès à des données nominatives d'apprenant.
create or replace function public.has_any_program_role(
  _program_id uuid, _role public.role_name)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid()
      and ra.role = _role
      and ra.program_id = _program_id
      and ra.revoked_at is null
  );
$$;

-- L'utilisateur est-il inscrit au programme ?
create or replace function public.is_enrolled_in_program(_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
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
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = _enrollment_id and e.person_id = auth.uid()
  );
$$;

-- Encadrant EXPLICITEMENT déclaré de ce stage. Aucune autre voie n'existe.
create or replace function public.supervises_placement(_placement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.placement_supervisors ps
    where ps.placement_id = _placement_id
      and ps.person_id = auth.uid()
  );
$$;

-- L'utilisateur encadre-t-il un stage où CETTE inscription est affectée ?
create or replace function public.supervises_enrollment_placement(_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.placement_assignments pa
    join public.placement_supervisors ps on ps.placement_id = pa.placement_id
    where pa.enrollment_id = _enrollment_id
      and ps.person_id = auth.uid()
  );
$$;

-- Encadrement pédagogique NOMINATIF d'une inscription : admin de portée,
-- enseignant du programme (portée programme) ou enseignant de LA cohorte
-- de cette inscription. Un enseignant de la cohorte A n'obtient jamais
-- l'accès aux inscriptions de la cohorte B du même programme.
create or replace function public.is_enrollment_academic_staff(_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = _enrollment_id
      and (
        public.can_administer_program(e.program_id)
        or public.has_program_wide_role(e.program_id, 'teacher')
        or public.has_cohort_role(e.cohort_id, 'teacher')
      )
  );
$$;

-- Lecture d'une inscription : son titulaire, l'encadrement pédagogique de
-- portée, ou l'encadrant d'un stage où elle est affectée.
create or replace function public.can_read_enrollment(_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.owns_enrollment(_enrollment_id)
     or public.is_enrollment_academic_staff(_enrollment_id)
     or public.supervises_enrollment_placement(_enrollment_id);
$$;

-- L'utilisateur encadre-t-il le stage auquel CETTE preuve est rattachée ?
-- Une preuve sans placement_assignment_id ne relève jamais d'un encadrant.
create or replace function public.supervises_evidence(_evidence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.evidence ev
    join public.placement_assignments pa on pa.id = ev.placement_assignment_id
    join public.placement_supervisors ps on ps.placement_id = pa.placement_id
    where ev.id = _evidence_id
      and ev.placement_assignment_id is not null
      and ps.person_id = auth.uid()
  );
$$;

-- Lecture d'une preuve : son titulaire, l'encadrement pédagogique de portée
-- (cohorte exacte incluse), ou l'encadrant du stage de CETTE preuve.
-- Un encadrant ne voit PAS les preuves hors stage de l'apprenant qu'il encadre.
create or replace function public.can_read_evidence(_evidence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.evidence ev
    where ev.id = _evidence_id
      and (
        public.owns_enrollment(ev.enrollment_id)
        or public.is_enrollment_academic_staff(ev.enrollment_id)
        or public.supervises_evidence(ev.id)
      )
  );
$$;

-- Validation d'une preuve : jamais son propre dossier, jamais sa propre
-- saisie, jamais hors portée exacte.
create or replace function public.can_validate_evidence(_evidence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
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
        or public.is_enrollment_academic_staff(ev.enrollment_id)
      )
  );
$$;

-- Exposition des fonctions : owner postgres, aucune exécution par PUBLIC
-- ni anon, EXECUTE accordé aux seuls helpers de lecture nécessaires.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.is_platform_admin()',
    'public.can_administer_program(uuid)',
    'public.has_program_wide_role(uuid, public.role_name)',
    'public.has_cohort_role(uuid, public.role_name)',
    'public.has_any_program_role(uuid, public.role_name)',
    'public.is_enrolled_in_program(uuid)',
    'public.owns_enrollment(uuid)',
    'public.supervises_placement(uuid)',
    'public.supervises_enrollment_placement(uuid)',
    'public.is_enrollment_academic_staff(uuid)',
    'public.can_read_enrollment(uuid)',
    'public.supervises_evidence(uuid)',
    'public.can_read_evidence(uuid)',
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
alter table public.learning_resource_assets   enable row level security;
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
-- 3. profiles — portée nominative strictement bornée
-- ---------------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());

-- Encadrement : on ne voit le profil d'un apprenant que si l'on a une portée
-- nominative sur AU MOINS UNE de ses inscriptions (cohorte exacte pour un
-- enseignant de cohorte, stage encadré pour un encadrant).
create policy profiles_select_scoped_learner on public.profiles
  for select to authenticated
  using (exists (
    select 1 from public.enrollments e
    where e.person_id = public.profiles.id
      and (public.is_enrollment_academic_staff(e.id)
           or public.supervises_enrollment_placement(e.id))
  ));

-- Réciproque : un apprenant voit le profil des encadrants de SES stages.
create policy profiles_select_own_supervisors on public.profiles
  for select to authenticated
  using (exists (
    select 1
    from public.placement_supervisors ps
    join public.placement_assignments pa on pa.placement_id = ps.placement_id
    where ps.person_id = public.profiles.id
      and public.owns_enrollment(pa.enrollment_id)
  ));

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and source_system = 'native');

-- WITH CHECK sur id = auth.uid() SEULEMENT : un profil importé du legacy
-- (source_system <> 'native') doit pouvoir corriger son nom et sa locale sans
-- devoir réécrire son origine. L'immuabilité des 4 colonnes de provenance est
-- garantie par enforce_source_provenance() (003_server_invariants.sql), et
-- updated_at par set_updated_at().
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Aucune policy DELETE : la suppression passe par auth.users (serveur).

-- ---------------------------------------------------------------------
-- 4. Référentiel : programs / curriculum_versions / cohorts
-- Lecture non nominative → has_any_program_role est acceptable ici.
-- ---------------------------------------------------------------------
create policy programs_select_scoped on public.programs
  for select to authenticated
  using (
    public.is_enrolled_in_program(id)
    or public.has_any_program_role(id, 'teacher')
    or public.has_any_program_role(id, 'placement_supervisor')
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
         or public.has_any_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id));
create policy curriculum_versions_insert_admin on public.curriculum_versions
  for insert to authenticated with check (public.can_administer_program(program_id));
create policy curriculum_versions_update_admin on public.curriculum_versions
  for update to authenticated
  using (public.can_administer_program(program_id))
  with check (public.can_administer_program(program_id));
create policy curriculum_versions_delete_admin on public.curriculum_versions
  for delete to authenticated using (public.can_administer_program(program_id));

-- Une cohorte est une donnée de référentiel, mais un enseignant de cohorte ne
-- doit voir QUE sa cohorte : d'où has_cohort_role et non has_any_program_role.
create policy cohorts_select_scoped on public.cohorts
  for select to authenticated
  using (public.is_enrolled_in_program(program_id)
         or public.has_program_wide_role(program_id, 'teacher')
         or public.has_cohort_role(id, 'teacher')
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
-- 5. enrollments — portée nominative exacte
-- ---------------------------------------------------------------------
create policy enrollments_select_own on public.enrollments
  for select to authenticated using (person_id = auth.uid());

-- Enseignant de cohorte : SA cohorte uniquement.
-- Encadrant : uniquement les inscriptions affectées à ses stages.
create policy enrollments_select_scoped on public.enrollments
  for select to authenticated
  using (public.is_enrollment_academic_staff(id)
         or public.supervises_enrollment_placement(id));

-- Aucune auto-inscription : l'inscription est un acte administratif.
create policy enrollments_insert_admin on public.enrollments
  for insert to authenticated
  with check (public.can_administer_program(program_id) and source_system = 'native');
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
    and source_system = 'native'
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
-- 7. outcomes / outcome_relations — lecture pédagogique (non nominative)
-- ---------------------------------------------------------------------
create policy outcomes_select_scoped on public.outcomes
  for select to authenticated
  using (public.is_enrolled_in_program(program_id)
         or public.has_any_program_role(program_id, 'teacher')
         or public.has_any_program_role(program_id, 'placement_supervisor')
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
                        or public.has_any_program_role(o.program_id, 'teacher')
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
-- 8. Ressources et assets
-- ---------------------------------------------------------------------
create policy learning_resources_select_scoped on public.learning_resources
  for select to authenticated
  using (
    (is_published and (public.is_enrolled_in_program(program_id)
                       or public.has_any_program_role(program_id, 'placement_supervisor')))
    or public.has_any_program_role(program_id, 'teacher')
    or public.can_administer_program(program_id)
  );
create policy learning_resources_insert_staff on public.learning_resources
  for insert to authenticated
  with check ((public.has_any_program_role(program_id, 'teacher')
               or public.can_administer_program(program_id))
              and source_system = 'native');
create policy learning_resources_update_staff on public.learning_resources
  for update to authenticated
  using (public.has_any_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id))
  with check (public.has_any_program_role(program_id, 'teacher')
             or public.can_administer_program(program_id));
create policy learning_resources_delete_admin on public.learning_resources
  for delete to authenticated using (public.can_administer_program(program_id));

-- Liaisons ressource ↔ acquis : un apprenant ne doit PAS voir les liaisons
-- d'une ressource non publiée (elles révéleraient un contenu à venir).
-- La visibilité est strictement calquée sur celle de la ressource parente.
create policy lro_select_scoped on public.learning_resource_outcomes
  for select to authenticated
  using (exists (
    select 1 from public.learning_resources lr
    where lr.id = learning_resource_id
      and (
        (lr.is_published and (public.is_enrolled_in_program(lr.program_id)
                              or public.has_any_program_role(lr.program_id, 'placement_supervisor')))
        or public.has_any_program_role(lr.program_id, 'teacher')
        or public.can_administer_program(lr.program_id)
      )
  ));
create policy lro_insert_staff on public.learning_resource_outcomes
  for insert to authenticated
  with check (public.has_any_program_role(program_id, 'teacher')
              or public.can_administer_program(program_id));
create policy lro_delete_staff on public.learning_resource_outcomes
  for delete to authenticated
  using (public.has_any_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id));

-- Assets : métadonnées seules. Même visibilité que la ressource parente ;
-- un asset d'une ressource non publiée reste invisible à l'apprenant, et un
-- asset non 'ready' n'est pas exposé (traitement/antivirus en cours).
create policy lra_select_scoped on public.learning_resource_assets
  for select to authenticated
  using (exists (
    select 1 from public.learning_resources lr
    where lr.id = learning_resource_id
      and (
        (lr.is_published
         and public.learning_resource_assets.processing_status = 'ready'
         and (public.is_enrolled_in_program(lr.program_id)
              or public.has_any_program_role(lr.program_id, 'placement_supervisor')))
        or public.has_any_program_role(lr.program_id, 'teacher')
        or public.can_administer_program(lr.program_id)
      )
  ));
-- AUCUNE policy INSERT/UPDATE/DELETE, et aucun GRANT d'écriture (001 §12.8) :
-- les métadonnées d'asset sont écrites uniquement par le backend en
-- service_role, après revérification de l'autorisation métier (service_role
-- contourne la RLS). Le navigateur ne peut donc ni choisir bucket_name /
-- object_path / storage_provider, ni falsifier checksum_sha256 / byte_size, ni
-- mettre processing_status = 'ready'. Flux : storage_architecture.md §2.

-- ---------------------------------------------------------------------
-- 9. Stages
-- ---------------------------------------------------------------------
create policy placements_select_scoped on public.placements
  for select to authenticated
  using (public.is_enrolled_in_program(program_id)
         or public.supervises_placement(id)
         or public.has_any_program_role(program_id, 'teacher')
         or public.can_administer_program(program_id));
create policy placements_insert_admin on public.placements
  for insert to authenticated with check (public.can_administer_program(program_id));
create policy placements_update_admin on public.placements
  for update to authenticated
  using (public.can_administer_program(program_id))
  with check (public.can_administer_program(program_id));
create policy placements_delete_admin on public.placements
  for delete to authenticated using (public.can_administer_program(program_id));

-- Un encadrant voit ses propres lignes et celles de ses stages ; un apprenant
-- voit les encadrants des stages où il est affecté (pas tous ceux du programme).
create policy placement_supervisors_select_scoped on public.placement_supervisors
  for select to authenticated
  using (person_id = auth.uid()
         or public.supervises_placement(placement_id)
         or public.can_administer_program(program_id)
         or exists (
           select 1 from public.placement_assignments pa
           where pa.placement_id = public.placement_supervisors.placement_id
             and public.owns_enrollment(pa.enrollment_id)
         ));
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
         or public.is_enrollment_academic_staff(enrollment_id));
create policy placement_assignments_insert_admin on public.placement_assignments
  for insert to authenticated
  with check (public.can_administer_program(program_id) and source_system = 'native');
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

-- Enseignant de cohorte : preuves de SA cohorte seulement.
-- Encadrant : preuves rattachées à un stage qu'il encadre seulement.
create policy evidence_select_scoped on public.evidence
  for select to authenticated
  using (public.is_enrollment_academic_staff(enrollment_id)
         or (placement_assignment_id is not null and public.supervises_evidence(id)));

-- L'apprenant crée SES preuves, en draft ou submitted uniquement,
-- created_by imposé à auth.uid(), statut validated interdit à la création,
-- provenance forcée à 'native' (aucune falsification d'import legacy).
create policy evidence_insert_own on public.evidence
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.owns_enrollment(enrollment_id)
    and status in ('draft', 'submitted')
    and self_declared
    and source_system = 'native'
  );

-- Le staff peut saisir une preuve pour un apprenant de SA portée exacte, mais
-- jamais directement en 'validated' : le passage à validated est réservé au
-- trigger serveur de 003_server_invariants.sql.
create policy evidence_insert_staff on public.evidence
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and not self_declared
    and status in ('draft', 'submitted')
    and source_system = 'native'
    and (
      public.is_enrollment_academic_staff(enrollment_id)
      or (placement_assignment_id is not null and exists (
            select 1 from public.placement_assignments pa
            where pa.id = placement_assignment_id
              and public.supervises_placement(pa.placement_id)))
    )
  );

-- L'apprenant ne modifie que ses brouillons non encore jugés. Les colonnes
-- d'identité ne lui sont de toute façon pas accordées (GRANT de colonnes).
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
    and status in ('draft', 'submitted')
  );

-- Le staff de portée peut requalifier (rejected / expired) sans jamais poser
-- 'validated' depuis le client.
create policy evidence_update_staff on public.evidence
  for update to authenticated
  using (public.is_enrollment_academic_staff(enrollment_id)
         or (placement_assignment_id is not null and public.supervises_evidence(id)))
  with check (status in ('draft', 'submitted', 'rejected', 'expired'));

-- Aucune policy DELETE : une preuve ne se supprime pas, elle change de statut.

-- Pièces jointes : visibilité strictement identique à celle de la preuve.
create policy evidence_sources_select_scoped on public.evidence_sources
  for select to authenticated
  using (public.can_read_evidence(evidence_id));
create policy evidence_sources_insert_own on public.evidence_sources
  for insert to authenticated
  with check (exists (
    select 1 from public.evidence ev
    where ev.id = evidence_id
      and ev.status = 'draft'
      and ev.created_by = auth.uid()
      and public.owns_enrollment(ev.enrollment_id)
  ) and source_system = 'native');
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
    or public.can_read_evidence(evidence_id)
  );

-- Le validateur est TOUJOURS auth.uid() ; la portée exacte est revérifiée,
-- et le rôle déclaré doit correspondre à une portée réellement détenue.
create policy evidence_validations_insert_scoped on public.evidence_validations
  for insert to authenticated
  with check (
    validator_person_id = auth.uid()
    and source_system = 'native'
    and public.can_validate_evidence(evidence_id)
    and (
      (validator_role = 'placement_supervisor' and public.supervises_evidence(evidence_id))
      or (validator_role = 'teacher' and exists (
            select 1 from public.evidence ev
            where ev.id = evidence_id
              and (public.has_program_wide_role(ev.program_id, 'teacher')
                   or exists (select 1 from public.enrollments e
                              where e.id = ev.enrollment_id
                                and public.has_cohort_role(e.cohort_id, 'teacher')))))
      or (validator_role = 'administrator' and exists (
            select 1 from public.evidence ev where ev.id = evidence_id
              and public.can_administer_program(ev.program_id)))
    )
  );

-- Aucune policy UPDATE ni DELETE : journal append-only, y compris pour un admin.

-- ---------------------------------------------------------------------
-- 12. audit_events / ai_usage_events — lecture seule, écriture serveur
-- ---------------------------------------------------------------------
-- GRANT SELECT accordé à authenticated (cf. 001 §12.1) ; aucun privilège
-- INSERT/UPDATE/DELETE et aucune policy correspondante : double barrière.
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


-- =====================================================================
-- 14. PLAN D'ACQUISITION — fonctions d'autorisation complémentaires
-- Mêmes règles que §1 : SECURITY DEFINER (pour ne pas relire une table dont la
-- policy appelle la fonction → récursion), STABLE, language sql, aucune
-- écriture, search_path = pg_catalog, public, identité issue de auth.uid() seul.
-- =====================================================================

-- L'apprenant voit un template s'il est inscrit au programme ET que le template
-- est publié (et, si le template cible une cohorte, que c'est SA cohorte).
create or replace function public.can_read_plan_template(_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.acquisition_plan_templates t
     where t.id = _template_id
       and (
         public.can_administer_program(t.program_id)
         or public.has_program_wide_role(t.program_id, 'teacher')
         or (t.cohort_id is not null and public.has_cohort_role(t.cohort_id, 'teacher'))
         or (
           t.status = 'published'
           and exists (
             select 1
               from public.enrollments e
              where e.person_id = auth.uid()
                and e.program_id = t.program_id
                and (t.cohort_id is null or e.cohort_id = t.cohort_id)
           )
         )
       )
  )
$$;

-- Un encadrant ne voit un élément de plan que s'il est explicitement encadrant
-- DU STAGE rattaché à cet élément — jamais tout le plan de l'apprenant.
create or replace function public.supervises_plan_item(_plan_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.acquisition_plan_items i
      join public.placement_assignments pa on pa.id = i.placement_assignment_id
      join public.placement_supervisors ps on ps.placement_id = pa.placement_id
     where i.id = _plan_item_id
       and ps.person_id = auth.uid()
  )
$$;

create or replace function public.can_read_plan_item(_plan_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.acquisition_plan_items i
     where i.id = _plan_item_id
       and (
         public.owns_enrollment(i.enrollment_id)
         or public.is_enrollment_academic_staff(i.enrollment_id)
       )
  )
  or public.supervises_plan_item(_plan_item_id)
$$;

create or replace function public.can_read_plan_change_request(_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.plan_change_requests r
     where r.id = _request_id
       and (
         public.owns_enrollment(r.enrollment_id)
         or public.is_enrollment_academic_staff(r.enrollment_id)
         or public.supervises_plan_item(r.plan_item_id)
       )
  )
$$;

-- Qui peut DÉCIDER : strictement le rôle exigé par la demande, dans la portée
-- exacte. Une demande clinique n'est jamais décidable par un enseignant, et une
-- demande d'échéance officielle n'est jamais décidable par un encadrant.
create or replace function public.can_decide_plan_change_request(_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.plan_change_requests r
     where r.id = _request_id
       and r.status = 'pending'
       -- Un demandeur ne décide jamais sa propre demande.
       and r.requested_by <> auth.uid()
       and (
         case r.required_approver_role
           when 'placement_supervisor'
             then public.supervises_plan_item(r.plan_item_id)
           when 'teacher_or_admin'
             then public.can_administer_program(r.program_id)
               or public.is_enrollment_academic_staff(r.enrollment_id)
           -- auto_accept : aucune décision humaine n'est requise ni permise.
           else false
         end
       )
  )
$$;

grant execute on function
  public.can_read_plan_template(uuid),
  public.supervises_plan_item(uuid),
  public.can_read_plan_item(uuid),
  public.can_read_plan_change_request(uuid),
  public.can_decide_plan_change_request(uuid)
  to authenticated;
revoke all on function
  public.can_read_plan_template(uuid),
  public.supervises_plan_item(uuid),
  public.can_read_plan_item(uuid),
  public.can_read_plan_change_request(uuid),
  public.can_decide_plan_change_request(uuid)
  from anon, public;

-- ---------------------------------------------------------------------
-- 14.1 Activation de la RLS sur les 8 nouvelles tables
-- ---------------------------------------------------------------------
alter table public.acquisition_plan_templates enable row level security;
alter table public.acquisition_plan_template_items enable row level security;
alter table public.acquisition_plan_template_item_dependencies enable row level security;
alter table public.acquisition_plans enable row level security;
alter table public.acquisition_plan_items enable row level security;
alter table public.plan_change_requests enable row level security;
alter table public.plan_change_decisions enable row level security;
alter table public.passport_share_preferences enable row level security;
-- Aucune table sans policy : ci-dessous, une policy par opération et par rôle.
-- Aucun FOR ALL, aucun `using (true)`.

-- ---------------------------------------------------------------------
-- 15. Templates et items de template
-- ---------------------------------------------------------------------
create policy apt_select_scoped on public.acquisition_plan_templates
  for select to authenticated
  using (public.can_read_plan_template(id));

create policy apt_insert_admin on public.acquisition_plan_templates
  for insert to authenticated
  with check (
    public.can_administer_program(program_id)
    and status = 'draft'
    and published_at is null
  );

-- Un template published ou retired n'est plus modifiable (double garde :
-- ici par policy, et par le trigger 003 §6 pour service_role).
create policy apt_update_admin_draft on public.acquisition_plan_templates
  for update to authenticated
  using (public.can_administer_program(program_id) and status = 'draft')
  with check (public.can_administer_program(program_id) and status = 'draft');

create policy apt_delete_admin_draft on public.acquisition_plan_templates
  for delete to authenticated
  using (public.can_administer_program(program_id) and status = 'draft');

create policy apti_select_scoped on public.acquisition_plan_template_items
  for select to authenticated
  using (public.can_read_plan_template(template_id));

create policy apti_insert_admin on public.acquisition_plan_template_items
  for insert to authenticated
  with check (
    public.can_administer_program(program_id)
    and exists (
      select 1 from public.acquisition_plan_templates t
       where t.id = template_id and t.status = 'draft'
    )
  );

create policy apti_update_admin_draft on public.acquisition_plan_template_items
  for update to authenticated
  using (
    public.can_administer_program(program_id)
    and exists (select 1 from public.acquisition_plan_templates t
                 where t.id = template_id and t.status = 'draft')
  )
  with check (
    public.can_administer_program(program_id)
    and exists (select 1 from public.acquisition_plan_templates t
                 where t.id = template_id and t.status = 'draft')
  );

create policy apti_delete_admin_draft on public.acquisition_plan_template_items
  for delete to authenticated
  using (
    public.can_administer_program(program_id)
    and exists (select 1 from public.acquisition_plan_templates t
                 where t.id = template_id and t.status = 'draft')
  );

create policy aptid_select_scoped on public.acquisition_plan_template_item_dependencies
  for select to authenticated
  using (public.can_read_plan_template(template_id));

create policy aptid_insert_admin on public.acquisition_plan_template_item_dependencies
  for insert to authenticated
  with check (
    exists (select 1 from public.acquisition_plan_templates t
             where t.id = template_id
               and t.status = 'draft'
               and public.can_administer_program(t.program_id))
  );

create policy aptid_delete_admin on public.acquisition_plan_template_item_dependencies
  for delete to authenticated
  using (
    exists (select 1 from public.acquisition_plan_templates t
             where t.id = template_id
               and t.status = 'draft'
               and public.can_administer_program(t.program_id))
  );

-- ---------------------------------------------------------------------
-- 16. Plans individuels et éléments planifiés
-- Aucune policy INSERT/UPDATE/DELETE sur acquisition_plans : l'instanciation
-- d'un plan est une opération serveur (service_role) après revérification
-- métier — un client ne s'attribue pas un plan.
-- ---------------------------------------------------------------------
create policy ap_select_own on public.acquisition_plans
  for select to authenticated
  using (public.owns_enrollment(enrollment_id));

create policy ap_select_staff on public.acquisition_plans
  for select to authenticated
  using (
    public.is_enrollment_academic_staff(enrollment_id)
    or public.can_administer_program(program_id)
  );

create policy api_select_own on public.acquisition_plan_items
  for select to authenticated
  using (public.owns_enrollment(enrollment_id));

create policy api_select_staff on public.acquisition_plan_items
  for select to authenticated
  using (
    public.is_enrollment_academic_staff(enrollment_id)
    or public.can_administer_program(program_id)
  );

-- L'encadrant ne voit QUE les éléments rattachés à un stage qu'il supervise.
create policy api_select_supervisor on public.acquisition_plan_items
  for select to authenticated
  using (public.supervises_plan_item(id));

-- L'apprenant ajuste sa cible personnelle et son état de planification.
-- Les colonnes officielles ne lui sont pas accordées (001 §13.9) ; la cible
-- personnelle doit rester dans la fenêtre officielle (trigger 003 §7).
create policy api_update_own_personal on public.acquisition_plan_items
  for update to authenticated
  using (public.owns_enrollment(enrollment_id))
  with check (public.owns_enrollment(enrollment_id));

-- ---------------------------------------------------------------------
-- 17. Demandes de modification
-- ---------------------------------------------------------------------
create policy pcr_select_scoped on public.plan_change_requests
  for select to authenticated
  using (public.can_read_plan_change_request(id));

create policy pcr_insert_own_draft on public.plan_change_requests
  for insert to authenticated
  with check (
    public.owns_enrollment(enrollment_id)
    and requested_by = auth.uid()
    and status = 'draft'
    and decided_at is null
    and withdrawn_at is null
    -- L'élément visé doit appartenir à SON plan.
    and exists (select 1 from public.acquisition_plan_items i
                 where i.id = plan_item_id
                   and i.enrollment_id = enrollment_id)
  );

-- Le titulaire modifie son brouillon, le soumet, ou le retire.
-- Il ne peut jamais écrire 'approved' / 'rejected' : ces états ne sont posés
-- que par le trigger d'application (003 §9), en conséquence d'une décision.
create policy pcr_update_own_lifecycle on public.plan_change_requests
  for update to authenticated
  using (
    public.owns_enrollment(enrollment_id)
    and requested_by = auth.uid()
    and status in ('draft', 'pending')
  )
  with check (
    public.owns_enrollment(enrollment_id)
    and status in ('draft', 'pending', 'withdrawn')
  );
-- Aucune policy DELETE : une demande se retire, elle ne s'efface pas.

-- ---------------------------------------------------------------------
-- 18. Décisions — append-only, rôle exigé exact
-- ---------------------------------------------------------------------
create policy pcd_select_scoped on public.plan_change_decisions
  for select to authenticated
  using (public.can_read_plan_change_request(request_id));

create policy pcd_insert_authorized on public.plan_change_decisions
  for insert to authenticated
  with check (
    reviewer_person_id = auth.uid()
    and public.can_decide_plan_change_request(request_id)
    -- Le rôle déclaré doit correspondre au rôle réellement détenu et exigé.
    and (
      (reviewer_role = 'placement_supervisor'
        and exists (select 1 from public.plan_change_requests r
                     where r.id = request_id
                       and r.required_approver_role = 'placement_supervisor'
                       and public.supervises_plan_item(r.plan_item_id)))
      or (reviewer_role = 'teacher'
        and exists (select 1 from public.plan_change_requests r
                     where r.id = request_id
                       and r.required_approver_role = 'teacher_or_admin'
                       and public.is_enrollment_academic_staff(r.enrollment_id)))
      or (reviewer_role = 'administrator'
        and exists (select 1 from public.plan_change_requests r
                     where r.id = request_id
                       and r.required_approver_role = 'teacher_or_admin'
                       and public.can_administer_program(r.program_id)))
    )
  );
-- Aucune policy UPDATE ni DELETE : le journal est append-only.

-- ---------------------------------------------------------------------
-- 19. Préférences de partage — titulaire uniquement
-- RAPPEL : ces lignes ne sont lues par AUCUNE autre policy de ce fichier.
-- Elles ne réduisent jamais la visibilité institutionnelle : un enseignant de
-- portée continue de lire les preuves et validations de l'apprenant même si
-- toutes les préférences sont désactivées.
-- ---------------------------------------------------------------------
create policy psp_select_own on public.passport_share_preferences
  for select to authenticated
  using (public.owns_enrollment(enrollment_id));

create policy psp_insert_own on public.passport_share_preferences
  for insert to authenticated
  with check (public.owns_enrollment(enrollment_id));

create policy psp_update_own on public.passport_share_preferences
  for update to authenticated
  using (public.owns_enrollment(enrollment_id))
  with check (public.owns_enrollment(enrollment_id));

create policy psp_delete_own on public.passport_share_preferences
  for delete to authenticated
  using (public.owns_enrollment(enrollment_id));


-- FIN — DRAFT — DO NOT EXECUTE
