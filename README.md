# Mon Passeport Éducatif — socle (itération 1)

Projet **indépendant**. Aucun code, table ou API d'un projet existant (notamment
`dfasm-learnhub`) n'est utilisé, remixé ni modifié.

Objectif de cette itération : un **moteur commun configurable par programme**, destiné
initialement au DIU d'Échocardiographie (~400 apprenants/an) et au DFASM Cardiologie
(~100 étudiants/an). Jamais deux applications ni deux branches de code.

## Architecture

Monolithe modulaire React + TypeScript strict + Tailwind + shadcn/ui, avec des couches
séparées :

```text
src/domain/              Modèle métier et règles pures (aucune dépendance framework)
src/application/         Ports (repositories) + session simulée / injection données
src/infrastructure/mock/ Données de démonstration et repositories mock
src/features/            Vues et logique applicative par domaine fonctionnel
                         (dashboard, passport, stage, resources, administration, architecture)
src/components/layout/   Shell commun (en-tête, navigation, sélecteur de programme)
src/components/          UI réutilisable (badges, titres de section, shadcn/ui)
src/routes/              Pages fines (TanStack Router) déléguant à src/features
```

- `src/domain/types.ts` : Program, CurriculumVersion, Cohort, Enrollment, RoleAssignment,
  Outcome, OutcomeRelation, Placement, PlacementAssignment, Evidence, EvidenceValidation,
  LearningResource, AuditEvent, Person.
- `src/domain/mastery.ts` : calcul déterministe des niveaux de maîtrise.
- `src/domain/roles.ts` : rôles contextualisés (plateforme / programme / cohorte / stage).
- `src/application/ports/repositories.ts` : contrats d'accès aux données + `LegacyMigrationAdapter`.
- `src/infrastructure/mock/` : données de démonstration, en mémoire, sans persistance.

### Invariants métier

- Trois natures d'acquis distinctes : **connaissance**, **compétence simulée**,
  **compétence réelle**.
- Cinq types de preuves : QCM, activité réelle, simulation/ECOS, stage, validation humaine.
- **Une compétence réelle ne peut jamais être acquise par auto-déclaration** : elle exige
  un contexte authentique et la validation d'un tiers (encadrant, enseignant, administrateur).
- Les rôles (apprenant, encadrant de stage, enseignant, administrateur) sont **contextualisés**
  par plateforme / programme / cohorte / stage via `RoleAssignment.scope`.
- Toute entité porte un champ `Provenance` : les données historiques importées plus tard
  conserveront leur système et identifiant source.

## Interface

| Route                    | Contenu                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| `/`                      | Accueil sobre « Mon Passeport Éducatif »                           |
| `/espace`                | Shell authentifié **simulé** + sélecteur de programme, tableau de bord |
| `/espace/passeport`      | Preuves et niveaux de maîtrise (données factices)                      |
| `/espace/stage`          | Affectations de stage, encadrants, preuves de terrain (simulé)          |
| `/espace/ressources`     | Catalogue de ressources rattachées aux acquis (simulé)                 |
| `/espace/administration` | Programmes, référentiels et cohortes (lecture seule)                   |
| `/espace/architecture`   | État du socle — **visible en développement uniquement**                |

Le tableau de bord apprenant est structuré en : Aujourd'hui, Cette semaine, Jalons,
Progression, Stage. La page Architecture affiche des badges **En place / Simulé / Prévu**
pour chaque module ; aucune action non implémentée n'est présentée comme fonctionnelle.

## Scripts

```bash
bun run dev        # serveur de développement
bun run typecheck  # TypeScript strict, sans émission
bun run test       # tests unitaires (vitest)
bun run lint       # eslint + prettier
```

## Limites explicites de cette itération

- **Aucune base de données activée, aucune migration créée.** Le schéma sera validé
  séparément avant provisioning.
- Aucune authentification réelle : la session est simulée en mémoire. Seuls le profil de
  démonstration et le programme sélectionné sont conservés dans `sessionStorage`
  (`src/application/sessionPersistence.ts`), avec une action explicite de retour au profil
  par défaut.
- **Aucun appel IA réel.** Le calcul de progression est déterministe.
- Aucune écriture : les repositories mock sont en lecture seule, rien n'est persisté.
- Aucun secret côté frontend, aucun appel réseau sortant.
- Aucun compte étudiant payant, aucun déploiement, aucune publication.
- **Médiathèque pédagogique = maquette** : métadonnées seules, aucun fichier transmis,
  « Stockage non activé dans cette maquette ». Ajout, versionnage, publication et
  archivage sont simulés localement.
- **PowerPoint sonorisés = maquette de conversion** : le dépôt d'un PPTX, le pré-contrôle,
  la file de conversion, le journal des étapes et la validation pédagogique sont simulés.
  Aucun fichier n'est ouvert, converti, stocké ni transmis. Le format cible distribué aux
  apprenants est un **lecteur web HTML5 synchronisé** (diapositives, audio, sommaire,
  transcription) ; le PPTX source n'est jamais exposé côté apprenant. Pipeline documenté
  dans `docs/database/draft/narrated_pptx_conversion.md`.
- **Exploitation IA des contenus = maquette intégrale.** Chaque support publié possède un
  profil IA (`ContentAiProfile`) : contenu extrait attendu par format, références citables
  (page PDF, diapositive, chapitre/timestamp, ancre HTML, question de QCM, étape de cas),
  statuts (`awaiting_extraction` → `ready`), files « à traiter / à relire / prêts /
  obsolètes » et indicateur « Couverture IA des contenus publiés » dans
  Administration → Médiathèque → Exploitation IA. Côté apprenant, « Étudier avec l'IA »
  propose questions, interrogation, QCM, cas clinique guidé, révision adaptative et un
  mode vocal **simulé** (aucun microphone, aucune session temps réel). Aucun index, aucun
  découpage, aucun appel IA réel : pipeline et routeur de coûts documentés dans
  `docs/database/draft/content_ai_pipeline.md`.
- **Pages web HTML** : une page déclarée n'est jamais relue librement par l'IA. Seul un
  instantané extrait, nettoyé (navigation/publicité), structuré, versionné puis validé
  alimente le corpus ; un changement distant affiche « actualisation à contrôler » sans
  jamais écraser la version validée. Un **lien externe simple** reste hors corpus IA sans
  décision explicite (page web HTML, document déposé, ou non publié).
- **Évaluations et ECOS = maquette documentaire** : inventaire de migration, workflow
  sélectif et fiches de scénarios. Le moteur ECOS, le temps réel, les voix et les avatars
  ne sont pas implémentés ; aucun import réel n'est possible.
- Une performance ECOS n'alimente qu'une **compétence simulée** : une compétence réelle
  exige toujours une validation humaine.

## Portabilité smartphone

Recette effectuée aux largeurs **360, 390, 768 et 1280 px** sur les parcours apprenant
DIU, apprenant DFASM, responsable de stage et administration du programme : aucun
débordement horizontal (`scrollWidth` contrôlé) et aucune erreur console. Points mis en
place : menu latéral explicite avec sélecteur de programme, sélecteur de programme
compact dès 360 px, cibles tactiles d'au moins 44 px, tableaux denses basculant en cartes
sur mobile, actions principales empilées et pleine largeur.


## Dossier de conception base de données (non exécuté)

`docs/database/draft/` contient la **conception versionnée** du schéma PostgreSQL et de
la matrice RLS du Lot 1. Ce dossier est de la **conception non exécutée** : aucune base
n'est activée, aucun fichier n'existe dans `supabase/migrations/`, aucun SQL n'a été joué.

| Fichier | Contenu |
| ------- | ------- |
| `001_core_schema.sql` | Enums, 28 tables (dont les 8 tables du plan d'acquisition et des préférences de partage), FK composites, FK composites, contraintes, index, commentaires, GRANT (dont GRANT de colonnes ; jamais `anon`) |
| `002_rls_policies.sql` | RLS sur toutes les tables, helpers d'autorisation à portées exactes, policies séparées par opération |
| `003_server_invariants.sql` | Triggers serveur : dérivation de `evidence.status`, immutabilité d'identité, provenance legacy immuable (23 tables), `updated_at` imposé (20 tables), immuabilité des templates publiés, dérivation de l'impact d'une demande, transitions de demande, application atomique d'une décision |
| `rls_matrix.md` | Matrice table × opération × rôle avec conditions d'appartenance et de portée |
| `grant_policy_checklist.md` | Checklist statique GRANT ↔ POLICY et inventaire des fonctions `SECURITY DEFINER` |
| `architecture.md` | ER Mermaid, normalisation, portées d'autorisation, flux, import legacy, rollback, limites |
| `plan_acquisition_architecture.md` | Plan d'acquisition : template versionné → plan individuel → demande → décision, Liste/Kanban/Gantt/Calendrier comme projections d'une source unique, dates officielles vs cible personnelle, mapping frontend ↔ SQL |
| `storage_architecture.md` | Hébergement des contenus : buckets privés UE, URL signées courtes, métadonnées en base |
| `legacy_ecos_integration.md` | Inventaire des modules ECOS historiques, décisions conserver/adapter/remplacer, frontières d'adaptation, provenance legacy, règle de preuve simulée |
| `tests/rls_acceptance.sql` | Plan de tests transactionnels futurs (`ROLLBACK` final), non exécuté |
| `decision_log.md` | Décisions, alternatives rejetées, questions à valider avant provisioning |

Points structurants : la progression n'est jamais stockée (dérivée des preuves),
`evidence_validations` est append-only, `evidence.status = 'validated'` est inatteignable
depuis le client, aucun utilisateur ne peut s'accorder un rôle ni élargir sa portée, et
une portée cohorte ou stage n'est jamais promue en portée programme. Les fichiers
pédagogiques restent hors base : PostgreSQL ne porte que des métadonnées. Côté plan
d'acquisition : un template publié est immuable (nouvelle version obligatoire),
`acquisition_plan_items.progress_state` décrit une action planifiée et jamais une
acquisition, l'impact d'une demande et le rôle décideur sont dérivés côté serveur, le
journal des décisions est append-only, et les préférences de partage ne modifient
aucune policy RLS ni la visibilité institutionnelle.


## À prévoir après validation du schéma

- Provisioning de la base, RLS par programme/cohorte/stage, authentification.
- Quotas, journalisation et audit systématique pour tout futur endpoint IA
  (`AuditEvent` est déjà modélisé).
- Écriture des preuves et circuit de validation par les encadrants.

## Stratégie de réintégration sélective de l'historique

1. **Aucun couplage direct** aux tables ou APIs existantes : l'import se fait par lots,
   jamais par lecture croisée en production.
2. Pour chaque famille de données (utilisateurs, promotions, contenus, 57 compétences,
   états historiques, moteur ECOS), écrire un `LegacyMigrationAdapter<TLegacy, TTarget>`
   dédié qui produit des entités du domaine.
3. Chaque entité importée reçoit `provenance = { sourceSystem, sourceId, importedAt }` :
   la traçabilité de l'origine est obligatoire et non effaçable.
4. Les 57 compétences historiques sont rattachées aux `Outcome` du nouveau référentiel via
   `OutcomeRelation` de type `migrated_from` / `aligned_with`, sans écraser le nouveau modèle.
5. Les états historiques de progression sont importés comme `Evidence` avec leur type
   d'origine ; une compétence réelle importée sans validateur reste non acquise.
6. Import en environnement de recette d'abord, avec rapport de rejets, puis reprise ciblée.

## Tests

Le lanceur `vitest` est installé (`bun run test` / `bun run test:watch`).

- `src/domain/__tests__/mastery.test.ts` : une auto-déclaration seule ne compte jamais ; une
  activité réelle ou de stage saisie par l'apprenant compte après validation explicite d'un tiers
  autorisé ; progression dérivée des preuves.
- `src/domain/__tests__/roles.test.ts` : portée des rôles (plateforme, programme, cohorte, stage)
  et cohérence rôle/portée (`isRoleScopeConsistent`).
- `src/infrastructure/mock/__tests__/progression.test.ts` : progression calculée depuis les
  fixtures mock, aucune valeur codée en dur.
