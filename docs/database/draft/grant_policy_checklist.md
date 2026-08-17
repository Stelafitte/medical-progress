# Checklist statique GRANT ↔ POLICY et SECURITY DEFINER

Statut : **DRAFT**, revue manuelle. À refaire à chaque modification de
`001_core_schema.sql` ou `002_rls_policies.sql`.

Règle : `P` = au moins une policy existe pour l'opération, `G` = le privilège SQL
est accordé à `authenticated`. Une case doit valoir `P+G` ou `—/—`. Toute
combinaison `P` sans `G` (policy inutilisable) ou `G` sans `P` (privilège orphelin)
est un défaut à corriger.

## 1. authenticated — cohérence par table

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| profiles | P+G | P+G (colonnes `id, full_name, locale`) | P+G (colonnes `full_name, locale`) | —/— |
| programs | P+G | P+G | P+G | P+G |
| curriculum_versions | P+G | P+G | P+G | P+G |
| cohorts | P+G | P+G | P+G | P+G |
| enrollments | P+G | P+G | P+G | P+G |
| role_assignments | P+G | P+G | P+G | —/— |
| outcomes | P+G | P+G | P+G | P+G |
| outcome_relations | P+G | P+G | —/— | P+G |
| learning_resources | P+G | P+G | P+G | P+G |
| learning_resource_outcomes | P+G | P+G | —/— | P+G |
| learning_resource_assets | P+G | —/— (serveur) | —/— (serveur) | —/— (serveur) |
| placements | P+G | P+G | P+G | P+G |
| placement_supervisors | P+G | P+G | P+G | P+G |
| placement_assignments | P+G | P+G | P+G | P+G |
| evidence | P+G | P+G (colonnes d'identité incluses) | P+G (contenu + status, sans `updated_at`) | —/— |
| evidence_sources | P+G | P+G (colonnes hors provenance) | —/— | —/— |
| evidence_validations | P+G | P+G (colonnes hors provenance) | —/— | —/— |
| audit_events | P+G | —/— | —/— | —/— |
| ai_usage_events | P+G | —/— | —/— | —/— |
| ai_quota_policies | P+G | P+G | P+G | P+G (platform admin) |
| acquisition_plan_templates | P+G | P+G (colonnes hors `published_at`/`retired_at`) | P+G (colonne `name`, `draft` seulement) | P+G (`draft` seulement) |
| acquisition_plan_template_items | P+G | P+G (colonnes hors provenance) | P+G (`draft` seulement) | P+G (`draft` seulement) |
| acquisition_plan_template_item_dependencies | P+G | P+G | —/— | P+G |
| acquisition_plans | P+G | —/— (serveur) | —/— (serveur) | —/— (serveur) |
| acquisition_plan_items | P+G | —/— (serveur) | P+G (colonnes `learner_target_at`, `progress_state`) | —/— |
| plan_change_requests | P+G | P+G (colonnes hors dérivées) | P+G (proposition, justification, `status` borné par trigger) | —/— |
| plan_change_decisions | P+G | P+G (colonnes hors provenance) | —/— (append-only) | —/— (append-only) |
| passport_share_preferences | P+G | P+G | P+G | P+G |

Défauts corrigés lors de cette revue :

- `audit_events` / `ai_usage_events` : policies SELECT présentes, `GRANT SELECT`
  manquant → policies inutilisables. Corrigé.
- `programs`, `cohorts`, `enrollments`, `outcomes`, `placements`, `ai_quota_policies`, … :
  policies d'administration présentes, aucun privilège DML → corrigé.
- `learning_resource_assets` : écriture client **entièrement retirée** (policies
  INSERT/UPDATE/DELETE supprimées **et** privilèges non accordés). Un navigateur ne
  peut donc choisir ni `bucket_name`, ni `object_path`, ni `storage_provider`, ni
  falsifier `checksum_sha256` / `byte_size`, ni poser `processing_status = 'ready'`.
  Écriture exclusivement backend en `service_role` (`storage_architecture.md` §2).
- `updated_at` retiré des GRANT de colonnes (`profiles`, `evidence`) : la valeur est
  imposée par le trigger `set_updated_at()` (`003_server_invariants.sql` §4).

## 2. anon

Aucun GRANT, aucune policy, sur aucune table. Le `revoke` porte sur la **liste
explicite des 28 tables de ce draft** (001 §12.7 pour les 20 tables du cœur,
§13.9 pour les 8 tables du plan d'acquisition) et non sur `all tables in schema
public` : un objet `public` ajouté plus tard par une autre fonctionnalité ou par une
intégration managée ne doit pas être modifié par surprise par ce fichier.
Vérification statique : le mot `anon` n'apparaît dans `001`/`002` que dans des `revoke`.

## 2 bis. service_role — la RLS ne protège plus rien

`service_role` **contourne la RLS** et détient `GRANT ALL`. Toute opération menée avec
cette clé doit donc **revérifier l'autorisation métier dans le backend** avant
écriture : appartenance au programme, portée du rôle, droit de validation. La base ne
peut pas rattraper une erreur d'autorisation côté serveur. Deux garde-fous seulement
restent actifs même en `service_role` : l'immuabilité de la provenance et le gel des
colonnes d'identité d'une preuve (`003_server_invariants.sql`).

## 3. Colonnes NON accordées (protection par privilège)

| Table | Colonnes jamais accordées à `authenticated` |
| --- | --- |
| profiles | `source_system`, `source_id`, `imported_at`, `import_batch_id`, `created_at` |
| evidence (UPDATE) | `enrollment_id`, `program_id`, `outcome_id`, `created_by`, `self_declared`, `placement_assignment_id`, `source_*`, `imported_at`, `import_batch_id`, `created_at` |
| evidence_sources | `source_system`, `source_id`, `imported_at`, `import_batch_id` |
| evidence_validations | `source_system`, `source_id`, `imported_at`, `import_batch_id`, `decided_at` |

## 4. Fonctions SECURITY DEFINER

| Fonction | Fichier | Mutante | Pourquoi DEFINER | Exposition |
| --- | --- | --- | --- | --- |
| `is_platform_admin()` | 002 | non | lit `role_assignments` dont les policies l'appellent → récursion | EXECUTE authenticated |
| `can_administer_program(uuid)` | 002 | non | idem | EXECUTE authenticated |
| `has_program_wide_role(uuid, role_name)` | 002 | non | idem | EXECUTE authenticated |
| `has_cohort_role(uuid, role_name)` | 002 | non | idem + `cohorts` | EXECUTE authenticated |
| `has_any_program_role(uuid, role_name)` | 002 | non | idem (référentiel seulement) | EXECUTE authenticated |
| `is_enrolled_in_program(uuid)` | 002 | non | lit `enrollments` sous RLS | EXECUTE authenticated |
| `owns_enrollment(uuid)` | 002 | non | idem | EXECUTE authenticated |
| `supervises_placement(uuid)` | 002 | non | lit `placement_supervisors` sous RLS | EXECUTE authenticated |
| `supervises_enrollment_placement(uuid)` | 002 | non | jointure supervisors/assignments sous RLS | EXECUTE authenticated |
| `is_enrollment_academic_staff(uuid)` | 002 | non | composition | EXECUTE authenticated |
| `can_read_enrollment(uuid)` | 002 | non | composition | EXECUTE authenticated |
| `supervises_evidence(uuid)` | 002 | non | lit `evidence` + `placement_*` sous RLS | EXECUTE authenticated |
| `can_read_evidence(uuid)` | 002 | non | composition | EXECUTE authenticated |
| `can_validate_evidence(uuid)` | 002 | non | composition | EXECUTE authenticated |
| `apply_evidence_validation_decision()` | 003 | **oui** | seule écriture privilégiée : dérive `evidence.status` | **REVOKE ALL** PUBLIC / anon / authenticated / service_role — trigger uniquement |
| `enforce_evidence_identity_immutable()` | 003 | non (refuse) | pas de DEFINER (fonction ordinaire) | **REVOKE ALL** — trigger uniquement |
| `can_read_plan_template(uuid)` | 002 | non | lit `acquisition_plan_templates` + `enrollments` sous RLS | EXECUTE authenticated |
| `supervises_plan_item(uuid)` | 002 | non | jointure `plan_items`/`placement_*` sous RLS | EXECUTE authenticated |
| `can_read_plan_item(uuid)` | 002 | non | composition | EXECUTE authenticated |
| `can_read_plan_change_request(uuid)` | 002 | non | composition | EXECUTE authenticated |
| `can_decide_plan_change_request(uuid)` | 002 | non | lit la demande dont la policy dépend → récursion | EXECUTE authenticated |
| `enforce_plan_template_immutable()` | 003 | non (refuse) | INVOKER | **REVOKE ALL** — trigger uniquement |
| `derive_plan_change_request_impact()` | 003 | non (réécrit NEW) | INVOKER : aucun droit supplémentaire requis | **REVOKE ALL** — trigger uniquement |
| `enforce_plan_change_request_transitions()` | 003 | non (réécrit NEW) | INVOKER | **REVOKE ALL** — trigger uniquement |
| `apply_plan_change_decision()` | 003 | **oui** | écrit des colonnes non accordées au décideur (`official_due_at`, `sequence`, `status`) | **REVOKE ALL** — trigger uniquement |
| `auto_accept_personal_plan_change()` | 003 | **oui** | applique un changement personnel sans décideur humain | **REVOKE ALL** — trigger uniquement |
| `enforce_plan_item_official_fields()` | 003 | non (refuse) | INVOKER | **REVOKE ALL** — trigger uniquement |
| `forbid_write()` | 003 | non (refuse) | INVOKER | **REVOKE ALL** — trigger uniquement |

Contrôles à repasser :

1. Toutes les fonctions de 002 sont `language sql`, `stable`, sans `insert/update/delete`.
2. Toutes ont `set search_path = pg_catalog, public` (jamais `public, pg_temp`).
3. Toutes les tables citées sont schéma-qualifiées, `auth.uid()` est qualifié.
4. Aucune fonction mutante n'est exécutable par `authenticated` : la seule mutante
   (`apply_evidence_validation_decision`) est révoquée pour tous les rôles.
5. Aucune fonction n'accepte un identifiant d'utilisateur en paramètre : l'identité
   vient exclusivement de `auth.uid()`.

## 5. Plan d'acquisition — contrôles spécifiques

1. `acquisition_plans` : aucune policy DML **et** aucun GRANT DML client (cohérent).
2. Colonnes dérivées jamais accordées : `change_impact`, `required_approver_role`,
   `submitted_at`, `decided_at`, `withdrawn_at`, `published_at`, `retired_at`.
3. Colonnes officielles d'un item jamais accordées : `official_start_at`,
   `official_due_at`, `sequence`, `is_mandatory` — modifiées uniquement par
   `apply_plan_change_decision()` sous le drapeau transactionnel
   `app.plan_change_applying`.
4. `plan_change_decisions` : ni policy ni GRANT UPDATE/DELETE, plus un trigger
   `forbid_write()` qui bloque même `service_role`.
5. Les deux fonctions mutantes du plan sont révoquées pour tous les rôles et ne
   s'exécutent qu'en trigger, après une insertion ayant franchi
   `pcd_insert_authorized` (rôle exigé exact, portée exacte, non-demandeur).
6. Aucune policy ne consulte `passport_share_preferences` : vérification statique
   possible par `rg -n "passport_share_preferences" 002_rls_policies.sql`, qui ne
   doit ressortir que dans la section 19 et son commentaire.
