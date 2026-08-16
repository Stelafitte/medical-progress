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
--   * utilisateurs auth de test créés dans auth.users (learner_a, learner_b,
--     supervisor_1, supervisor_2, teacher_dfasm, admin_diu, admin_platform) ;
--   * capacité à simuler un JWT : set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
--   * jeu de données minimal : 2 programmes (DIU, DFASM), 2 cohortes,
--     2 stages, 1 outcome real_competence par programme.
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
-- Fin : aucun effet de bord
-- ---------------------------------------------------------------------
rollback;

-- FIN — DRAFT — DO NOT EXECUTE
