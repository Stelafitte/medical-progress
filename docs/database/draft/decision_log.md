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
| D10 | 8 fonctions `SECURITY DEFINER`, owner `postgres`, `search_path` verrouillé, `REVOKE` PUBLIC/anon + `GRANT EXECUTE` authenticated | seul moyen d'éviter la récursion RLS sur `role_assignments`, `enrollments`, `placement_supervisors` ; toutes en lecture seule et `stable` |
| D11 | Aucun `GRANT` à `anon`, aucune policy `anon` | pas de surface publique dans le Lot 1 |
| D12 | `audit_events` / `ai_usage_events` : ni GRANT ni policy d'écriture pour `authenticated` | double barrière ; écriture serveur/`service_role` uniquement |
| D13 | Quotas IA par programme dans `ai_quota_policies`, lecture admin de portée | configuration métier, pas de secret ni de clé en base |
| D14 | Provenance sur toute table importable (`source_system`, `source_id`, `imported_at`, `import_batch_id`) | reprise sélective traçable et retirable lot par lot |
| D15 | États historiques importés en `submitted`, jamais `validated` sans validateur identifiable | un acquis réel sans tiers n'existe pas |
| D16 | Policies séparées par opération, jamais `FOR ALL` | lisibilité et auditabilité de la matrice |
| D17 | `evidence.metrics` du TypeScript remplacé par colonnes typées + `context` JSONB | score/autonomie/répétition/confiance sont des données de pilotage, pas du texte libre |

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

## Questions à valider avant provisioning

1. **Cohortes DIU** : une promotion annuelle unique, ou plusieurs sessions par an ?
   Impacte l'unicité `(program_id, label)`.
2. **Encadrants multiples** : une preuve de stage doit-elle pouvoir exiger 2 validations
   (co-signature) ? Aujourd'hui une validation suffit.
3. **Expiration** : durée de validité d'une compétence réelle (statut `expired`) —
   règle par programme ou par outcome ?
4. **Rôle enseignant en portée cohorte** : lecture seule ou droit de validation restreint
   aux cohortes qu'il encadre ?
5. **Barème** : `score_raw/score_max` suffit-il, ou faut-il un modèle de tentatives QCM
   détaillé (`quiz_attempts`) dès le Lot 2 ?
6. **Fichiers** : bucket privé unique avec chemin `{program_id}/{enrollment_id}/…` ?
   Politique de rétention à définir.
7. **Legacy** : les 6 612 états historiques portent-ils un validateur exploitable, et sous
   quelle forme (identifiant, nom libre) ?
8. **Anonymisation** : durée de conservation des `ai_usage_events` nominatifs.
9. **RGPD** : responsable de traitement et base légale à documenter avant mise en service.
10. **Admin plateforme** : combien de comptes, et procédure d'attribution initiale
    (seed manuel côté base, hors application) ?
