# Plan d'acquisition — architecture de conception (DRAFT — DO NOT EXECUTE)

Ce document complète `architecture.md` pour le périmètre « plan d'acquisition et
préférences de partage ». Aucune base n'est activée, aucun fichier de
`supabase/migrations/` n'existe, rien n'a été exécuté.

## 1. Une seule vérité, deux niveaux, quatre projections

```text
acquisition_plan_templates        (référentiel versionné, défini par admin)
        │  version_number, status draft|published|retired
        └── acquisition_plan_template_items      (ordre, fenêtre officielle)
                 └── ..._item_dependencies       (prérequis intra-template)
                                │  instanciation SERVEUR
                                ▼
acquisition_plans                (1 par enrollment actif, issu d'une version)
        └── acquisition_plan_items               ← SOURCE UNIQUE DES 4 VUES
                 ├── Liste      : lignes triées par sequence
                 ├── Kanban     : regroupement par progress_state (+ preuves)
                 ├── Gantt      : official_start_at → official_due_at, dépendances
                 └── Calendrier : official_due_at / learner_target_at
```

Aucune vue n'a de table. Ajouter une cinquième représentation n'ajoute aucune
table : c'est une nouvelle projection de `acquisition_plan_items`.

## 2. La progression reste dérivée des preuves

`acquisition_plan_items.progress_state` (`to_plan`, `in_progress`,
`to_validate`, `done`) décrit **l'avancement d'une action planifiée**. `done`
signifie « l'action prévue est terminée », **jamais** « la connaissance ou la
compétence est acquise ».

La maîtrise reste calculée à partir de `evidence` + `evidence_validations`
(`src/domain/mastery.ts`), avec la règle inchangée : une compétence réelle
(`outcomes.nature = 'real_competence'`) ne peut jamais être acquise par
auto-déclaration seule. La colonne Kanban « Acquis » du frontend est donc
calculée depuis les preuves, pas depuis `progress_state`.

## 3. Dates officielles vs cible personnelle

| Colonne | Propriétaire | Modifiable par |
| --- | --- | --- |
| `official_start_at`, `official_due_at`, `sequence`, `is_mandatory` | institution | uniquement l'application d'une décision approuvée (`003 §9`) |
| `learner_target_at`, `progress_state` | apprenant | l'apprenant, dans la fenêtre officielle (`003 §11`) |

L'apprenant ne peut donc jamais repousser une échéance opposable, mais il
organise librement son propre rythme à l'intérieur de celle-ci.

## 4. Versioning des templates

Un template `published` est immuable : ses items et ses dépendances le sont
aussi (`003 §6`). Une évolution pédagogique crée une nouvelle ligne avec un
`version_number` supérieur, pour le même
`(program_id, curriculum_version_id, cohort_id)`. Les plans individuels déjà
instanciés continuent de référencer la version sous laquelle l'apprenant s'est
engagé — condition d'opposabilité d'un cursus.

L'absence de cycle dans le graphe de prérequis n'est pas exprimable en
contrainte déclarative : elle est vérifiée par le backend à la publication, en
même temps que le figeage du template.

## 5. Demande de modification : cycle de vie

```text
draft ──submit(justification ≥ 10 car.)──► pending ──┬─ décision approved ─► approved
  │                                                  ├─ décision rejected ─► rejected
  └──withdraw──► withdrawn        pending ──withdraw──┘  (avant toute décision)
```

* `change_impact` et `required_approver_role` ne sont **jamais** envoyés par le
  client (aucun GRANT) : ils sont dérivés (`003 §7`).
* `approved` / `rejected` ne sont posés que par le trigger d'application, en
  conséquence d'une ligne insérée dans `plan_change_decisions`.
* Une demande `pending` est immuable hors décision ou retrait.
* `plan_change_decisions` est append-only : une erreur se corrige par une
  nouvelle ligne, jamais par une réécriture.

### Règle d'approbation dérivée

| Situation | `change_impact` | Décideur exigé |
| --- | --- | --- |
| cible personnelle / rythme, dans la fenêtre officielle | `personal_target`, `personal_pace` | `auto_accept` (aucun humain) |
| échéance officielle, ordre, prérequis, acquis obligatoire | `official_deadline`, `prerequisite`, `required_outcome` | `teacher_or_admin` (portée exacte) |
| élément rattaché à un stage, ou acquis `real_competence` | `clinical_competence` | `placement_supervisor` de **ce** stage |

L'ordre d'évaluation est décroissant en exigence : le cas clinique l'emporte
toujours, un ajustement personnel ne peut jamais requalifier une échéance
officielle.

## 6. Préférences de partage — ce qu'elles ne font pas

`passport_share_preferences` pilote **uniquement** ce que l'apprenant inclut
dans un partage ou un export qu'il initie lui-même (connaissances, compétences
simulées, compétences réelles, preuves, validations, stages, historique,
prochains jalons).

Ces préférences :

* ne sont lues par **aucune** policy RLS de `002_rls_policies.sql` ;
* ne modifient jamais le dossier institutionnel ;
* ne réduisent jamais la visibilité des enseignants de portée, des encadrants
  du stage concerné et des administrateurs de programme.

Un apprenant qui désactive tout continue d'être suivi normalement par les
professionnels autorisés. Le test T32 le vérifie.

## 7. Alignement de nommage frontend ↔ SQL (une seule vérité)

| Frontend (`src/domain/acquisitionPlan.ts`) | SQL |
| --- | --- |
| `AcquisitionPlanItem` | `public.acquisition_plan_items` |
| `AcquisitionPlanTrack` / `AcquisitionTrack` | **dérivé** de `outcomes.nature` — aucune colonne `track` |
| `PlanItemStage` `to_plan/in_progress/to_validate` | `plan_item_progress_state` (mêmes valeurs) |
| `PlanItemStage` `acquired` | **non stocké** : dérivé des preuves validées |
| `PlanChangeRequest` | `public.plan_change_requests` |
| `PlanChangeImpact` `personal_pace` | `personal_target`, `personal_pace` |
| `PlanChangeImpact` `official_deadline` | `official_deadline`, `prerequisite`, `required_outcome` |
| `PlanChangeImpact` `clinical_competence` | `clinical_competence` |
| `PlanApprovalRule` | `plan_approval_rule` (valeurs identiques) |
| `PlanChangeStatus` `accepted` | `plan_change_status` `approved` |
| `PlanChangeStatus` (absent) | `withdrawn` (retrait par le demandeur) |

Le regroupement des impacts officiels et la traduction `accepted ↔ approved`
sont les **seuls** points de traduction autorisés ; ils sont implémentés dans
l'adapter d'infrastructure, jamais dupliqués dans l'UI.

## 8. Audit

Toute décision et toute auto-acceptation écrivent dans `audit_events`
(`plan_change_request.approved | rejected | auto_accepted`) avec l'acteur,
l'impact, le rôle décideur et l'identifiant de la décision. Les clients ne
peuvent pas écrire `audit_events` (policies inchangées de `002 §12`).
