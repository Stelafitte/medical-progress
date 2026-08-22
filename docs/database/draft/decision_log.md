# Journal de décisions — schéma & RLS du Lot 1

Statut : **conception non exécutée**. Aucune base activée, aucune migration créée.

## Décisions

| # | Décision | Motif |
| --- | --- | --- |
| D58 (2026-08-17) | **Carnet de stage générique** : un seul moteur, une configuration par programme / module / cohorte (`stage_log_templates` versionné) | interdit deux architectures parallèles DIU / DFASM ; conception détaillée dans `stage_logbook_architecture.md`, aucune migration créée |
| D59 (2026-08-17) | La photo est **toujours un fragment explicitement autorisé** par l'administrateur (`stage_log_photo_requirements`), jamais un document intégral | limite la collecte au strict nécessaire et rend la consigne de cadrage opposable |
| D60 (2026-08-17) | `declared_no_identifiers` obligatoire et contraint à `true`, `checklist_acknowledged` complet | une pièce jointe sans déclaration explicite de l'apprenant est refusée par construction, en base comme en UI |
| D61 (2026-08-17) | `automatic_check` figé à `not_active` ; aucune formulation ne présente la photo comme anonymisée | aucun contrôle OCR n'existe : promettre une anonymisation serait faux et juridiquement dangereux |
| D62 (2026-08-17) | Aucune acquisition n'est jamais dérivée d'une photo ; `stage_log_validations` humaine obligatoire | invariant produit : une compétence réelle n'est jamais déclarée acquise par l'apprenant seul |
| D63 (2026-08-17) | « Transmis » est un **état interne** du carnet (`transmitted`), jamais un envoi e-mail | évite l'exfiltration de fragments de dossier hors de l'espace sécurisé du programme |
| D64 (2026-08-17) | Photos futures en **bucket privé**, écriture réservée à `service_role`, lecture par URL signée courte | alignement sur `storage_architecture.md` ; aucune URL publique possible |
| D65 (2026-08-21) | Tout support **publié** doit disposer d'un profil d'exploitation IA `ready` avec références contrôlées ; la publication est bloquée sinon | garantit que l'IA s'appuie toujours sur du contenu pédagogique validé et citable, quel que soit le format |
| D66 (2026-08-21) | Le statut IA est **distinct** du statut éditorial du support | un support peut être publié pédagogiquement et non encore exploitable par l'IA, et inversement |
| D67 (2026-08-21) | Les pages web HTML sont exploitées via un **instantané extrait, nettoyé, structuré, versionné et validé** ; aucune relecture libre du Web, aucun HTML brut conservé | rend le corpus IA reproductible, citable et opposable ; supprime la dépendance à une page mouvante |
| D68 (2026-08-21) | Un changement distant met la ressource en « actualisation à contrôler » sans jamais écraser l'instantané validé | la validation pédagogique humaine reste la condition d'entrée dans le corpus |
| D69 (2026-08-21) | Un **lien externe simple** reste hors corpus IA jusqu'à décision explicite (page web HTML, document déposé, non publié) | évite un corpus fondé sur des contenus non maîtrisés |
| D70 (2026-08-21) | Escalade de coûts documentée (contenu validé seul → modèle léger → modèle avancé → vocal temps réel) ; vocal mis en avant pour le DFASM, jamais lancé par défaut pour le DIU | maîtrise budgétaire avant toute activation ; réglage laissé à l'administrateur du programme |
| D71 (2026-08-18) | La couverture IA des supports **publiés** est un **invariant vérifié**, pas une cible : 100 % des publiés ont un profil `ready`, facettes complètes et citations vérifiées ; les fixtures échouent sinon | supprime l'écart de recette (75 %) et rend la règle testable |
| D72 (2026-08-18) | Une modification distante détectée crée l'alerte « actualisation à contrôler » **sans** changer le statut IA : l'instantané validé reste `ready` et exploitable | la continuité pédagogique ne dépend pas d'un changement éditorial externe |
| D73 (2026-08-18) | Un **lien externe simple ne peut pas être publié** : il est converti en page web HTML (instantané validé) ou reste brouillon ; les exemples non prêts vivent uniquement parmi les non-publiés | le corpus publié est intégralement exploitable et citable |
| D53 (2026-08-17) | Le **nom global** de la plateforme devient exactement « Mon Passeport Éducatif » (anciens noms courants, historiques uniquement : « Passeport Éducatif Médical », « EduPassport Core ») | décision produit définitive ; renommage limité aux textes visibles, métadonnées et documentation — aucun nom de table, type, colonne, fonction, policy ni concept métier n'est modifié |

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
| D29 | `learning_resource_assets` : policy SELECT seule, aucun GRANT d'écriture client | le navigateur ne doit jamais choisir `bucket_name`/`object_path`/`storage_provider`, falsifier `checksum_sha256`/`byte_size` ni poser `processing_status = 'ready'` avant scan |
| D30 | Trigger générique `enforce_source_provenance()` sur les 15 tables porteuses | les `with check` de policy ne couvraient ni l'UPDATE ni `service_role` ; un admin de programme pouvait insérer une fausse ligne « legacy » |
| D31 | Provenance immuable en UPDATE **pour tous les rôles** | un import est un INSERT ; une correction ultérieure doit être traçable, jamais réécrire l'origine d'une donnée historique |
| D32 | `profiles_update_self` : `with check (id = auth.uid())` sans condition de provenance | un profil importé du legacy devait sinon requalifier son origine en `native` pour corriger son nom — exactement ce que D31 interdit |
| D33 | Trigger générique `set_updated_at()` (`clock_timestamp()`), `updated_at` retiré des GRANT de colonnes | l'horodatage de modification est une donnée serveur ; `clock_timestamp()` distingue deux écritures d'un même batch |
| D34 | `revoke ... from anon` sur la **liste explicite** des tables du draft | `revoke all on all tables in schema public` toucherait par surprise des objets `public` ajoutés plus tard par une autre fonctionnalité ou une intégration managée |

| D35 | Template de plan **versionné et immuable une fois publié** | un cursus publié est opposable : une évolution pédagogique crée une nouvelle `version_number`, les plans déjà instanciés restent rattachés à leur version d'engagement |
| D36 | Piste connaissances/compétences **dérivée** de `outcomes.nature`, aucune colonne `track` | une colonne dupliquée finirait par contredire la nature de l'acquis ; la vérité reste unique |
| D37 | `acquisition_plan_items` unique source des vues Liste/Kanban/Gantt/Calendrier | une table par vue dupliquerait la vérité et divergerait ; ajouter une vue n'ajoute aucune table |
| D38 | `progress_state` (dont `done`) est un état de **planification**, jamais d'acquisition | la maîtrise reste dérivée des preuves ; `done` sur un plan ne prouve rien |
| D39 | Deux colonnes distinctes : dates officielles (institution) et `learner_target_at` (apprenant) | l'apprenant organise son rythme sans jamais déplacer une échéance opposable ; bornage par trigger |
| D40 | `change_impact` et `required_approver_role` **dérivés par trigger**, non accordés au client | sinon un apprenant requalifierait une échéance officielle en simple ajustement personnel |
| D41 | Auto-acceptation d'un changement strictement personnel dans la fenêtre officielle | une validation humaine pour un ajustement sans impact institutionnel n'a aucune valeur, et sature les enseignants |
| D42 | Une demande portant sur un élément **rattaché à un stage** exige l'encadrant **de ce stage** | cohérence avec la règle de validation des compétences réelles : un enseignant ne se substitue pas à l'encadrant du terrain |
| D43 | `plan_change_decisions` append-only, application atomique par trigger `AFTER INSERT` | la décision et son effet sur le plan ne peuvent pas diverger ; une erreur se corrige par une nouvelle ligne |
| D44 | ~~Drapeau transactionnel `app.plan_change_applying`~~ **abandonné** (voir D47) | un custom GUC est positionnable par n'importe quel rôle SQL : il ne peut jamais valoir autorisation |
| D45 | `passport_share_preferences` exclues de **toute** condition de policy | des préférences de confort ne doivent jamais pouvoir masquer un dossier institutionnel à un professionnel autorisé |
| D46 | Aucune contrainte déclarative anti-cycle sur les prérequis de template | non exprimable en SQL déclaratif : vérifié par le backend à la publication, en même temps que le figeage |
| D47 | Chemin d'écriture interne reconnu par le contexte effectif `current_user = 'postgres'`, et non par un drapeau | non falsifiable : `authenticated` et `service_role` ne peuvent pas atteindre ce contexte, et les fonctions concernées ont EXECUTE révoqué pour tous les rôles |
| D48 | `learner_target_at` et `learner_pace` retirés du GRANT UPDATE client | un UPDATE direct contournerait le workflow : plus de justification, plus d'impact dérivé, plus d'audit. Le seul GRANT client restant sur un item est `progress_state` |
| D49 | Rythme stocké en `jsonb` borné (`learner_pace`, clés listées) plutôt qu'en colonnes typées | le vocabulaire pédagogique du rythme n'est pas stabilisé ; bornage par CHECK de type, de taille et de clés, typage possible au Lot 2 |
| D50 | Acquis `real_competence` **sans stage assigné** : `teacher_or_admin` statue provisoirement sur le calendrier | sinon la demande serait indécidable ; la décision ne vaut jamais acquisition, et l'encadrant exact redevient obligatoire dès qu'un stage est rattaché |
| D52 | Le test `current_user = 'postgres'` est évalué **en ligne** dans les triggers ; aucun helper SQL dédié | un appel imbriqué depuis un trigger SECURITY INVOKER exige EXECUTE pour le rôle appelant et pourrait échouer en `permission denied`, bloquant des écritures légitimes (progress_state, draft→pending). Aucune fonction du plan n'est donc exécutable par un client, sans exception |
| D51 | Une décision erronée se corrige par une **nouvelle demande** liée et auditée | la demande décidée n'est plus `pending` et le journal est append-only : une seconde décision sur la même demande est refusée par construction |

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
| Écriture des métadonnées d'asset par le staff via la Data API | le client choisirait le chemin, le bucket et le checksum, et pourrait publier un fichier non scanné |
| Provenance protégée par les seuls `with check` de policy | ne couvre ni l'UPDATE ni `service_role` ; remplacé par le trigger D30 |
| `updated_at` accordé au client en GRANT de colonne | horodatage falsifiable ; remplacé par le trigger D33 |
| Colonne `track` sur les items de plan | deuxième vérité face à `outcomes.nature`, divergence garantie |
| Table par vue (`plan_kanban_cards`, `plan_gantt_bars`, …) | duplication de la vérité et coût de synchronisation, pour zéro gain |
| Colonne `mastery` ou `progress_percent` sur le plan | contredirait la dérivation par les preuves, cœur du modèle |
| `status` de demande librement écrit par le client | un apprenant s'auto-approuverait ; borné par trigger |
| RPC `submit_plan_change_request()` exposée à `authenticated` | même refus que D23 : surface d'écriture privilégiée appelable hors contexte |
| Préférences de partage utilisées dans les `using` de policy | masquerait un dossier institutionnel à un encadrant ou un enseignant responsable |
| `revoke all on all tables in schema public from anon` | portée non maîtrisée sur les objets futurs du schéma ; remplacé par D34 |

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
13. **Rythme** : clés tranchées (`cadence`, `sessions_per_week`,
    `minutes_per_session`, `preferred_days`, `note`, cf. D49) ; reste à décider si elles
    deviennent des colonnes typées au Lot 2.
14. **Plan multiple** : un apprenant peut-il détenir deux plans actifs (ex. remédiation) ?
    Aujourd'hui l'index partiel `ap_one_active_per_enrollment` l'interdit.
15. **Recalcul après nouvelle version de template** : migration des plans en cours,
    opt-in ou obligatoire ?
16. **Export personnel** : format et rétention des exports générés depuis les préférences
    de partage (aucun mécanisme d'export n'est conçu dans ce lot).

## D77 — Un programme de DPC est une CONFIGURATION, pas une application séparée
Le programme d'exemple `DPC-FA` réutilise Program / CurriculumVersion / Cohort /
Enrollment / RoleAssignment / Outcome sans branche fonctionnelle dédiée. Les
modules `auditsEnabled`, `prePostTestsEnabled` et `sessionsEnabled` sont des
drapeaux optionnels de `ProgramConfig` ; désactivés, ils n'affichent rien et ne
chargent aucun dépôt.

## D78 — Audit de pratique : dossiers anonymes, aucune donnée patient
Une soumission d'audit ne porte qu'une `recordRef` (référence interne du
praticien) et des réponses codées à la grille. Aucun identifiant, aucune donnée
clinique nominative n'est saisie ni stockée. Hypothèse fonctionnelle retenue
pour cette itération.

## D79 — Un audit ne vaut jamais acquisition d'une compétence réelle
Le score de conformité (avant / après) est une preuve de pratique. La validation
humaine par un tiers reste obligatoire pour toute compétence en situation réelle,
y compris en DPC (`auditRequiresHumanValidation()`).

## D80 (2026-08-19) — Nom global et sous-titre officiels de la plateforme
Le **nom global** de la plateforme devient exactement **« Campus Santé Augmenté »**
avec le **sous-titre** **« Formation, compétences et développement professionnel »**.
La fonctionnalité longitudinale conserve son nom **« Mon passeport de compétences »**.
Les anciens noms (« Mon Passeport Éducatif », « Passeport Éducatif Médical »,
« EduPassport Core ») deviennent historiques. Aucun identifiant technique
(table, type, colonne, fonction, policy, route, slug) n'est renommé.

## D81 (2026-08-19) — Person, UserAccount, Cohort et Enrollment sont quatre objets distincts
L'annuaire (`src/domain/directory.ts`) sépare définitivement l'identité pédagogique
(`Person`), le compte de connexion (`UserAccount` : e-mail normalisé + statut
`invited` / `active` / `suspended`), la promotion (`Cohort` avec cycle de vie
`active` / `archived`) et l'inscription (`Enrollment` : une personne, un programme,
une cohorte, un statut). Les rôles restent contextualisés (`RoleAssignment`), sans
duplication de modèle.

Règles retenues :
- l'e-mail normalisé est la clé d'unicité de la plateforme ; une personne connue est
  RATTACHÉE, jamais dupliquée ;
- une même personne peut être inscrite dans plusieurs programmes ;
- une seconde inscription ACTIVE dans le même programme et la même cohorte est refusée ;
- un retrait passe l'inscription à `withdrawn` sans jamais supprimer la personne,
  son compte, ses rôles ni son historique ;
- une cohorte archivée reste consultable et n'accepte plus d'inscription.

Transition : la couche annuaire cohabite avec les fixtures existantes
(`directoryFixtures.ts` en dérive prénom/nom et comptes) ; aucune migration brutale
n'est effectuée. Le filtrage de périmètre est fait côté client dans la maquette et
DEVRA être imposé côté serveur (requêtes filtrées + RLS) dans le produit réel :
`listPeople()` et `listAllRoleAssignments()` ne sont pas utilisés par le nouvel écran.

## D82 — Un DPC est IMPLÉMENTÉ, pas simplement « créé »

Le vocabulaire « création d'un programme DPC » est remplacé par
« implémentation d'un DPC » : l'acte du coordinateur n'est pas de définir un
concept abstrait, mais de retenir des composants et de les DATER précisément.

Règles retenues (`src/domain/dpcImplementation.ts`, maquette) :
- **aucun composant n'est obligatoire** : un DPC peut comporter, ou non, un
  audit de pratiques avant et/ou après, un pré-test, un post-test, une ou
  plusieurs séquences de formation, ou d'autres activités ;
- la formation existe en trois modalités : **présentiel** (lieu, date et heure
  précises), **visioconférence** (date et heure précises, modalités de
  connexion) et **e-formation** (fenêtre d'ouverture / fermeture et documents à
  consulter en ligne) ;
- deux modes de datation : **séance synchrone** (début / fin horodatés) ou
  **fenêtre asynchrone** (ouverture / fermeture) ; le mode attendu est déduit de
  la nature du composant et de la modalité, pas choisi librement ;
- la chronologie est validée de façon **déterministe** (pré-test avant la
  formation, post-test après, tours d'audit ordonnés) : aucune IA, aucune
  inférence ;
- l'assistant compte désormais **six étapes** et la checklist de publication un
  onzième point bloquant, « Calendrier d'implémentation exploitable » : au moins
  un composant programmé et aucune erreur chronologique.

Portée : maquette locale uniquement. Les créneaux ne déclenchent aucun envoi,
aucune invitation, aucune visioconférence réelle ; leur persistance SQL
(tables de composants et de créneaux, RLS par programme) reste à concevoir.

## D83 (2026-08-20) — Un noyau transversal, livré par tranches verticales

Le DIU, le DFASM, le DPC et les futurs cursus partagent les domaines identité,
autorisation, programme versionné, implémentation, cohorte, inscription, contenu,
activité, preuve, progression, communication et gouvernance. Une particularité
de cursus est un module configuré ; elle ne crée ni application ni base séparée.

La transformation de la maquette s'effectue par tranches verticales réelles,
jamais par bascule globale des fixtures. La première tranche est le parcours DIU
du dépôt d'un PPTX sonorisé jusqu'à sa lecture sécurisée et sa preuve de
consultation. Voir `docs/architecture/product_target.md`.

## D84 (2026-08-20) — Supabase indépendant de Lovable

Le projet Supabase est créé et détenu par l'organisation porteuse du produit,
indépendamment de Lovable. GitHub est la source de vérité du code et des
migrations. Lovable est un frontend remplaçable et ne détient ni secret serveur
ni donnée privilégiée. Les traitements longs de conversion, transcription et IA
sont exécutés par des workers indépendants derrière des contrats applicatifs.

## D85 (2026-08-20) — Le PPTX source est temporaire par défaut

Pour le pilote (fichiers usuels de 50 à 100 Mo), Supabase Storage privé est
retenu. Le source et les dérivés utilisent des buckets distincts. Après contrôle
humain du dérivé et expiration du délai de sécurité, le PPTX peut être supprimé
sans dépublier la version web. La proposition initiale est une purge à 30 jours,
sauf choix explicite « conserver la source ». Toute purge est idempotente et
journalisée ; une reconversion après purge exige un nouveau dépôt et crée une
nouvelle version. La durée définitive reste à valider avant activation.

## D86 (2026-08-21) — Premier environnement Supabase de développement provisionné

Le projet indépendant `campus-sante-augmente-dev` (référence
`wbmkazfideylaixjkzyn`, région West EU/Ireland) est lié au dépôt GitHub
`Stelafitte/medical-progress`. Les trois migrations initiales du noyau global,
des ressources/PPTX et de la RLS/Storage ont été appliquées manuellement après
un dry-run. L'historique local/distant est aligné et `supabase db lint --linked
--level warning` ne signale aucune erreur de schéma.

Le déploiement automatique GitHub vers la base principale reste désactivé. Le
frontend utilise encore les repositories mock ; aucun upload, worker, secret
client ou donnée métier réelle n'est raccordé à ce stade.

## D87 (2026-08-21) — Client Supabase installé, bascule explicite uniquement

Le client officiel `@supabase/supabase-js` est installé et sa configuration
publique est isolée dans `src/infrastructure/supabase/`. Le backend de données
reste `mock` par défaut ; le choix `supabase` exige explicitement
`VITE_DATA_BACKEND=supabase` ainsi qu'une URL et une clé publique valides.
Aucune clé `service_role` n'est référencée par le code navigateur.

Le nom courant `VITE_SUPABASE_PUBLISHABLE_KEY` est préféré ; le nom historique
`VITE_SUPABASE_ANON_KEY` reste accepté pour les environnements existants.

Une quatrième migration additive aligne `programs` sur le contrat TypeScript
(effectif estimé, simulation, pré/post-tests, séances et niveau cible). Elle a
été appliquée sur l'environnement de développement, puis contrôlée par le lint
PostgreSQL sans erreur. Aucun écran n'est encore basculé vers les données réelles.

## D88 (2026-08-21) — Première tranche de lecture frontend Supabase

La bascule explicite `VITE_DATA_BACKEND=supabase` active désormais Supabase Auth
et les repositories de lecture du noyau d'identité : programmes accessibles,
profil de l'utilisateur courant, inscriptions et rôles actifs. Le mode `mock`
reste le défaut et conserve la session de démonstration.

Les repositories non encore migrés sont temporairement délégués au mock et ne
doivent pas être présentés comme persistants. Le mapping des portées de rôles
est strict : une valeur inconnue ou une forme incohérente provoque un échec de
chargement plutôt qu'un élargissement implicite des droits.

## D89 (2026-08-22) — Personne sans compte : espace de pré-inscription, pas de refonte de l'identité

Question ouverte du `backend_gap_analysis.md` : une personne peut-elle exister
sans compte de connexion ? Réponse retenue : **oui**, via une table `people`
strictement limitée aux personnes pas encore activées (intervenant externe,
apprenant importé avant sa première connexion). Elle ne remplace ni ne modifie
`profiles`, `enrollments`, `role_assignments` ou `audit_events`.

Constat qui a orienté la conception : `is_platform_admin()`,
`can_administer_program()`, `is_program_staff()`, `is_enrolled_in_program()` et
`can_read_profile()`, ainsi que TOUTES les policies RLS déjà appliquées,
supposent `person_id = auth.uid()`. Découpler entièrement l'identité de
l'authentification (un `people.id` distinct de `auth.uid()` partout) obligerait
à réécrire ces cinq fonctions et l'ensemble des policies existantes — un
changement bien plus large que la question posée, et exactement le genre de
modification structurelle de l'authentification qui ne doit pas être fait sans
validation explicite.

Option retenue pour l'instant (la plus étroite qui répond à la question) :
`people` est un sas de pré-inscription, pas une nouvelle source de vérité pour
l'identité active. Une personne y existe le temps d'être invitée ; dès qu'elle
se connecte réellement via Supabase Auth, le déclencheur `handle_new_auth_user`
existant crée sa ligne `profiles` comme aujourd'hui, sans aucun changement de
RLS. Le rattachement `people` → `profiles` (`activated_profile_id`) sert
uniquement à la continuité administrative (historique, traçabilité de
l'invitation), jamais de base à une décision d'accès.

Brouillon SQL correspondant : `docs/database/draft/004_people_pre_account.sql`.
Non appliqué. Reste à concevoir avant toute application : le mécanisme de
rattachement automatique `people` → `profiles` lors de la première connexion
réelle (déclencheur ou tâche serveur), et la décision de repointer plus tard
`enrollments`/`role_assignments` vers une identité pleinement découplée de
`auth.uid()` (option plus large, délibérément écartée ici) si le produit en a
un jour vraiment besoin.

## D90 (2026-08-22) — Une cohorte appartient à une seule implémentation de programme

Décision validée par Stef : pour le pilote, une cohorte (une promotion) est
rattachée à une seule implémentation de programme. Des sous-groupes internes à
une cohorte restent possibles plus tard si un besoin réel apparaît, sans
remettre en cause ce principe. Referme le point ouvert correspondant de
`docs/architecture/backend_gap_analysis.md`.

## D91 (2026-08-22) — Rétention du PPTX source : 30 jours après validation

Décision validée par Stef, conforme à la proposition initiale de D85 : le
fichier PPTX original est purgé automatiquement 30 jours après validation
humaine du dérivé sonorisé, sauf choix explicite de le conserver. Le PPTX
source n'est jamais nécessaire à la lecture. Referme le point ouvert
correspondant de D85 et de `backend_gap_analysis.md`.

## D92 (2026-08-22) — Objectifs de sauvegarde Supabase : RPO 24h / RTO 24h, à réévaluer avant vrais apprenants

Décision validée par Stef : objectif de continuité fixé à 24h de perte de
données maximum tolérée (RPO) et 24h pour restaurer (RTO). Repère posé
maintenant, en développement, sans activation réelle des procédures tant
qu'aucun vrai apprenant n'est inscrit. À revoir explicitement avant l'ouverture
de la plateforme à une première cohorte réelle (Phase 6, supervision et
continuité, mais le repère est utile dès la conception de Phase 1).

## D93 (2026-08-22) — Définition d'une « consultation achevée » du DIU : ≥90% des diapositives, dans l'ordre

Décision validée par Stef : un module (diaporama sonorisé) est considéré
comme achevé lorsque l'apprenant a vu au moins 90% des diapositives, dans
l'ordre, avec une durée minimale plausible pour empêcher un simple défilement
sans écoute. Cette règle reste à affiner avec l'équipe pédagogique avant son
implémentation en Phase 2 (elle conditionnera plus tard les attestations).
Referme le point ouvert correspondant de `backend_gap_analysis.md`.
