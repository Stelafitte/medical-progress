-- =====================================================================
-- DRAFT — DO NOT EXECUTE
-- Plan de tests d'acceptation RLS — Lot 1
-- Non exécuté : aucune base n'est activée. Ce fichier est un plan de test
-- transactionnel destiné à être joué APRÈS provisioning, en recette.
--
-- Dépendances nécessaires avant exécution :
--   * 001_core_schema.sql et 002_rls_policies.sql appliqués ;
--   * extension pgtap (recommandé) OU exécution manuelle avec lecture des
--     ASSERT ci-dessous ;
--   * 003_server_invariants.sql appliqué (trigger de dérivation de statut) ;
--   * utilisateurs auth de test créés dans auth.users (learner_a, learner_b,
--     learner_c, supervisor_1, supervisor_2, teacher_cohort_a, teacher_cohort_b,
--     teacher_dfasm, admin_diu, admin_platform) ;
--   * capacité à simuler un JWT : set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
--   * jeu de données minimal : 2 programmes (DIU, DFASM), DEUX cohortes du MÊME
--     programme DIU (cohorte A et cohorte B), 2 stages du DIU avec des encadrants
--     distincts, 1 outcome real_competence par programme, 1 ressource publiée et
--     1 ressource non publiée avec leurs liaisons et assets (un asset `ready`,
--     un asset `pending`), et un profil importé du legacy (`learner_legacy`,
--     `source_system = 'dfasm-learnhub'`) inséré en service_role.
--
-- Convention : tout le plan tourne dans UNE transaction terminée par ROLLBACK.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Helpers de test (locaux à la transaction)
-- ---------------------------------------------------------------------
create or replace function pg_temp.act_as(_uid uuid) returns void
language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format(
    'set local request.jwt.claims = %L',
    json_build_object('sub', _uid, 'role', 'authenticated')::text
  );
end $$;

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  execute 'set local role service_role';
  execute 'set local request.jwt.claims = ''{"role":"service_role"}''';
end $$;

-- ---------------------------------------------------------------------
-- 0. Fixtures (insérées en service_role, RLS bypassée)
-- ---------------------------------------------------------------------
select pg_temp.as_service();
-- TODO recette : INSERT programs / curriculum_versions / cohorts / outcomes /
-- placements / placement_supervisors / enrollments / placement_assignments /
-- role_assignments, en conservant les uuid dans des variables psql \set.
-- Les identifiants ci-dessous sont symboliques.

-- ---------------------------------------------------------------------
-- T1. Un apprenant A ne lit pas les preuves de B
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'learner_a');
-- ATTENDU : 0 ligne
-- assert (select count(*) from public.evidence
--         where enrollment_id = :'enrollment_b') = 0;
-- ATTENDU : ses propres preuves visibles (> 0)
-- assert (select count(*) from public.evidence
--         where enrollment_id = :'enrollment_a') > 0;

-- ---------------------------------------------------------------------
-- T2. Inscription multi-programmes avec un seul compte
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'learner_a');
-- ATTENDU : 2 inscriptions visibles (DIU + DFASM), 2 programmes lisibles
-- assert (select count(*) from public.enrollments where person_id = :'learner_a') = 2;
-- assert (select count(*) from public.programs) = 2;
-- ATTENDU : aucune inscription d'autrui
-- assert (select count(*) from public.enrollments where person_id <> :'learner_a') = 0;

-- ---------------------------------------------------------------------
-- T3. Enseignant hors programme refusé
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'teacher_dfasm');
-- ATTENDU : preuves DFASM visibles, preuves DIU invisibles
-- assert (select count(*) from public.evidence where program_id = :'program_diu') = 0;
-- ATTENDU : insertion de validation sur une preuve DIU → 0 ligne / erreur RLS
-- EXPECT ERROR: new row violates row-level security policy for table "evidence_validations"
--   insert into public.evidence_validations
--     (evidence_id, validator_person_id, validator_role, decision)
--   values (:'evidence_diu', :'teacher_dfasm', 'teacher', 'validated');

-- ---------------------------------------------------------------------
-- T4. Encadrant hors stage refusé
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'supervisor_2');   -- encadrant du stage 2 uniquement
-- ATTENDU : affectations du stage 1 invisibles
-- assert (select count(*) from public.placement_assignments
--         where placement_id = :'placement_1') = 0;
-- EXPECT ERROR : validation d'une preuve du stage 1
--   insert into public.evidence_validations
--     (evidence_id, validator_person_id, validator_role, decision)
--   values (:'evidence_placement_1', :'supervisor_2', 'placement_supervisor', 'validated');

-- ---------------------------------------------------------------------
-- T5. Auto-attribution de rôle refusée
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'learner_a');
-- EXPECT ERROR : l'apprenant tente de se déclarer administrateur plateforme
--   insert into public.role_assignments (person_id, role, scope_kind)
--   values (:'learner_a', 'administrator', 'platform');
-- EXPECT ERROR : l'apprenant tente de se déclarer enseignant de son programme
--   insert into public.role_assignments (person_id, role, scope_kind, program_id)
--   values (:'learner_a', 'teacher', 'program', :'program_diu');

select pg_temp.act_as(:'admin_diu');
-- EXPECT ERROR : un admin de programme tente un rôle de portée plateforme
--   insert into public.role_assignments (person_id, role, scope_kind)
--   values (:'teacher_dfasm', 'administrator', 'platform');
-- EXPECT ERROR : un admin de programme tente d'agir hors de son programme
--   insert into public.role_assignments (person_id, role, scope_kind, program_id)
--   values (:'teacher_dfasm', 'teacher', 'program', :'program_dfasm');
-- ATTENDU OK : dans sa portée
--   insert into public.role_assignments (person_id, role, scope_kind, program_id)
--   values (:'teacher_dfasm', 'teacher', 'program', :'program_diu');

-- ---------------------------------------------------------------------
-- T6. Compétence réelle : aucune validation sans tiers
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'learner_a');
-- ATTENDU OK : création d'une preuve real_activity en submitted
--   insert into public.evidence (enrollment_id, outcome_id, program_id, kind, status,
--     title, occurred_at, self_declared, created_by)
--   values (:'enrollment_a', :'outcome_real_diu', :'program_diu', 'real_activity',
--           'submitted', 'ETT complète supervisée', now(), true, :'learner_a');
-- EXPECT ERROR : l'apprenant tente de se valider lui-même
--   insert into public.evidence_validations
--     (evidence_id, validator_person_id, validator_role, decision)
--   values (:'evidence_new', :'learner_a', 'teacher', 'validated');
-- EXPECT ERROR : l'apprenant tente de poser status = 'validated'
--   update public.evidence set status = 'validated' where id = :'evidence_new';
-- ATTENDU : progression dérivée = non acquise (aucune validation)

-- ---------------------------------------------------------------------
-- T7. Preuve auto-déclarée + validation tierce autorisée
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'supervisor_1');   -- encadrant du stage de A
-- ATTENDU OK
--   insert into public.evidence_validations
--     (evidence_id, validator_person_id, validator_role, decision, comment)
--   values (:'evidence_placement_a', :'supervisor_1', 'placement_supervisor',
--           'validated', 'Geste conforme, autonomie partielle');
-- EXPECT ERROR : le journal est append-only
--   update public.evidence_validations set decision = 'rejected'
--   where evidence_id = :'evidence_placement_a';
--   delete from public.evidence_validations where evidence_id = :'evidence_placement_a';
-- ATTENDU : après passage serveur de evidence.status à 'validated',
--           la progression dérivée compte la preuve.

-- ---------------------------------------------------------------------
-- T8. Audit et usage IA non insérables par un client
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'admin_platform');
-- EXPECT ERROR (permission denied / RLS) même pour un admin plateforme
--   insert into public.audit_events (action, target_type, target_id)
--   values ('forged', 'evidence', :'evidence_new');
--   insert into public.ai_usage_events (feature, model) values ('forged', 'gpt');
--   delete from public.audit_events;
-- ATTENDU : lecture autorisée
-- assert (select count(*) from public.audit_events) >= 0;

select pg_temp.act_as(:'learner_a');
-- ATTENDU : 0 ligne d'audit visible
-- assert (select count(*) from public.audit_events) = 0;
-- ATTENDU : sa propre consommation IA visible uniquement
-- assert (select count(*) from public.ai_usage_events
--         where person_id <> :'learner_a') = 0;

-- ---------------------------------------------------------------------
-- T9. Un administrateur de programme ne déborde pas
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'admin_diu');
-- ATTENDU : cohortes/inscriptions DIU visibles, DFASM invisibles
-- assert (select count(*) from public.cohorts where program_id = :'program_dfasm') = 0;
-- assert (select count(*) from public.evidence where program_id = :'program_dfasm') = 0;
-- EXPECT ERROR : création d'une cohorte DFASM
--   insert into public.cohorts (program_id, curriculum_version_id, label, academic_year,
--     starts_on, ends_on)
--   values (:'program_dfasm', :'cv_dfasm', '2026-2027', '2026-2027',
--           '2026-09-01', '2027-06-30');
-- EXPECT ERROR : lecture des quotas IA d'un autre programme
-- assert (select count(*) from public.ai_quota_policies
--         where program_id = :'program_dfasm') = 0;

-- ---------------------------------------------------------------------
-- T10. Un administrateur plateforme couvre tout
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'admin_platform');
-- assert (select count(*) from public.programs) = 2;
-- assert (select count(*) from public.evidence) = (select count(*) from public.evidence);
-- assert (select count(*) from public.ai_quota_policies) >= 1;
-- ATTENDU OK : attribution d'un rôle administrateur de programme à un tiers
--   insert into public.role_assignments (person_id, role, scope_kind, program_id)
--   values (:'teacher_dfasm', 'administrator', 'program', :'program_dfasm');
-- EXPECT ERROR malgré tout : s'accorder un rôle à soi-même
--   insert into public.role_assignments (person_id, role, scope_kind)
--   values (:'admin_platform', 'administrator', 'platform');

-- ---------------------------------------------------------------------
-- T11. Enseignant de la cohorte A ne voit pas la cohorte B du MÊME programme
-- (régression corrigée : has_program_role promouvait une portée cohorte en
--  portée programme)
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'teacher_cohort_a');
-- ATTENDU : inscriptions de la cohorte A visibles
-- assert (select count(*) from public.enrollments
--         where cohort_id = :'cohort_a') > 0;
-- ATTENDU : AUCUNE inscription de la cohorte B
-- assert (select count(*) from public.enrollments
--         where cohort_id = :'cohort_b') = 0;
-- ATTENDU : AUCUNE preuve de la cohorte B
-- assert (select count(*) from public.evidence ev
--         join public.enrollments e on e.id = ev.enrollment_id
--         where e.cohort_id = :'cohort_b') = 0;
-- ATTENDU : AUCUN profil d'apprenant de la cohorte B
-- assert (select count(*) from public.profiles p
--         join public.enrollments e on e.person_id = p.id
--         where e.cohort_id = :'cohort_b') = 0;
-- ATTENDU : la cohorte B elle-même est invisible
-- assert (select count(*) from public.cohorts where id = :'cohort_b') = 0;
-- ATTENDU : le référentiel du programme reste lisible (non nominatif)
-- assert (select count(*) from public.outcomes where program_id = :'program_diu') > 0;
-- EXPECT ERROR : valider une preuve de la cohorte B
--   insert into public.evidence_validations
--     (evidence_id, validator_person_id, validator_role, decision)
--   values (:'evidence_cohort_b', :'teacher_cohort_a', 'teacher', 'validated');

-- ---------------------------------------------------------------------
-- T12. Un encadrant ne voit pas les profils hors de son stage
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'supervisor_1');
-- ATTENDU : profils des apprenants affectés à SON stage visibles
-- assert (select count(*) from public.profiles p
--         join public.enrollments e on e.person_id = p.id
--         join public.placement_assignments pa on pa.enrollment_id = e.id
--         where pa.placement_id = :'placement_1') > 0;
-- ATTENDU : AUCUN profil d'apprenant affecté au seul stage 2
-- assert (select count(*) from public.profiles where id = :'learner_c') = 0;
-- ATTENDU : AUCUNE affectation du stage 2
-- assert (select count(*) from public.placement_assignments
--         where placement_id = :'placement_2') = 0;
-- ATTENDU : preuves de SON stage visibles, preuves HORS stage du même apprenant
--           invisibles (une preuve de QCM n'appartient pas à l'encadrant)
-- assert (select count(*) from public.evidence
--         where enrollment_id = :'enrollment_a'
--           and placement_assignment_id is null) = 0;

-- ---------------------------------------------------------------------
-- T13. Ressource non publiée : ni liaisons ni assets visibles à l'apprenant
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'learner_a');
-- assert (select count(*) from public.learning_resources
--         where id = :'resource_unpublished') = 0;
-- assert (select count(*) from public.learning_resource_outcomes
--         where learning_resource_id = :'resource_unpublished') = 0;
-- assert (select count(*) from public.learning_resource_assets
--         where learning_resource_id = :'resource_unpublished') = 0;
-- ATTENDU : asset de la ressource publiée visible SEULEMENT si status = 'ready'
-- assert (select count(*) from public.learning_resource_assets
--         where learning_resource_id = :'resource_published'
--           and processing_status <> 'ready') = 0;

-- ---------------------------------------------------------------------
-- T14. GRANT de colonnes : l'identité et la provenance d'une preuve
--      ne sont pas réécrivables
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'learner_a');
-- EXPECT ERROR (permission denied for column) : colonnes non accordées
--   update public.evidence set enrollment_id = :'enrollment_b' where id = :'evidence_a_draft';
--   update public.evidence set created_by = :'learner_b'       where id = :'evidence_a_draft';
--   update public.evidence set self_declared = false           where id = :'evidence_a_draft';
--   update public.evidence set source_system = 'dfasm-learnhub' where id = :'evidence_a_draft';
-- EXPECT ERROR : falsifier une provenance legacy à la création
--   insert into public.evidence (enrollment_id, outcome_id, program_id, kind, status,
--     title, occurred_at, self_declared, created_by, source_system)
--   values (:'enrollment_a', :'outcome_diu', :'program_diu', 'real_activity', 'submitted',
--           'Forgée', now(), true, :'learner_a', 'dfasm-learnhub');
-- EXPECT ERROR : falsifier son propre profil comme importé
--   update public.profiles set source_system = 'dfasm-learnhub' where id = :'learner_a';
-- ATTENDU OK : mise à jour d'un champ de brouillon autorisé
--   update public.evidence set title = 'Titre corrigé' where id = :'evidence_a_draft';

-- ---------------------------------------------------------------------
-- T15. Trigger serveur : le statut est DÉRIVÉ, jamais déclaré
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'supervisor_1');
-- ATTENDU OK : décision de validation sur une preuve de SON stage
--   insert into public.evidence_validations
--     (evidence_id, validator_person_id, validator_role, decision)
--   values (:'evidence_a_placement', :'supervisor_1', 'placement_supervisor', 'validated');
-- ATTENDU : le trigger a posé le statut, sans intervention client
-- assert (select status from public.evidence where id = :'evidence_a_placement')
--        = 'validated';
-- ATTENDU : une trace d'audit a été écrite par le trigger
-- assert (select count(*) from public.audit_events
--         where action = 'evidence.status_derived'
--           and target_id = :'evidence_a_placement'::text) = 1;
-- ATTENDU : une décision ultérieure 'needs_revision' ramène à 'submitted'
--   insert into public.evidence_validations
--     (evidence_id, validator_person_id, validator_role, decision)
--   values (:'evidence_a_placement', :'supervisor_1', 'placement_supervisor', 'needs_revision');
-- assert (select status from public.evidence where id = :'evidence_a_placement')
--        = 'submitted';
-- EXPECT ERROR : appeler directement la fonction de dérivation
--   select public.apply_evidence_validation_decision();
-- EXPECT ERROR : réécrire l'historique de validation
--   update public.evidence_validations set decision = 'rejected'
--    where evidence_id = :'evidence_a_placement';
--   delete from public.evidence_validations where evidence_id = :'evidence_a_placement';

-- ---------------------------------------------------------------------
-- T16. Immutabilité d'identité même en service_role
-- ---------------------------------------------------------------------
select pg_temp.as_service();
-- EXPECT ERROR (restrict_violation, trigger evidence_identity_immutable)
--   update public.evidence set program_id = :'program_dfasm' where id = :'evidence_a_placement';
--   update public.evidence set created_by = :'learner_b'     where id = :'evidence_a_placement';
-- EXPECT ERROR : modifier une donnée factuelle après soumission
--   update public.evidence set occurred_at = now() - interval '1 year'
--    where id = :'evidence_a_placement';

-- ---------------------------------------------------------------------
-- T17. Intégrité de l'imputation IA
-- ---------------------------------------------------------------------
select pg_temp.as_service();
-- EXPECT ERROR (FK composite) : inscription rattachée à un autre programme
--   insert into public.ai_usage_events
--     (person_id, program_id, enrollment_id, feature, model)
--   values (:'learner_a', :'program_dfasm', :'enrollment_a', 'ecos', 'gpt-realtime');
-- EXPECT ERROR (FK composite) : inscription rattachée à une autre personne
--   insert into public.ai_usage_events
--     (person_id, program_id, enrollment_id, feature, model)
--   values (:'learner_b', :'program_diu', :'enrollment_a', 'ecos', 'gpt-realtime');
-- EXPECT ERROR (ai_usage_null_coherence) : inscription sans programme ni personne
--   insert into public.ai_usage_events (enrollment_id, feature, model)
--   values (:'enrollment_a', 'ecos', 'gpt-realtime');

-- ---------------------------------------------------------------------
-- T18. Assets pédagogiques : lecture seule pour TOUT rôle client
-- Aucune policy INSERT/UPDATE/DELETE, aucun GRANT d'écriture.
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'admin_platform');
-- EXPECT ERROR (permission denied for table learning_resource_assets)
--   insert into public.learning_resource_assets
--     (learning_resource_id, program_id, asset_kind, storage_provider,
--      bucket_name, object_path, processing_status)
--   values (:'resource_published', :'program_diu', 'video', 'supabase',
--           'originals', 'forge/chemin/choisi/par/le/client', 'ready');
-- EXPECT ERROR : publier un asset en cours de scan
--   update public.learning_resource_assets set processing_status = 'ready'
--    where id = :'asset_pending';
-- EXPECT ERROR : détourner le chemin ou le bucket d'un asset existant
--   update public.learning_resource_assets
--      set bucket_name = 'documents', object_path = 'autre/programme/fuite'
--    where id = :'asset_ready';
-- EXPECT ERROR : falsifier l'empreinte d'un fichier
--   update public.learning_resource_assets
--      set checksum_sha256 = repeat('0', 64), byte_size = 1
--    where id = :'asset_ready';
-- EXPECT ERROR : supprimer une métadonnée d'asset
--   delete from public.learning_resource_assets where id = :'asset_ready';
select pg_temp.act_as(:'teacher_cohort_a');
-- ATTENDU OK : lecture des assets de son programme, tous statuts
-- assert (select count(*) from public.learning_resource_assets) >= 1;
select pg_temp.act_as(:'learner_a');
-- ATTENDU : l'apprenant ne voit QUE les assets 'ready' de ressources publiées
-- assert (select count(*) from public.learning_resource_assets
--          where processing_status <> 'ready') = 0;
select pg_temp.as_service();
-- ATTENDU OK : seul chemin d'écriture — backend en service_role, APRÈS
-- revérification de l'autorisation métier côté serveur (la RLS est contournée).
--   insert into public.learning_resource_assets
--     (learning_resource_id, program_id, asset_kind, storage_provider,
--      bucket_name, object_path, processing_status)
--   values (:'resource_published', :'program_diu', 'video', 'supabase',
--           'originals', :'program_diu' || '/' || :'resource_published' || '/a1',
--           'pending');

-- ---------------------------------------------------------------------
-- T19. Provenance historique : native imposée au client, immuable pour tous
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'admin_diu');
-- EXPECT ERROR (insufficient_privilege, enforce_source_provenance) :
-- un admin de programme ne peut pas fabriquer une ligne « importée du legacy »
--   insert into public.cohorts
--     (program_id, curriculum_version_id, label, starts_on,
--      source_system, source_id, imported_at, import_batch_id)
--   values (:'program_diu', :'curriculum_diu', 'Promo forgée', current_date,
--           'dfasm-learnhub', 'legacy-42', now(), gen_random_uuid());
-- EXPECT ERROR : même sans toucher source_system, poser un source_id est refusé
--   insert into public.cohorts
--     (program_id, curriculum_version_id, label, starts_on, source_id)
--   values (:'program_diu', :'curriculum_diu', 'Promo 2', current_date, 'legacy-43');
-- ATTENDU OK : insertion native, colonnes de provenance laissées vides
--   insert into public.cohorts (program_id, curriculum_version_id, label, starts_on)
--   values (:'program_diu', :'curriculum_diu', 'Promo native', current_date);
-- EXPECT ERROR (restrict_violation) : requalifier une ligne native en legacy
--   update public.cohorts set source_system = 'dfasm-learnhub'
--    where id = :'cohort_a';
-- EXPECT ERROR : un profil importé ne peut pas voir son origine réécrite
--   update public.profiles set import_batch_id = gen_random_uuid()
--    where id = :'learner_legacy';
select pg_temp.as_service();
-- ATTENDU OK : l'import legacy passe par INSERT, et par lui seul
--   insert into public.cohorts
--     (program_id, curriculum_version_id, label, starts_on,
--      source_system, source_id, imported_at, import_batch_id)
--   values (:'program_diu', :'curriculum_diu', 'Promo 2019', date '2019-09-01',
--           'dfasm-learnhub', 'legacy-2019', now(), :'import_batch');
-- EXPECT ERROR : l'immuabilité vaut AUSSI pour service_role
--   update public.cohorts set source_system = 'native' where source_id = 'legacy-2019';
--   update public.cohorts set imported_at = now() where source_id = 'legacy-2019';
-- ATTENDU : un import legacy antérieur est resté intact
-- assert (select source_system from public.profiles where id = :'learner_legacy')
--        = 'dfasm-learnhub';

-- ---------------------------------------------------------------------
-- T20. Un profil legacy peut corriger son nom sans réécrire son origine
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'learner_legacy');
-- ATTENDU OK : la WITH CHECK ne porte plus que sur id = auth.uid()
--   update public.profiles set full_name = 'Nom corrigé', locale = 'fr'
--    where id = :'learner_legacy';
-- assert (select full_name from public.profiles where id = :'learner_legacy')
--        = 'Nom corrigé';
-- assert (select source_system from public.profiles where id = :'learner_legacy')
--        = 'dfasm-learnhub';
-- EXPECT ERROR : et il ne peut toujours pas toucher un autre profil
--   update public.profiles set full_name = 'X' where id = :'learner_b';

-- ---------------------------------------------------------------------
-- T21. updated_at est imposé par le serveur
-- ---------------------------------------------------------------------
select pg_temp.act_as(:'learner_a');
-- EXPECT ERROR (permission denied for column updated_at) : la colonne n'est
-- plus accordée en UPDATE, ni sur profiles ni sur evidence
--   update public.profiles set full_name = 'A', updated_at = date '2000-01-01'
--    where id = :'learner_a';
--   update public.evidence set title = 'A', updated_at = date '2000-01-01'
--    where id = :'evidence_a_draft';
-- ATTENDU : une mise à jour légitime avance updated_at toute seule
--   update public.evidence set title = 'Titre v2' where id = :'evidence_a_draft';
-- assert (select updated_at from public.evidence where id = :'evidence_a_draft')
--        > (select created_at from public.evidence where id = :'evidence_a_draft');
select pg_temp.as_service();
-- ATTENDU : même en service_role, la valeur envoyée est écrasée
--   update public.cohorts set updated_at = date '2000-01-01' where id = :'cohort_a';
-- assert (select updated_at from public.cohorts where id = :'cohort_a')
--        > date '2020-01-01';

-- ---------------------------------------------------------------------
-- Fin : aucun effet de bord
-- ---------------------------------------------------------------------
rollback;


-- =====================================================================
-- PLAN D'ACQUISITION ET PRÉFÉRENCES DE PARTAGE (T22 → T33)
-- Même protocole : begin; set local role authenticated; set local
-- request.jwt.claims; ... rollback;
-- =====================================================================

-- T22. Un autre apprenant ne voit ni le plan ni les demandes de A
--   set local request.jwt.claims -> personne B
--   select count(*) from public.acquisition_plan_items
--     where enrollment_id = :enrollment_a;            attendu 0
--   select count(*) from public.plan_change_requests
--     where enrollment_id = :enrollment_a;            attendu 0
--   select count(*) from public.passport_share_preferences;  attendu 0 (hors B)
--   insert into public.plan_change_requests(plan_item_id, enrollment_id,
--     program_id, requested_by, proposed_learner_target_at)
--     values (:item_a, :enrollment_a, :program_a, :person_b, now());
--                                                      attendu 42501

-- T23. Administrateur hors programme refusé
--   admin du programme DFASM :
--   select count(*) from public.acquisition_plan_templates
--     where program_id = :program_diu;                 attendu 0
--   update public.acquisition_plan_templates set name = 'x'
--     where program_id = :program_diu;                 attendu 0 ligne

-- T24. Enseignant hors cohorte refusé (MÊME programme)
--   enseignant de portée cohorte A :
--   select count(*) from public.acquisition_plan_items
--     where enrollment_id = :enrollment_cohorte_b;     attendu 0
--   select count(*) from public.plan_change_requests
--     where enrollment_id = :enrollment_cohorte_b;     attendu 0

-- T25. Encadrant hors stage refusé, et bornage au stage supervisé
--   encadrant du stage S1 :
--   select count(*) from public.acquisition_plan_items
--     where placement_assignment_id = :assignment_s2;  attendu 0
--   select count(*) from public.acquisition_plan_items
--     where placement_assignment_id = :assignment_s1;  attendu >= 1
--   -- il ne voit PAS les items sans stage du même apprenant :
--   select count(*) from public.acquisition_plan_items
--     where enrollment_id = :enrollment_a
--       and placement_assignment_id is null;           attendu 0

-- T26. Changement strictement personnel dans les bornes : auto-accepté
--   apprenant titulaire, item sans stage, outcome knowledge :
--   insert ... proposed_learner_target_at = :date_dans_fenetre, justification 'ok…';
--   select change_impact, required_approver_role from public.plan_change_requests
--     where id = :req;                    attendu personal_target / auto_accept
--   update public.plan_change_requests set status = 'pending' where id = :req;
--   select status from public.plan_change_requests where id = :req;  attendu approved
--   select learner_target_at from public.acquisition_plan_items
--     where id = :item;                   attendu :date_dans_fenetre
--   select count(*) from public.audit_events
--     where action = 'plan_change_request.auto_accepted';            attendu 1

-- T27. Justification manquante : soumission refusée
--   insert sans justification (draft accepté), puis :
--   update public.plan_change_requests set status = 'pending' where id = :req;
--                                          attendu erreur (CHECK ou trigger §8)
--   select status from public.plan_change_requests where id = :req;  attendu draft

-- T28. Échéance officielle : validation enseignant/admin exigée
--   insert ... proposed_official_due_at = :date + 30 jours ;
--   select change_impact, required_approver_role;
--                            attendu official_deadline / teacher_or_admin
--   update ... status='pending' ;
--   select status;                                     attendu pending (pas approved)
--   -- l'apprenant ne peut pas décider lui-même :
--   insert into public.plan_change_decisions(request_id, program_id,
--     reviewer_person_id, reviewer_role, decision)
--     values (:req, :program, :person_a, 'teacher', 'approved');   attendu 42501
--   -- l'enseignant de la cohorte, oui :
--   set local request.jwt.claims -> enseignant cohorte A ; même insert
--     avec reviewer_person_id = enseignant ;                       attendu OK
--   select status, official_due_at from public.plan_change_requests r
--     join public.acquisition_plan_items i on i.id = r.plan_item_id;
--                            attendu approved / date appliquée atomiquement

-- T29. Stage / compétence clinique : encadrant EXACT exigé
--   item rattaché à :assignment_s1 (ou outcome real_competence) :
--   select required_approver_role;                     attendu placement_supervisor
--   -- enseignant de la cohorte : refusé
--   insert into public.plan_change_decisions(... reviewer_role 'teacher' ...);
--                                                      attendu 42501
--   -- encadrant d'un AUTRE stage : refusé
--   insert ... reviewer_person_id = :supervisor_s2 ;    attendu 42501
--   -- encadrant de S1 : accepté
--   insert ... reviewer_person_id = :supervisor_s1,
--              reviewer_role = 'placement_supervisor' ; attendu OK

-- T30. Décisions append-only, décision non réécrivable
--   set local role service_role;  -- pire cas : la RLS ne protège plus
--   update public.plan_change_decisions set decision = 'rejected'
--     where id = :dec;                                 attendu 42501 (trigger)
--   delete from public.plan_change_decisions where id = :dec;      attendu 42501
--   -- et une demande décidée ne se rouvre pas :
--   update public.plan_change_requests set status = 'pending'
--     where id = :req_approved;                        attendu 42501

-- T31. Template publié immuable, nouvelle version obligatoire
--   admin de programme :
--   update public.acquisition_plan_templates set name = 'v2'
--     where id = :template_published;         attendu 0 ligne (policy draft only)
--   update public.acquisition_plan_template_items set sequence = 99
--     where template_id = :template_published;         attendu 0 ligne
--   set local role service_role;
--   update public.acquisition_plan_templates set name = 'v2'
--     where id = :template_published;                  attendu 42501 (trigger §6)
--   -- chemin correct : nouvelle ligne version_number = n + 1
--   insert into public.acquisition_plan_templates(program_id,
--     curriculum_version_id, cohort_id, name, version_number)
--     values (..., 2);                                 attendu OK

-- T32. Les préférences de partage n'affectent PAS l'accès institutionnel
--   apprenant : update public.passport_share_preferences
--     set share_knowledge = false, share_evidence = false,
--         share_real_competence = false, share_validations = false,
--         share_placements = false, share_history = false,
--         share_next_milestones = false, share_simulated_competence = false
--     where enrollment_id = :enrollment_a;             attendu 1 ligne
--   set local request.jwt.claims -> enseignant de la cohorte de A
--   select count(*) from public.evidence where enrollment_id = :enrollment_a;
--                                                      attendu inchangé (> 0)
--   select count(*) from public.acquisition_plan_items
--     where enrollment_id = :enrollment_a;             attendu inchangé (> 0)
--   select count(*) from public.evidence_validations v
--     join public.evidence e on e.id = v.evidence_id
--    where e.enrollment_id = :enrollment_a;            attendu inchangé
--   -- et l'enseignant ne lit PAS les préférences personnelles :
--   select count(*) from public.passport_share_preferences
--     where enrollment_id = :enrollment_a;             attendu 0

-- T33. La maîtrise n'est jamais déduite de l'état du plan
--   apprenant : update public.acquisition_plan_items
--     set progress_state = 'done' where id = :item_real_competence;  attendu 1
--   -- aucune preuve validée n'existe pour cet acquis :
--   select count(*) from public.evidence e
--    where e.enrollment_id = :enrollment_a
--      and e.outcome_id = :outcome_real and e.status = 'validated';   attendu 0
--   -- donc la maîtrise calculée reste not_started (calcul applicatif,
--   -- src/domain/mastery.ts) : aucune colonne de la base ne prétend l'inverse.
--   -- Vérifier aussi qu'aucune table ne stocke de maîtrise :
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and column_name in
--          ('mastery', 'mastery_level', 'progress_percent');
--                       attendu : uniquement evidence.proposed_mastery (proposée,
--                       non opposable) et outcomes.target_mastery (cible)

-- T34. Colonnes dérivées non falsifiables par le client
--   apprenant :
--   insert into public.plan_change_requests(..., change_impact,
--     required_approver_role) values (..., 'personal_pace', 'auto_accept');
--                     attendu 42501 (aucun GRANT sur ces colonnes) ; et même
--                     en service_role, le trigger §7 les recalcule.
--   update public.acquisition_plan_items set official_due_at = now() + '1 year'
--     where id = :item;                     attendu 42501 (colonne non accordée)

-- =====================================================================
-- Checklist statique de cohérence — périmètre plan d'acquisition
-- =====================================================================
--  1. Chaque nouvelle table a la RLS activée ET au moins une policy SELECT.
--  2. Aucune policy FOR ALL, aucun `using (true)` : une policy par opération.
--  3. Chaque policy a le GRANT correspondant (001 §13.9) et réciproquement ;
--     acquisition_plans n'a AUCUN GRANT DML client et AUCUNE policy DML.
--  4. Colonnes jamais accordées au client : change_impact,
--     required_approver_role, submitted_at, decided_at, withdrawn_at,
--     official_start_at, official_due_at, sequence, is_mandatory,
--     published_at, retired_at, updated_at, colonnes de provenance.
--  5. Chaque nouvelle table porte le trigger de provenance ; les six tables
--     avec updated_at portent z_*_set_updated_at (003 §12).
--  6. FK composites présentes pour chaque rattachement inter-entités :
--     template↔programme/cursus/cohorte, item↔template/outcome,
--     plan↔enrollment/programme/template, plan_item↔plan/outcome/stage,
--     demande↔item/enrollment, décision↔demande.
--  7. Transitions couvertes par test : draft→pending (T26/T27),
--     draft/pending→withdrawn (à ajouter au jeu d'exécution), pending→approved
--     (T28/T29), pending→rejected, réécriture refusée (T30).
--  8. Toutes les fonctions de 002 §14 sont STABLE, sans écriture, avec
--     search_path = pg_catalog, public, et n'acceptent aucun identifiant
--     d'utilisateur en paramètre.
--  9. Toutes les fonctions de 003 §6-§11 sont révoquées pour PUBLIC, anon,
--     authenticated et service_role : appel direct impossible.
-- 10. anon : aucun privilège sur les 8 nouvelles tables (001 §13.9, revoke
--     explicite table par table).

-- FIN — DRAFT — DO NOT EXECUTE
