# Journal de décisions — schéma & RLS du Lot 1

Statut : **conception non exécutée**. Aucune base activée, aucune migration créée.

## Décisions

| # | Décision | Motif |
| --- | --- | --- |
| D1 | `profiles` référence `auth.users(id)` sans email ni mot de passe | pas de duplication d'identifiants ; `auth.users` reste la source de vérité |
| D2 | Aucune table de progression | la progression est dérivée des preuves (invariant produit) ; éviter une seconde vérité divergente |
| D3 | Rôles dans `role_assignments`, jamais sur `profiles` | prévention d'escalade de privilèges |
| D4 | `scope_kind` + colonnes nullables + `CHECK` conditionnel | portées platform/program/cohort/placement contrôlées en base, miroir de `RoleScope` |
| D5 | `program_id` redondant mais verrouillé par FK composites `(id, program_id)` | RLS locale et performante sans risque d'incohérence de programme |
| D6 | `placement_supervisors` = source de vérité de l'encadrement | un encadrant ne l'est jamais globalement ; `supervisor_person_id` reste un référent contraint |
| D7 | `evidence_validations` append-only (aucune policy UPDATE/DELETE) | traçabilité médico-pédagogique ; on corrige par une nouvelle décision |
| D8 | `evidence.status = 'validated'` inatteignable depuis le client | l'acquisition ne peut être auto-déclarée ; transition serveur après validation conforme |
| D9 | `can_validate_evidence()` exclut le titulaire **et** l'auteur de la saisie | empêche l'auto-validation directe et indirecte |
| D10 | 14 fonctions `SECURITY DEFINER` de lecture, owner `postgres`, `search_path = pg_catalog, public`, `REVOKE` PUBLIC/anon + `GRANT EXECUTE` authenticated | seul moyen d'éviter la récursion RLS sur `role_assignments`, `enrollments`, `placement_supervisors` ; toutes `stable` et sans écriture |
| D11 | Aucun `GRANT` à `anon`, aucune policy `anon` | pas de surface publique dans le Lot 1 |
| D12 | `audit_events` / `ai_usage_events` : `GRANT SELECT` seul pour `authenticated`, aucune écriture | les policies SELECT existent et doivent être utilisables ; l'écriture reste `service_role` |
| D13 | Quotas IA par programme dans `ai_quota_policies`, lecture admin de portée | configuration métier, pas de secret ni de clé en base |
| D14 | Provenance sur toute table importable (`source_system`, `source_id`, `imported_at`, `import_batch_id`) | reprise sélective traçable et retirable lot par lot |
| D15 | États historiques importés en `submitted`, jamais `validated` sans validateur identifiable | un acquis réel sans tiers n'existe pas |
| D16 | Policies séparées par opération, jamais `FOR ALL` | lisibilité et auditabilité de la matrice |
| D17 | `evidence.metrics` du TypeScript remplacé par colonnes typées + `context` JSONB | score/autonomie/répétition/confiance sont des données de pilotage, pas du texte libre |

| D18 | Portées séparées : `has_program_wide_role` / `has_cohort_role` / `supervises_*` au lieu d'un `has_program_role` fourre-tout | l'ancienne fonction promouvait un rôle de cohorte ou de stage en rôle de programme : un enseignant de cohorte voyait toutes les preuves du programme |
| D19 | `has_any_program_role` conservée mais réservée au **référentiel non nominatif** | un enseignant de cohorte doit lire le programme et les acquis ; ces données ne sont pas nominatives |
| D20 | `search_path = pg_catalog, public` (pg_temp retiré, pg_catalog en tête) | aucun objet utilisateur ou temporaire ne peut masquer une fonction ou un opérateur système |
| D21 | GRANT de colonnes sur `profiles`, `evidence`, `evidence_sources`, `evidence_validations` | l'identité, le statut et la provenance deviennent non réécrivables **par privilège**, indépendamment des policies |
| D22 | Tables d'administration : DML complet accordé à `authenticated`, RLS seule barrière | une policy sans privilège correspondant est un piège silencieux ; on rend les deux couches cohérentes |
| D23 | Un unique mécanisme mutant : trigger `AFTER INSERT` sur `evidence_validations`, fonction non exposée | une RPC exposée serait appelable hors contexte ; un trigger n'existe qu'après une insertion ayant franchi la RLS |
| D24 | Trigger `BEFORE UPDATE` d'immutabilité des colonnes d'identité d'une preuve | ferme le cas résiduel `service_role` / script d'import, au-delà des GRANT de colonnes |
| D25 | `learning_resource_assets` : métadonnées seules, jamais de binaire ni d'URL publique durable | accès par URL signée courte après contrôle RLS côté serveur ; portabilité S3/R2 via l'enum `storage_provider` |
| D26 | `learning_resource_outcomes` et assets visibles seulement si la ressource est publiée | les liaisons d'une ressource non publiée révéleraient un contenu à venir |
| D27 | FK composites + `CHECK` de cohérence des null sur `ai_usage_events` | une FK composite est MATCH SIMPLE : inerte si une colonne est null, d'où le CHECK complémentaire |
| D28 | `source_system = 'native'` imposé dans tous les `with check` d'écriture client | interdit de faire passer une saisie courante pour une donnée historique importée |

## Alternatives rejetées

| Alternative | Raison du rejet |
| --- | --- |
| Table `outcome_progress` matérialisée comme vérité | divergence garantie avec les preuves ; contraire à l'invariant produit |
| Rôle unique global sur `profiles.role` | escalade de privilèges triviale, incompatible avec les portées |
| `is_admin` en claim JWT applicatif | claim modifiable au provisioning, non révocable immédiatement ; la base doit décider |
| Policies `FOR ALL USING (true)` puis filtrage applicatif | confiance au frontend, inacceptable |
| `evidence_validations` modifiable par un admin | perte de traçabilité des décisions cliniques |
| Suppression physique des preuves rejetées | perte d'audit ; on utilise `status` |
| Tableau `outcome_ids uuid[]` sur `learning_resources` | pas d'intégrité référentielle, jointures pénibles |
| Un schéma par programme (DIU / DFASM) | deux architectures de fait ; contraire au moteur commun configurable |
| `SECURITY DEFINER` sur des fonctions mutantes (ex. `submit_evidence`) | surface d'écriture privilégiée exposée à la Data API ; passera par le serveur applicatif |
| Import par lecture croisée directe des tables legacy | couplage à la production existante, interdit |
| `has_program_role(program, role)` couvrant toutes les portées | fuite inter-cohorte confirmée en revue : rejetée et remplacée par D18 |
| RPC `validate_evidence()` exposée à `authenticated` | surface d'écriture privilégiée appelable hors contexte ; remplacée par le trigger D23 |
| URL publique de bucket stockée en base | lien permanent non révocable ; remplacée par URL signée courte |
| Binaires en `bytea` dans PostgreSQL | coût, sauvegardes ingérables, pas de streaming |
| `pgvector` dès le Lot 1 | aucun usage réel avant le Lot 3 ; extension et index non justifiés |

## Questions à valider avant provisioning

1. **Cohortes DIU** : une promotion annuelle unique, ou plusieurs sessions par an ?
   Impacte l'unicité `(program_id, label)`.
2. **Encadrants multiples** : une preuve de stage doit-elle pouvoir exiger 2 validations
   (co-signature) ? Aujourd'hui une validation suffit.
3. **Expiration** : durée de validité d'une compétence réelle (statut `expired`) —
   règle par programme ou par outcome ?
4. **Rôle enseignant en portée cohorte** : tranché — lecture **et** validation, strictement
   limitées à sa cohorte (`has_cohort_role`). Reste à confirmer côté métier.
5. **Barème** : `score_raw/score_max` suffit-il, ou faut-il un modèle de tentatives QCM
   détaillé (`quiz_attempts`) dès le Lot 2 ?
6. **Fichiers** : tranché — buckets privés séparés `originals` / `derived` / `evidence` /
   `documents` en région UE, chemin `{program_id}/{resource_id}/{asset_id}`
   (`storage_architecture.md`). Rétention, suppression et sauvegarde chiffrée restent à définir.
7. **Legacy** : les 6 612 états historiques portent-ils un validateur exploitable, et sous
   quelle forme (identifiant, nom libre) ?
8. **Anonymisation** : durée de conservation des `ai_usage_events` nominatifs.
9. **RGPD** : responsable de traitement et base légale à documenter avant mise en service.
10. **Admin plateforme** : combien de comptes, et procédure d'attribution initiale
    (seed manuel côté base, hors application) ?
11. **Co-signature** : si une preuve exige deux validations, le trigger de dérivation doit
    compter les décisions au lieu de lire la dernière — à trancher avant provisioning.
12. **Quarantaine antivirus** : qui a le droit de lever un `processing_status = 'quarantined'` ?
