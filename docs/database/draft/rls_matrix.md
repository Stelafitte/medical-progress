# Matrice RLS — Lot 1 (conception non exécutée)

Statut : **DRAFT**. Aucune base activée, aucune policy appliquée. Cette matrice
décrit l'intention de `002_rls_policies.sql`.

Légende : ✅ autorisé · ⛔ refusé · `—` aucune policy (donc refusé par RLS).
`service_role` bypasse la RLS ; il n'est **jamais** utilisé côté frontend.

Conditions réutilisées :

| Clé | Condition |
| --- | --- |
| `OWN` | ligne rattachée à `auth.uid()` (directement ou via `owns_enrollment`) |
| `ENROLLED` | `is_enrolled_in_program(program_id)` |
| `SUP` | `supervises_placement(placement_id)` / `supervises_evidence(id)` |
| `TEACH` | `has_program_role(program_id, 'teacher')` |
| `PADM` | `can_administer_program(program_id)` |
| `PLADM` | `is_platform_admin()` |

## Tables

| Table | Op. | learner | placement_supervisor | teacher | program admin | platform admin | service_role | Owner condition | Scope condition | Justification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| profiles | SELECT | ✅ soi | ✅ apprenants de son stage | ✅ portée | ✅ portée | ✅ | ✅ | `id = auth.uid()` | via `enrollments` du programme | pas d'annuaire global |
| profiles | INSERT | ✅ soi | ✅ soi | ✅ soi | ✅ soi | ✅ soi | ✅ | `id = auth.uid()` | — | création de son profil au premier login |
| profiles | UPDATE | ✅ soi | ✅ soi | ✅ soi | ✅ soi | ✅ soi | ✅ | `id = auth.uid()` | — | pas d'édition d'autrui |
| profiles | DELETE | — | — | — | — | — | ✅ | — | — | suppression via `auth.users`, serveur |
| programs | SELECT | ✅ inscrits | ✅ portée | ✅ portée | ✅ portée | ✅ | ✅ | — | `ENROLLED ∪ rôle` | pas de catalogue public |
| programs | INSERT/DELETE | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | — | `PLADM` | création d'un programme = acte plateforme |
| programs | UPDATE | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ✅ | — | `PADM` | admin borné à son programme |
| curriculum_versions | SELECT | ✅ inscrits | ⛔ | ✅ | ✅ | ✅ | ✅ | — | `ENROLLED ∪ TEACH ∪ PADM` | lecture pédagogique |
| curriculum_versions | INSERT/UPDATE/DELETE | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ✅ | — | `PADM` | référentiel = administration |
| cohorts | SELECT | ✅ inscrits | ⛔ | ✅ | ✅ | ✅ | ✅ | — | `ENROLLED ∪ TEACH ∪ PADM` | idem |
| cohorts | INSERT/UPDATE/DELETE | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ✅ | — | `PADM` | idem |
| enrollments | SELECT | ✅ siennes | ✅ ses stagiaires | ✅ portée | ✅ portée | ✅ | ✅ | `person_id = auth.uid()` | `SUP ∪ TEACH ∪ PADM` | multi-programmes lisible d'un seul compte |
| enrollments | INSERT/UPDATE | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ✅ | — | `PADM` | aucune auto-inscription |
| enrollments | DELETE | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | — | `PLADM` | traçabilité |
| role_assignments | SELECT | ✅ siens | ✅ siens | ✅ siens | ✅ portée | ✅ | ✅ | `person_id = auth.uid()` | `PADM` sur `program_id` | transparence sans annuaire de droits |
| role_assignments | INSERT/UPDATE | ⛔ | ⛔ | ⛔ | ✅ hors `platform` | ✅ | ✅ | `person_id <> auth.uid()` | `PADM` + `scope_kind <> 'platform'` | **anti-escalade** : ni auto-attribution ni élargissement de portée |
| role_assignments | DELETE | — | — | — | — | — | ✅ | — | — | on révoque (`revoked_at`), on ne supprime pas |
| outcomes | SELECT | ✅ inscrits | ✅ portée | ✅ | ✅ | ✅ | ✅ | — | `ENROLLED ∪ rôle` | référentiel de sa formation |
| outcomes | INSERT/UPDATE/DELETE | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ✅ | — | `PADM` | intégrité du référentiel |
| outcome_relations | SELECT | ✅ inscrits | ⛔ | ✅ | ✅ | ✅ | ✅ | — | via `outcomes.program_id` | graphe de sa formation |
| outcome_relations | INSERT/DELETE | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ✅ | — | `PADM` | rattachement legacy contrôlé |
| outcome_relations | UPDATE | — | — | — | — | — | ✅ | — | — | PK = tout le sens |
| learning_resources | SELECT | ✅ publiées | ✅ publiées | ✅ toutes | ✅ toutes | ✅ | ✅ | — | `is_published ∧ ENROLLED` | brouillons invisibles aux apprenants |
| learning_resources | INSERT/UPDATE | ⛔ | ⛔ | ✅ | ✅ | ✅ | ✅ | — | `TEACH ∪ PADM` | production pédagogique |
| learning_resources | DELETE | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ✅ | — | `PADM` | — |
| learning_resource_outcomes | SELECT | ✅ inscrits | ⛔ | ✅ | ✅ | ✅ | ✅ | — | `ENROLLED ∪ TEACH ∪ PADM` | — |
| learning_resource_outcomes | INSERT/DELETE | ⛔ | ⛔ | ✅ | ✅ | ✅ | ✅ | — | `TEACH ∪ PADM` | — |
| placements | SELECT | ✅ inscrits | ✅ ses stages | ✅ | ✅ | ✅ | ✅ | — | `SUP ∪ ENROLLED ∪ TEACH ∪ PADM` | — |
| placements | INSERT/UPDATE/DELETE | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ✅ | — | `PADM` | capacité et terrains = administration |
| placement_supervisors | SELECT | ✅ inscrits | ✅ soi | ⛔ | ✅ | ✅ | ✅ | `person_id = auth.uid()` | `ENROLLED ∪ PADM` | l'apprenant doit savoir qui l'encadre |
| placement_supervisors | INSERT/UPDATE/DELETE | ⛔ | ⛔ | ⛔ | ✅ (`person_id <> auth.uid()`) | ✅ | ✅ | — | `PADM` | **anti-escalade** : nul ne se déclare encadrant |
| placement_assignments | SELECT | ✅ siennes | ✅ ses stages | ✅ | ✅ | ✅ | ✅ | `owns_enrollment` | `SUP ∪ TEACH ∪ PADM` | — |
| placement_assignments | INSERT | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ✅ | — | `PADM` | affectation = acte administratif |
| placement_assignments | UPDATE | ⛔ | ✅ statut | ⛔ | ✅ | ✅ | ✅ | — | `SUP ∪ PADM` | suivi terrain |
| placement_assignments | DELETE | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ✅ | — | `PADM` | — |
| evidence | SELECT | ✅ siennes | ✅ preuves de ses stages | ✅ portée | ✅ portée | ✅ | ✅ | `owns_enrollment` | `SUP(evidence) ∪ TEACH ∪ PADM` | A ne lit jamais les preuves de B |
| evidence | INSERT | ✅ `draft`/`submitted`, `created_by = auth.uid()`, `self_declared` | ✅ pour ses stagiaires, `self_declared = false` | ✅ portée | ✅ portée | ✅ | ✅ | `created_by = auth.uid()` | `owns_enrollment` ou `SUP ∪ TEACH ∪ PADM` | jamais `validated` depuis le client |
| evidence | UPDATE | ✅ ses `draft` sans validation | ✅ statut ≠ validated | ✅ statut ≠ validated | ✅ statut ≠ validated | ✅ | ✅ | `owns_enrollment ∧ status='draft'` | `WITH CHECK status ∈ {draft,submitted,rejected,expired}` | l'acquisition ne se déclare pas |
| evidence | DELETE | — | — | — | — | — | ✅ | — | — | statuts + traçabilité, pas de suppression |
| evidence_sources | SELECT | ✅ via preuve visible | ✅ | ✅ | ✅ | ✅ | ✅ | via `evidence` | héritée d'`evidence` | pas de fuite de pièces |
| evidence_sources | INSERT | ✅ sur son `draft` | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | `evidence.created_by = auth.uid()` | `status = 'draft'` | pièces figées après soumission |
| evidence_sources | UPDATE/DELETE | — | — | — | — | — | ✅ | — | — | immuabilité |
| evidence_validations | SELECT | ✅ sur ses preuves | ✅ | ✅ | ✅ | ✅ | ✅ | `owns_enrollment(evidence)` | `can_validate_evidence` | l'apprenant voit qui a décidé |
| evidence_validations | INSERT | ⛔ | ✅ ses stages | ✅ sa portée | ✅ sa portée | ✅ | ✅ | `validator_person_id = auth.uid()` | `can_validate_evidence` (exclut auteur et titulaire) | **compétence réelle jamais auto-validée** |
| evidence_validations | UPDATE/DELETE | — | — | — | — | — | ✅ | — | — | **append-only** : on ajoute une décision |
| audit_events | SELECT | ⛔ | ⛔ | ⛔ | ✅ portée | ✅ | ✅ | — | `PADM` / `PLADM` | audit = donnée sensible |
| audit_events | INSERT/UPDATE/DELETE | — | — | — | — | — | ✅ | — | — | écriture serveur uniquement, aucun GRANT client |
| ai_usage_events | SELECT | ✅ sa conso | ⛔ | ⛔ | ✅ portée | ✅ | ✅ | `person_id = auth.uid()` | `PADM` / `PLADM` | transparence quota + pilotage coût |
| ai_usage_events | INSERT/UPDATE/DELETE | — | — | — | — | — | ✅ | — | — | comptabilité IA infalsifiable |
| ai_quota_policies | SELECT | ⛔ | ⛔ | ⛔ | ✅ portée | ✅ | ✅ | — | `PADM` | politique interne |
| ai_quota_policies | INSERT/UPDATE | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ✅ | — | `PADM` | quotas par programme |
| ai_quota_policies | DELETE | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | — | `PLADM` | — |

## Invariants transverses

1. `auth.uid()` est l'unique identité : aucun `user_id` du client n'entre dans une condition.
2. Aucune table publique sans RLS ; aucun `GRANT` à `anon`.
3. Aucun `FOR ALL` : chaque opération a sa policy explicite.
4. `status = 'validated'` sur `evidence` n'est atteignable par aucune policy client :
   seul le service serveur le pose après une ligne `evidence_validations` conforme.
5. Un utilisateur ne peut ni s'accorder un rôle (`person_id <> auth.uid()`), ni créer
   un rôle de portée `platform` sans être admin plateforme.
6. Aucune suppression client sur `evidence`, `evidence_validations`, `audit_events`,
   `ai_usage_events`.
