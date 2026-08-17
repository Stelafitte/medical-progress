# Carnet de stage configurable — conception SQL / RLS (DRAFT — DO NOT EXECUTE)

Statut : **conception uniquement**. Aucune migration n'est créée ni exécutée, aucun
bucket de stockage n'est provisionné, aucune image réelle n'existe dans la maquette
(pièces jointes de démonstration seulement).

Le module UI correspondant est entièrement mock : `src/domain/stageLog.ts`,
`src/infrastructure/mock/stageLogFixtures.ts`, `src/features/stage/*`,
`src/features/administration/StageLogTemplatesSection.tsx`.

## 1. Périmètre fonctionnel

Un seul moteur générique sert tous les programmes (DIU d'Échocardiographie, DFASM
Cardiologie, programmes futurs). Seule la **configuration du modèle** change :
champs, objectifs / quotas, fréquence, validateur, règles de complétude et
politique de photos.

## 2. Tables prévues (non créées)

| Table | Rôle | Notes de conception |
| --- | --- | --- |
| `stage_log_templates` | modèle versionné par programme | `program_id`, `version`, `module_label`, `enabled`, unicité `(program_id, module_label, version)` ; version immuable après première utilisation |
| `stage_log_template_cohorts` | activation par cohorte | liste vide ⇒ toutes les cohortes du programme |
| `stage_log_template_fields` | champs configurables | `kind` enum (`text`, `long_text`, `choice`, `count`, `autonomy`), `required`, `options jsonb` |
| `stage_log_template_objectives` | objectifs / quotas / fréquence | `quota int`, `frequency` enum |
| `stage_log_photo_requirements` | objets de photo autorisés | `label`, `framing_instruction`, `required`, `is_custom` — jamais de « document intégral » |
| `stage_log_photo_policies` | politique par modèle | `enabled`, `allow_custom_object`, `max_photos_per_entry`, `supervisor_validation_required`, `retention_policy` (**à définir avant backend**), `automatic_check` figé à `not_active` |
| `stage_logs` | carnet d'une inscription | `enrollment_id`, `program_id`, `cohort_id`, `placement_assignment_id`, `template_id`, `template_version`, `status` |
| `stage_log_entries` | entrées structurées | `occurred_at`, `values jsonb` validé contre les champs du modèle ; **aucune colonne patient nominative** |
| `stage_log_entry_photos` | métadonnées de fragment | `photo_requirement_id`, `storage_object_path` (bucket privé futur), `declared_no_identifiers boolean NOT NULL CHECK (declared_no_identifiers)`, `checklist_acknowledged jsonb` |
| `stage_log_validations` | décisions humaines, append-only | `validator_person_id`, `validator_role`, `decision`, `decided_at`, `comment` |
| `audit_events` (existante) | journal | `stage_log.submitted`, `stage_log.validated`, `stage_log.revision_requested`, `stage_log.transmitted`, `stage_log.photo_attached` |

Chaque `CREATE TABLE` du schéma `public` sera suivi, dans la même migration future,
de ses `GRANT` explicites puis de `ENABLE ROW LEVEL SECURITY` et des policies
(voir `grant_policy_checklist.md`).

## 3. Statuts et workflow

`draft → submitted → (needs_revision → submitted)* → validated → transmitted`

- `submit` : apprenant propriétaire uniquement, depuis `draft` ou `needs_revision` ;
- `validate` / `request_revision` : responsable du stage (ou enseignant du programme
  selon `validator_role`), uniquement depuis `submitted` ;
- `transmit` : administration du programme, uniquement depuis `validated` ;
- « transmis » est un **état interne** : aucune pièce jointe n'est envoyée par e-mail.

Ces transitions seront figées par trigger `enforce_stage_log_transitions`, avec
`SET search_path = public` et calcul inline `current_user = 'postgres'` pour les
écritures internes (pas de helper appelable par le client, cf. D47–D52).

## 4. Matrice RLS prévue

| Rôle | `stage_logs` / `stage_log_entries` | `stage_log_templates` | `stage_log_validations` |
| --- | --- | --- | --- |
| `anon` | aucun accès (REVOKE explicite) | aucun accès | aucun accès |
| apprenant | SELECT/INSERT/UPDATE **de son seul carnet** (`enrollment_id` de son `auth.uid()`), UPDATE bloqué hors `draft`/`needs_revision` | SELECT du modèle actif de son programme et de sa cohorte | SELECT seulement |
| encadrant de stage | SELECT des carnets `submitted`/`validated` rattachés **à ses `placement_assignment_id`** | SELECT du modèle du stage | INSERT de sa propre décision, jamais UPDATE/DELETE |
| enseignant | idem, borné à son programme / cohorte | SELECT | INSERT |
| administrateur de programme | SELECT des carnets `validated`/`transmitted` **de son seul programme**, UPDATE du statut `transmitted` | INSERT/UPDATE des modèles de son programme | SELECT |
| `service_role` | ALL (écritures serveur, dont les objets de stockage) | ALL | ALL |

Cloisonnement : aucune policy ne s'appuie sur un booléen client ; les portées
programme / cohorte / stage sont résolues par les fonctions `SECURITY DEFINER`
existantes (`has_role`, helpers de cohorte et de stage), toutes avec
`SET search_path = public`.

## 5. Photos — invariants de sécurité

1. Bucket **privé** exclusivement ; jamais d'URL publique. Lecture par URL signée
   de courte durée, générée côté serveur après contrôle de rôle.
2. Écriture des objets réservée à `service_role` (aucun GRANT client), comme pour
   les assets pédagogiques.
3. `declared_no_identifiers` est obligatoire et contraint à `true` : sans
   déclaration explicite de l'apprenant, l'insertion échoue.
4. `checklist_acknowledged` doit contenir les cinq points (nom/prénom, date de
   naissance, identifiant de dossier ou de séjour, code-barres/QR, cadrage limité).
5. `automatic_check` est figé à `not_active` : la plateforme **ne garantit aucune
   anonymisation** et ne le prétend nulle part dans l'UI.
6. Seul un `photo_requirement_id` du modèle du carnet est accepté (clé étrangère
   composée avec `template_id`) : aucun objet libre côté apprenant, aucune option
   de document intégral.
7. Aucune acquisition n'est jamais dérivée d'une photo : aucun trigger ne crée
   d'`evidence` ni ne modifie un état de maîtrise depuis
   `stage_log_entry_photos`. Toute compétence réelle exige une
   `stage_log_validations` humaine puis une `evidence_validations` correspondante.

## 6. Journal d'audit

Toute transition de statut, toute décision de validation et toute pièce jointe
photo écrivent un `audit_events` (acteur, action, cible, programme). Le journal
reste en lecture seule pour les rôles clients.

## 7. Reste à décider avant backend

- durée de conservation des fragments photo (aujourd'hui « à définir avant backend ») ;
- purge automatique et anonymisation des métadonnées après clôture de cohorte ;
- quotas de dépôt par apprenant et par stage.
