# Matrice RLS — Lot 1 (conception non exécutée)

Statut : **DRAFT**. Aucune policy n'est active. Référence : `002_rls_policies.sql`.

## Rôles

| Rôle | Définition en base |
| --- | --- |
| `anon` | non authentifié — **aucun GRANT, aucune policy**, sur aucune table |
| `learner` | `role_assignments.role = 'learner'` (portée `cohort` ou `program`) ; ses droits réels dérivent de `enrollments` |
| `supervisor` | encadrant **déclaré** dans `placement_supervisors` (portée `placement`) |
| `teacher/cohort` | `role = 'teacher'`, `scope_kind = 'cohort'` — **une cohorte précise** |
| `teacher/program` | `role = 'teacher'`, `scope_kind = 'program'` — tout le programme |
| `admin/program` | `role = 'administrator'`, `scope_kind = 'program'` |
| `admin/platform` | `role = 'administrator'`, `scope_kind = 'platform'` |
| `service_role` | serveur uniquement, bypass RLS, jamais côté frontend |

Légende : `—` interdit · `self` sa propre ligne · `own` ses données d'apprenant ·
`ref` référentiel non nominatif · `cohorte` limité à sa cohorte ·
`stage` limité aux stages encadrés · `prog` tout le programme · `all` tout.

## Matrice par table

### profiles

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | self + encadrants de **ses** stages | self (`id = auth.uid()`, `source_system='native'`) | self (colonnes `full_name`, `locale` seulement) | — |
| supervisor | self + apprenants affectés à **ses** stages | self | self | — |
| teacher/cohort | self + apprenants de **sa cohorte** | self | self | — |
| teacher/program | self + apprenants du programme | self | self | — |
| admin/program | self + apprenants du programme | self | self | — |
| admin/platform | all | self | self | — |

### programs / curriculum_versions

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | `ref` de ses programmes | — | — | — |
| supervisor | `ref` de son programme | — | — | — |
| teacher (toutes portées) | `ref` du programme | — | — | — |
| admin/program | `ref` | curriculum only | son programme | curriculum only |
| admin/platform | all | all | all | all |

### cohorts

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | cohortes de son programme | — | — | — |
| teacher/cohort | **sa cohorte uniquement** | — | — | — |
| teacher/program | `prog` | — | — | — |
| admin/program | `prog` | `prog` | `prog` | `prog` |
| admin/platform | all | all | all | all |

### enrollments

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | `own` (`person_id = auth.uid()`) | — (aucune auto-inscription) | — | — |
| supervisor | inscriptions affectées à **ses** stages | — | — | — |
| teacher/cohort | inscriptions de **sa cohorte** | — | — | — |
| teacher/program | `prog` | — | — | — |
| admin/program | `prog` | `prog` (`source_system='native'`) | `prog` | — |
| admin/platform | all | all | all | all |

### role_assignments

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| tous | ses propres assignations | — | — | — |
| admin/program | assignations de son programme | `person_id <> auth.uid()`, `scope_kind <> 'platform'`, programme = le sien | idem (révocation) | — |
| admin/platform | all | `person_id <> auth.uid()` | idem | — |

Anti-escalade : personne ne peut s'accorder ni s'élargir un rôle ; aucun DELETE client
(la révocation passe par `revoked_at`).

### outcomes / outcome_relations

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner / supervisor | `ref` du programme | — | — | — |
| teacher (toutes portées) | `ref` du programme | — | — | — |
| admin/program | `ref` | `prog` | `prog` (outcomes) | `prog` |
| admin/platform | all | all | all | all |

`outcome_relations` n'a **pas** de policy UPDATE (clé primaire porteuse de sens).

### learning_resources / learning_resource_outcomes / learning_resource_assets

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | ressources **publiées** de son programme ; liaisons et assets **de ces ressources uniquement**, assets `ready` | — | — | — |
| supervisor | idem learner | — | — | — |
| teacher (toutes portées) | toutes ressources du programme, tous statuts | `prog` | `prog` | — |
| admin/program | `prog` | `prog` | `prog` | `prog` |
| admin/platform | all | all | all | all |

**Assets — lecture seule pour tous les rôles clients.** `learning_resource_assets`
conserve sa policy SELECT (colonne INSERT/UPDATE/DELETE du tableau = `—` pour
**tous** les rôles, y compris `admin/platform`) : les métadonnées de fichier sont
écrites uniquement par le backend en `service_role`. Aucun rôle n'obtient d'URL par
la base ; l'URL signée courte est produite par le serveur après ce filtrage
(`storage_architecture.md`).

### placements / placement_supervisors / placement_assignments

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | stages de son programme ; encadrants et affectations de **ses** stages | — | — | — |
| supervisor | `stage` (ses stages, ses affectations, ses co-encadrants) | — | affectations de ses stages | — |
| teacher/cohort | stages `ref` ; affectations des inscriptions de **sa cohorte** | — | — | — |
| teacher/program | `prog` | — | — | — |
| admin/program | `prog` | `prog` (`person_id <> auth.uid()` pour les encadrants) | `prog` | `prog` |
| admin/platform | all | all | all | all |

Personne ne peut se déclarer encadrant soi-même.

### evidence

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | `own` | `own`, `created_by = auth.uid()`, `self_declared`, statut ∈ {draft, submitted}, `source_system='native'` | ses **brouillons non encore jugés** ; colonnes d'identité non accordées | — |
| supervisor | preuves rattachées à **ses** stages (`placement_assignment_id` non nul) | pour un apprenant de ses stages, `not self_declared`, statut ∈ {draft, submitted} | requalification (draft/submitted/rejected/expired) sur ses stages | — |
| teacher/cohort | preuves des inscriptions de **sa cohorte** | idem, portée cohorte | idem, portée cohorte | — |
| teacher/program | `prog` | `prog` | `prog` | — |
| admin/program | `prog` | `prog` | `prog` | — |
| admin/platform | all | all | all | — |

`status = 'validated'` est **inatteignable** pour tous les rôles clients : ni policy
ni privilège. Seul le trigger de `003_server_invariants.sql` peut le poser.

### evidence_sources

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| tous | identique à la visibilité de la preuve (`can_read_evidence`) | titulaire, sur sa propre preuve en `draft`, colonnes de provenance non accordées | — | — |

### evidence_validations

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | validations de **ses** preuves | — | — | — |
| supervisor | validations des preuves de ses stages + les siennes | `validator_role='placement_supervisor'` et `supervises_evidence` | — | — |
| teacher/cohort | validations des preuves de **sa cohorte** | `validator_role='teacher'` et cohorte détenue | — | — |
| teacher/program | `prog` | `validator_role='teacher'` et portée programme | — | — |
| admin/program | `prog` | `validator_role='administrator'` | — | — |
| admin/platform | all | idem | — | — |

Dans tous les cas : `validator_person_id = auth.uid()`, jamais le titulaire de
l'inscription, jamais l'auteur de la saisie. Table **append-only** : aucune policy
UPDATE ni DELETE, y compris pour `admin/platform`.

### audit_events / ai_usage_events

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | `ai_usage_events` : ses propres lignes (transparence quota) ; `audit_events` : — | — | — | — |
| supervisor / teacher | — | — | — | — |
| admin/program | lignes de son programme | — | — | — |
| admin/platform | all | — | — | — |
| service_role | all | all | all | all |

`GRANT SELECT` accordé à `authenticated` (les policies ci-dessus doivent être
utilisables) ; **aucun** privilège d'écriture, aucune policy d'écriture.

### ai_quota_policies

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner / supervisor / teacher | — | — | — | — |
| admin/program | `prog` | `prog` | `prog` | — |
| admin/platform | all | all | all | all |

### acquisition_plan_templates / _template_items / _item_dependencies

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | `prog` + `published` (+ sa cohorte si le template est ciblé) | — | — | — |
| teacher | `prog` ou `cohort` exact | — | — | — |
| supervisor | — | — | — | — |
| admin/program | `prog` | `prog` + `draft` | `prog` + `draft` | `prog` + `draft` |
| admin/platform | all | all | `draft` | `draft` |

`published_at` / `retired_at` ne sont accordés à personne côté client : publier
est une opération serveur (figeage + vérification d'absence de cycle).

### acquisition_plans

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | `own` | — | — | — |
| teacher | `cohort`/`prog` exact | — | — | — |
| supervisor | — | — | — | — |
| admin/program | `prog` | — | — | — |
| service_role | serveur | serveur | serveur | serveur |

Instancier un plan est une opération serveur : aucun GRANT DML client, aucune
policy DML.

### acquisition_plan_items

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | `own` | — | `own` — colonne `progress_state` UNIQUEMENT | — |
| teacher | `cohort`/`prog` exact | — | — | — |
| supervisor | items rattachés à un stage **qu'il supervise** | — | — | — |
| admin/program | `prog` | — | — | — |

`official_start_at`, `official_due_at`, `sequence`, `is_mandatory`,
`placement_assignment_id`, `learner_target_at` et `learner_pace` ne sont accordés
à aucun client. Toute modification de calendrier (officiel ou personnel), d'ordre
ou de rythme passe obligatoirement par une `plan_change_request` justifiée,
appliquée par le chemin interne : auto-acceptation personnelle (003 §10) ou
décision approuvée (003 §9). Le trigger 003 §11 applique la même règle à
`service_role`.

Le chemin interne n'est reconnu par AUCUN drapeau applicatif : il est identifié
par le contexte effectif `current_user = 'postgres'` (003 §6.bis), atteignable
uniquement dans les fonctions `SECURITY DEFINER` possédées par postgres, dont
l'EXECUTE est révoqué pour tous les rôles clients.

### Demande portant sur une compétence réelle

| Situation de l'élément | Rôle décideur exigé | Portée de la décision |
| --- | --- | --- |
| `placement_assignment_id` renseigné | `placement_supervisor` **exact** du stage | calendrier ; l'acquisition reste dérivée des preuves validées |
| acquis `real_competence` sans stage assigné | `teacher_or_admin` de portée | **calendrier uniquement**, à titre provisoire ; jamais une validation d'acquisition |

Ce repli évite les demandes indécidables. Dès qu'un stage est rattaché à
l'élément, la dérivation exige à nouveau l'encadrant exact.

### plan_change_requests

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | `own` | `own` + `draft` + `requested_by = auth.uid()` | `own` : brouillon, `draft→pending`, `draft/pending→withdrawn` | — |
| teacher | `cohort`/`prog` exact | — | — | — |
| supervisor | demandes portant sur un item de **son** stage | — | — | — |
| admin/program | `prog` | — | — | — |

`change_impact`, `required_approver_role`, `submitted_at`, `decided_at`,
`withdrawn_at` ne sont jamais accordés : dérivés côté serveur. `approved` /
`rejected` sont inatteignables depuis un client.

### plan_change_decisions (append-only)

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | demandes qu'il peut lire | — | — | — |
| teacher | portée exacte | si `required_approver_role = 'teacher_or_admin'` et non-demandeur | — | — |
| supervisor | ses stages | si `required_approver_role = 'placement_supervisor'` et encadrant **de ce stage** | — | — |
| admin/program | `prog` | si `required_approver_role = 'teacher_or_admin'` | — | — |

Une demande `auto_accept` n'est décidable par personne : elle est appliquée
automatiquement à la soumission.

### passport_share_preferences

| Rôle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| learner | `own` | `own` | `own` | `own` |
| teacher / supervisor / admin/program / admin/platform | — | — | — | — |

Ces lignes ne sont lues par **aucune** autre policy : elles ne réduisent jamais
la visibilité institutionnelle des preuves, validations, stages ou plans.

## Invariants transverses

1. `anon` n'a aucun accès, à aucune table (`revoke all ... from anon`).
2. Aucune policy n'utilise `FOR ALL`.
3. Aucun DELETE client sur `evidence`, `evidence_sources`, `evidence_validations`,
   `audit_events`, `ai_usage_events`, `role_assignments`.
4. Une portée cohorte ou stage ne devient jamais une portée programme.
5. Toute écriture client est `source_system = 'native'` avec `source_id`,
   `imported_at` et `import_batch_id` NULL — imposé par `enforce_source_provenance()`
   sur les 15 tables porteuses, en plus des `with check` de policy.
6. Les 4 colonnes de provenance sont **immuables en UPDATE pour tous les rôles**,
   `service_role` compris : un import est un INSERT, une correction est traçable.
7. `updated_at` n'est jamais fourni par un appelant : `set_updated_at()` l'impose.
8. `evidence.status = 'validated'` n'est atteignable que par le trigger serveur.
9. `learning_resource_assets` est en lecture seule pour tout rôle client.
10. `progress_state` d'un élément de plan n'est jamais une acquisition : la maîtrise
    reste dérivée de `evidence` + `evidence_validations`.
11. Un template `published` est immuable, items et dépendances compris.
12. `plan_change_decisions` est append-only ; une demande décidée ne se rouvre pas.
13. Les préférences de partage n'apparaissent dans aucune condition de policy.
14. `service_role` contourne la RLS : l'autorisation métier doit être revérifiée
    dans le backend avant toute opération menée avec cette clé.
