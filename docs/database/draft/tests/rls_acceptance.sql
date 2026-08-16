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
--     1 ressource non publiée avec leurs liaisons et assets.
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
-- Fin : aucun effet de bord
-- ---------------------------------------------------------------------
rollback;

-- FIN — DRAFT — DO NOT EXECUTE
