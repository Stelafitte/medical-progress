# Préparation de l'intégration sélective du moteur ECOS historique (DRAFT)

Statut : **conception non exécutée**. Aucun couplage runtime, aucun import réel, aucun
appel IA, aucun secret, aucune table ni fonction du projet source n'est copiée
automatiquement dans ce socle.

- Système source : `dfasm-learnhub`
- Projet source constaté : `e3860f5b-091d-4d36-ae37-c2899be8ecdd` (jamais modifié)
- Écran de travail : Administration du programme → Configuration pédagogique →
  onglet « Évaluations et ECOS » (maquette, `src/features/administration/EcosMigrationSection.tsx`)
- Domaine déclaratif : `src/domain/ecosMigration.ts`, inventaire mock dans
  `src/infrastructure/mock/ecosFixtures.ts`

## 1. Inventaire des modules constatés

| Catégorie | Modules source |
| --------- | -------------- |
| Écrans | `EcosAdminList`, `EcosAdminEditor`, `EcosList`, `EcosPreview`, `EcosSession` |
| Domaine | `ecosScenario`, `ecosCaseConfig`, `ecosLifecycle`, `ecosUi`, `ecosVoices`, `ecosAvatars`, `ecosRealtimePricing` |
| Composants | timer, controls, patient avatar, score ring, debrief speaker, assets/usage |
| Fonctions | `ecos-config-check`, `ecos-realtime-session`, `ecos-end-session`, `ecos-debrief`, scoring |

Chaque ligne de l'inventaire porte : module source, décision
(**conserver / adapter / remplacer**), destination dans ce socle, statut
(inventorié, mappé, adapté, testé, bloqué) et une note d'arbitrage.

## 2. Frontières d'adaptation

- **Conserver** : structure de scénario, grille de notation pondérée, minuterie,
  écrans de session et de débriefing (valeur pédagogique éprouvée).
- **Adapter** : configuration de cas et cycle de vie, alignés sur
  `Program` / `CurriculumVersion` / `Outcome` du nouveau modèle ; rôles
  contextualisés à la place du modèle global historique ; production de preuves
  via `Evidence` / `EvidenceValidation`.
- **Remplacer** : endpoints temps réel historiques (`chat-gpt`,
  `realtime-token`), comptabilité de coût, gestion des clés. Tout appel futur
  passera par le gateway propriétaire de la plateforme avec authentification,
  quotas, journalisation et comptabilité par appel — jamais par un compte
  étudiant.
- **Hors périmètre de ce lot** : moteur temps réel, voix, avatars binaires,
  stockage des assets (buckets non activés).

## 3. Workflow de migration sélective

`Inventorier → Mapper référentiels/compétences → Adapter → Tester → Importer`

Les trois dernières étapes sont volontairement non réalisées : la maquette ne
propose aucun bouton d'import réel. L'import se fera plus tard par lots tracés,
en recette d'abord, avec rapport de rejets.

## 4. Provenance legacy

Toute entité issue de l'historique portera
`provenance = { sourceSystem: 'dfasm-learnhub', sourceId, importedAt }`,
immuable côté serveur (voir `003_server_invariants.sql`,
`enforce_source_provenance()`). Les scénarios importés sont rattachés aux
`Outcome` du référentiel cible via `OutcomeRelation`
(`migrated_from` / `aligned_with`), sans écraser le nouveau modèle.

## 5. Règle non négociable de production de preuve

Une performance ECOS produit une preuve de **compétence simulée** :

```
evidenceKind: 'simulation'
outcomeNature: 'simulated_competence'
status: 'submitted'          -- jamais 'validated' depuis le client
selfDeclared: false
```

Une **compétence réelle** ne peut jamais être déclarée acquise à partir d'un
ECOS sans `EvidenceValidation` humaine par un encadrant ou un enseignant
habilité dans le programme. Cette règle est verrouillée par les tests
`src/domain/__tests__/ecosMigration.test.ts`.

## 6. Points à valider avant provisioning

- Tables cibles des scénarios, grilles et sessions (candidat : extension du
  Lot 1 avec `ecos_scenarios`, `ecos_scenario_criteria`, `ecos_sessions`), avec
  GRANT de colonnes et RLS par programme/cohorte.
- Politique de conservation des transcriptions de session (aucune donnée
  patient, aucun contenu nominatif).
- Modèle de coût et plafonds par cohorte avant toute activation temps réel.
