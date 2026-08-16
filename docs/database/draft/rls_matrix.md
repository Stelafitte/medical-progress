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
| learner | self + encadrants de **ses** stages | self (`id = auth.uid()`, `source_system='native'`) | self (colonnes `full_name`, `locale`, `updated_at` seulement) | — |
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

Assets : métadonnées seules. Aucun rôle n'obtient d'URL par la base ; l'URL signée
courte est produite par le serveur après ce filtrage (`storage_architecture.md`).

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

## Invariants transverses

1. `anon` n'a aucun accès, à aucune table (`revoke all ... from anon`).
2. Aucune policy n'utilise `FOR ALL`.
3. Aucun DELETE client sur `evidence`, `evidence_sources`, `evidence_validations`,
   `audit_events`, `ai_usage_events`, `role_assignments`.
4. Une portée cohorte ou stage ne devient jamais une portée programme.
5. Toute écriture client force `source_system = 'native'`.
6. `evidence.status = 'validated'` n'est atteignable que par le trigger serveur.
