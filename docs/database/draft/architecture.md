# Architecture de données — Lot 1 (conception non exécutée)

Statut : **DRAFT — DO NOT EXECUTE**. Aucune base activée, aucune migration créée,
aucun appel Supabase. Ce dossier existe pour être relu et validé avant provisioning.

## 1. Diagramme ER (compact)

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : "1-1"
  PROFILES ||--o{ ENROLLMENTS : "s'inscrit"
  PROFILES ||--o{ ROLE_ASSIGNMENTS : "rôles contextualisés"
  PROFILES ||--o{ PLACEMENT_SUPERVISORS : "encadre"
  PROGRAMS ||--o{ CURRICULUM_VERSIONS : ""
  PROGRAMS ||--o{ COHORTS : ""
  PROGRAMS ||--o{ PLACEMENTS : ""
  PROGRAMS ||--o{ LEARNING_RESOURCES : ""
  PROGRAMS ||--o{ AI_QUOTA_POLICIES : ""
  CURRICULUM_VERSIONS ||--o{ COHORTS : ""
  CURRICULUM_VERSIONS ||--o{ OUTCOMES : ""
  OUTCOMES ||--o{ OUTCOME_RELATIONS : "graphe"
  OUTCOMES ||--o{ LEARNING_RESOURCE_OUTCOMES : ""
  LEARNING_RESOURCES ||--o{ LEARNING_RESOURCE_OUTCOMES : ""
  LEARNING_RESOURCES ||--o{ LEARNING_RESOURCE_ASSETS : "métadonnées d'objets"
  COHORTS ||--o{ ENROLLMENTS : ""
  ENROLLMENTS ||--o{ PLACEMENT_ASSIGNMENTS : ""
  ENROLLMENTS ||--o{ EVIDENCE : ""
  PLACEMENTS ||--o{ PLACEMENT_ASSIGNMENTS : ""
  PLACEMENTS ||--o{ PLACEMENT_SUPERVISORS : ""
  PLACEMENT_ASSIGNMENTS ||--o{ EVIDENCE : "contexte réel"
  OUTCOMES ||--o{ EVIDENCE : "cible"
  EVIDENCE ||--o{ EVIDENCE_SOURCES : "pièces"
  EVIDENCE ||--o{ EVIDENCE_VALIDATIONS : "append-only"
  PROFILES ||--o{ EVIDENCE_VALIDATIONS : "validateur"
  PROFILES ||--o{ AI_USAGE_EVENTS : ""
  PROFILES ||--o{ AUDIT_EVENTS : "acteur"
  ENROLLMENTS ||--o{ AI_USAGE_EVENTS : "imputation quota"
  PROGRAMS ||--o{ ACQUISITION_PLAN_TEMPLATES : "modèles versionnés"
  CURRICULUM_VERSIONS ||--o{ ACQUISITION_PLAN_TEMPLATES : ""
  COHORTS ||--o{ ACQUISITION_PLAN_TEMPLATES : "optionnel"
  ACQUISITION_PLAN_TEMPLATES ||--o{ ACQUISITION_PLAN_TEMPLATE_ITEMS : ""
  ACQUISITION_PLAN_TEMPLATE_ITEMS ||--o{ ACQUISITION_PLAN_TEMPLATE_ITEM_DEPENDENCIES : "prérequis"
  OUTCOMES ||--o{ ACQUISITION_PLAN_TEMPLATE_ITEMS : "cible"
  ACQUISITION_PLAN_TEMPLATES ||--o{ ACQUISITION_PLANS : "instancié en"
  ENROLLMENTS ||--o{ ACQUISITION_PLANS : "1 actif"
  ACQUISITION_PLANS ||--o{ ACQUISITION_PLAN_ITEMS : ""
  OUTCOMES ||--o{ ACQUISITION_PLAN_ITEMS : "cible"
  PLACEMENT_ASSIGNMENTS ||--o{ ACQUISITION_PLAN_ITEMS : "contexte stage"
  ACQUISITION_PLAN_ITEMS ||--o{ PLAN_CHANGE_REQUESTS : "demande"
  PROFILES ||--o{ PLAN_CHANGE_REQUESTS : "demandeur"
  PLAN_CHANGE_REQUESTS ||--o{ PLAN_CHANGE_DECISIONS : "append-only"
  PROFILES ||--o{ PLAN_CHANGE_DECISIONS : "décideur"
  ENROLLMENTS ||--|| PASSPORT_SHARE_PREFERENCES : "partage personnel"
```

Le plan d'acquisition est détaillé dans `plan_acquisition_architecture.md` :
versioning des templates, projections Liste/Kanban/Gantt/Calendrier sur
`acquisition_plan_items`, séparation dates officielles / cible personnelle,
dérivation de l'impact d'une demande et audit.

## 2. Choix de normalisation

- **3NF assumée** ; aucune table de progression. Le niveau de maîtrise est **dérivé**
  de `evidence` + `evidence_validations` par la logique de `src/domain/mastery.ts`.
  Toute matérialisation future sera un cache explicitement marqué (vue matérialisée
  reconstructible), jamais une vérité indépendante.
- **`program_id` dupliqué volontairement** sur `cohorts`, `outcomes`, `enrollments`,
  `placement_assignments`, `evidence`, `learning_resource_outcomes` — mais **jamais
  librement** : chaque duplication est verrouillée par une **FK composite** vers une clé
  alternative `(id, program_id)` du parent. Le programme ne peut donc pas diverger d'une
  ligne à l'autre, et les policies RLS restent des tests locaux (pas de jointures profondes).
- **Rôles hors `profiles`** : `role_assignments` est la seule source de droits
  (prévention d'escalade de privilèges). Cohérence `role`/`scope_kind` en `CHECK`,
  miroir de `isRoleScopeConsistent` côté TypeScript.
- **Encadrement de stage explicite** : `placement_supervisors` est la source de vérité
  de l'autorisation superviseur ; `placement_assignments.supervisor_person_id` n'est
  qu'un référent nommé, contraint par FK à être un encadrant déclaré du stage.
- **N-N par table de liaison** (`learning_resource_outcomes`) plutôt que tableau d'ids.
- **JSONB réservé au contexte non structurant** (`evidence.context`, `audit_events.detail`,
  `evidence_sources.payload`). Aucune règle métier ne dépend d'une clé JSONB.
- **Fichiers hors base** : `learning_resource_assets` ne stocke que des métadonnées
  (`bucket_name`, `object_path`, `checksum_sha256`, `processing_status`). Aucun binaire,
  aucune URL publique durable ; `program_id` verrouillé par FK composite vers la ressource
  parente. La table est en **lecture seule pour tout rôle client** (policy SELECT
  uniquement, aucun GRANT d'écriture) : le backend génère `asset_id`, le chemin canonique
  et l'URL d'upload signée, puis écrit les métadonnées en `service_role`. Détail :
  `storage_architecture.md`.
- **Imputation IA contrainte** : `ai_usage_events` porte deux FK composites
  `(enrollment_id, program_id)` et `(enrollment_id, person_id)` plus un `CHECK` de
  cohérence des null : un appel rattaché à une inscription ne peut être imputé ni à un
  autre programme ni à une autre personne.
- **Enums PostgreSQL** alignés 1-1 avec les unions TypeScript (voir §7).
- **Multi-programmes** : un seul compte `auth.users` → N `enrollments` sur N programmes,
  unicité `(person_id, cohort_id)` seulement.

## 2 bis. Portées d'autorisation — modèle exact

Le point le plus sensible du modèle : une portée **cohorte** ou **stage** ne doit
jamais être promue en portée **programme**. Les helpers de `002_rls_policies.sql`
sont donc distincts et explicites.

| Helper | Ce qu'il autorise |
| --- | --- |
| `is_platform_admin()` | admin de portée `platform` |
| `can_administer_program(p)` | admin de `p` ou admin plateforme |
| `has_program_wide_role(p, r)` | rôle `r` **de portée programme** sur `p` uniquement |
| `has_cohort_role(c, r)` | rôle `r` sur la cohorte `c`, ou rôle programme sur son programme |
| `has_any_program_role(p, r)` | rôle `r` à **n'importe quelle** portée dans `p` — **référentiel non nominatif uniquement** |
| `supervises_placement(pl)` | encadrant déclaré du stage `pl` |
| `supervises_enrollment_placement(e)` | encadrant d'un stage où l'inscription `e` est affectée |
| `is_enrollment_academic_staff(e)` | admin de portée, enseignant programme, ou enseignant de **la cohorte de `e`** |
| `can_read_enrollment(e)` | titulaire, encadrement pédagogique de portée, encadrant de stage concerné |
| `supervises_evidence(ev)` | encadrant du stage rattaché à **cette** preuve |
| `can_read_evidence(ev)` | titulaire, encadrement pédagogique de portée, encadrant du stage de la preuve |
| `can_validate_evidence(ev)` | ci-dessus, **moins** le titulaire et l'auteur de la saisie |

Conséquences vérifiées par les tests d'acceptation :

- un **enseignant de la cohorte A** ne voit ni les inscriptions ni les preuves de la
  **cohorte B** du même programme ;
- un **encadrant de stage** ne voit que les affectations, profils et preuves liés à
  **ses** stages — pas les preuves hors stage du même apprenant, pas les profils des
  apprenants qu'il n'encadre pas ;
- la lecture du **référentiel** (programme, curriculum, acquis, ressources publiées)
  reste ouverte à tout rôle du programme : ces données ne sont pas nominatives.

## 3. Flux

### 3.1 Inscription
1. Premier login → `profiles` (INSERT self, `id = auth.uid()`).
2. Un administrateur de programme crée l'`enrollment` (`program_id`, `cohort_id`).
   Aucune auto-inscription possible par RLS.
3. Le rôle `learner` est posé par l'administrateur en portée `cohort`.

### 3.2 Saisie d'une preuve
1. L'apprenant crée `evidence` en `draft` (`created_by = auth.uid()`, `self_declared = true`).
2. Pièces éventuelles dans `evidence_sources` (autorisées uniquement tant que `draft`).
3. Passage en `submitted` par l'apprenant. `score_raw/score_max`, `proposed_mastery`,
   `autonomy_level`, `repetition_count`, `confidence_level`, `context` sont **déclaratifs**.
4. Une preuve `kind = 'placement'` exige un `placement_assignment_id` (CHECK).

### 3.3 Validation tierce
1. Un encadrant du stage, un enseignant du programme ou un administrateur de portée
   insère une ligne `evidence_validations` (`validator_person_id = auth.uid()`).
2. `can_validate_evidence()` exclut le titulaire de l'inscription **et** l'auteur de la saisie.
3. Le service serveur, après cette insertion, passe `evidence.status` à `validated`
   ou `rejected`. Aucune policy client ne permet d'écrire `validated`.
4. Le journal est **append-only** : une décision erronée est corrigée par une décision
   ultérieure, jamais par réécriture.

### 3.3 bis Dérivation du statut (serveur)
1. L'insertion dans `evidence_validations` franchit d'abord la policy
   `evidence_validations_insert_scoped` (portée exacte, ni titulaire ni auteur).
2. Le trigger `AFTER INSERT` de `003_server_invariants.sql` recalcule
   `evidence.status` depuis la **dernière** décision : `validated`, `rejected`, ou
   `submitted` pour `needs_revision`.
3. La transition est journalisée dans `audit_events`.
4. C'est le **seul** mécanisme mutant privilégié ; aucune RPC équivalente n'est exposée,
   et un second trigger gèle les colonnes d'identité/provenance d'une preuve.

### 3.3 ter Invariants serveur transverses
- `enforce_source_provenance()` (BEFORE INSERT OR UPDATE, SECURITY INVOKER,
  `search_path` verrouillé) sur les **15 tables** porteuses de provenance : un rôle
  `authenticated` doit insérer `source_system = 'native'` avec `source_id`,
  `imported_at`, `import_batch_id` NULL ; et **aucun rôle**, `service_role` compris,
  ne peut modifier ces 4 colonnes en UPDATE. Un import est un INSERT ; une correction
  est une nouvelle ligne auditée, pas une réécriture de l'origine.
- `set_updated_at()` (BEFORE UPDATE) sur les **14 tables** ayant `updated_at` :
  la valeur est toujours `clock_timestamp()` côté serveur. `updated_at` n'est donc
  plus accordé dans les GRANT de colonnes de `profiles` et `evidence`.
- **`service_role` contourne la RLS.** Toute opération serveur menée avec cette clé
  (écriture d'assets, import legacy, journalisation) doit **revérifier l'autorisation
  métier dans le backend** avant d'agir : la base ne rattrapera pas une erreur
  d'autorisation applicative. Seuls l'immuabilité de la provenance et le gel de
  l'identité d'une preuve restent opposables à `service_role`.

### 3.3 quater Plan d'acquisition : template → plan → demande → décision

```text
admin              template draft ──publication (serveur : figeage + anti-cycle)──► published
                                                     │
serveur            instanciation d'une version ───────┘
                   -> acquisition_plans + acquisition_plan_items (dépliage)
apprenant          ajuste learner_target_at / progress_state (dans la fenêtre officielle)
apprenant          plan_change_requests : draft ──submit──► pending
serveur (trigger)  dérive change_impact + required_approver_role
                     auto_accept          -> appliqué immédiatement, audité
                     teacher_or_admin     -> attente d'une décision de portée
                     placement_supervisor -> attente de l'encadrant DU stage
décideur           plan_change_decisions (append-only) ──trigger──► application atomique
                   des seuls champs proposés + audit_events
```

Rappel structurant : **rien de ce flux ne produit une acquisition**.
`progress_state = 'done'` signifie « action planifiée terminée ». La maîtrise
reste dérivée de `evidence` + `evidence_validations` (§3.4), et une compétence
réelle exige toujours une validation par un tiers.

### 3.4 Calcul de progression
Toujours dérivé, en lecture : preuves comptables par nature d'acquis
(`knowledge` : quiz / validation humaine ; `simulated_competence` : simulation /
validation humaine ; `real_competence` : activité réelle ou stage **plus** validation
tierce). Une compétence réelle auto-déclarée sans validateur reste non acquise.

### 3.5 Import legacy
`source_system`, `source_id`, `imported_at`, `import_batch_id` sur toute table importable.
Import par lots idempotents (clé naturelle `(source_system, source_id)`), en recette
d'abord, avec rapport de rejets.

## 4. Provenance et stratégie d'import

| Famille historique | Cible | Règle |
| --- | --- | --- |
| Utilisateurs | `auth.users` + `profiles` | dédoublonnage par email, `source_id` conservé |
| 116 inscriptions / promotions | `cohorts` + `enrollments` | une promotion = une `cohort`; jamais de doublon `(person_id, cohort_id)` |
| 57 compétences | `outcomes` + `outcome_relations` | rattachement `migrated_from` / `aligned_with` au nouveau référentiel, sans écraser celui-ci |
| 6 612 états historiques | `evidence` (+ `evidence_sources.source_kind = 'legacy_state'`) | importés avec leur `kind` d'origine ; **jamais** `status = 'validated'` sans validateur identifiable |
| Contenus | `learning_resources` (+ liaison) | `is_published = false` par défaut, relecture requise |

Règles non négociables :
1. Aucun état historique n'est importé comme **compétence réelle acquise** : sans
   validateur identifiable, la preuve arrive en `submitted` et reste non comptée.
2. Quand un validateur historique est identifiable, une ligne `evidence_validations`
   est créée avec `source_system` legacy et le `decided_at` d'origine.
3. `import_batch_id` permet un ciblage et un retrait exact d'un lot.
4. Aucune lecture croisée en production sur l'existant : export → transformation → import.

## 5. Rollback et ordre des migrations

Ordre futur (une fois le schéma validé) :

```text
0001_enums_and_profiles
0002_programs_curricula_cohorts
0003_enrollments_and_roles
0004_outcomes_and_relations
0005_learning_resources
0006_placements_and_supervisors
0007_evidence_sources_validations
0008_audit_ai_usage_quotas
0009_rls_functions_and_policies
0010_legacy_import_staging (schéma `staging`, jeté après recette)
```

Rollback :
- chaque migration a un `down` écrit **avant** application (drop policy → drop function →
  drop table → drop type, dans l'ordre inverse) ;
- l'import legacy se déroule dans un schéma `staging` séparé, jamais directement dans
  `public` ; le retrait d'un lot se fait par `import_batch_id` ;
- aucune migration destructive sur `evidence` / `evidence_validations` / `audit_events` :
  seules des migrations additives sont admises après mise en service.

## 6. Limites du Lot 1

- Rien n'est exécuté : pas de base, pas de migration, pas de policy active, pas de test SQL joué.
- L'application continue de fonctionner sur les repositories mock en mémoire.
- Le passage `evidence.status → 'validated'` est conçu (trigger de `003_server_invariants.sql`)
  mais n'est **pas exécuté** : aucune base, aucun trigger actif.
- Le stockage de fichiers suppose des buckets privés **non créés** (`storage_architecture.md`).
- `pgvector` n'est pas activé : les embeddings sont repoussés au Lot 3.
- Les endpoints IA, quotas et comptabilité (`ai_usage_events`) sont modélisés, non implémentés.
- Le moteur ECOS n'est pas modélisé au-delà de `kind = 'simulation'`.

## 7. Cohérence TypeScript ↔ SQL

| TypeScript (`src/domain/types.ts`) | SQL |
| --- | --- |
| `ProgramKind` | `program_kind` |
| `CurriculumVersion.status` | `curriculum_status` |
| `Enrollment.status` | `enrollment_status` |
| `RoleName` | `role_name` |
| `RoleScope.kind` | `role_scope_kind` |
| `OutcomeNature` | `outcome_nature` |
| `MasteryLevel` / `MASTERY_ORDER` | `mastery_level` (ordre identique) |
| `OutcomeRelationKind` | `outcome_relation_kind` |
| `PlacementAssignment.status` | `placement_assignment_status` |
| `EvidenceKind` | `evidence_kind` |
| `EvidenceStatus` | `evidence_status` |
| `EvidenceValidation.decision` | `validation_decision` |
| `LearningResource.format` | `learning_resource_format` |
| `Provenance` | colonnes `source_system` / `source_id` / `imported_at` / `import_batch_id` |
| `Person` | `profiles` (l'email reste dans `auth.users`) |
| `Evidence.metrics` | non repris : remplacé par colonnes typées + `context` JSONB |
| `AcquisitionPlanItem` | `acquisition_plan_items` |
| `AcquisitionPlanTrack` / `AcquisitionTrack` | dérivé de `outcomes.nature` (aucune colonne `track`) |
| `PlanItemStage` (`to_plan`/`in_progress`/`to_validate`) | `plan_item_progress_state` (mêmes valeurs ; `acquired` n'est pas stocké) |
| `PlanChangeRequest` | `plan_change_requests` (+ `plan_change_decisions`) |
| `PlanChangeImpact` | `plan_change_impact` (6 valeurs SQL regroupées en 3 côté UI) |
| `PlanApprovalRule` | `plan_approval_rule` |
| `PlanChangeStatus` (`accepted`) | `plan_change_status` (`approved`, + `withdrawn`) |
| `ResourceAsset` (non nécessaire au Lot 1) | `learning_resource_assets` / `resource_asset_kind` / `storage_provider` / `asset_processing_status` |

Aucun type TypeScript n'a été ajouté pour les assets : les repositories mock n'exposent
aucun fichier, et introduire `ResourceAsset` maintenant créerait un type mort sans
changer le comportement. Il sera ajouté avec le port `StorageProvider`, au moment où
le stockage sera réellement câblé.

## 8. Checklist statique

`grant_policy_checklist.md` recense, table par table, la correspondance
GRANT ↔ POLICY, ainsi que la liste des fonctions `SECURITY DEFINER` avec leur
justification et leur exposition. Toute modification de `001` ou `002` doit être
reportée dans cette checklist.
