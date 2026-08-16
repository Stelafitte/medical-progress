# Passeport Éducatif Médical — socle (itération 1)

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
- `src/application/ports.ts` : contrats d'accès aux données + `LegacyMigrationAdapter`.
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
| `/`                      | Accueil sobre « Passeport Éducatif Médical »                           |
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
- Aucune authentification réelle : la session est simulée en mémoire.
- **Aucun appel IA réel.** Le calcul de progression est déterministe.
- Aucune écriture : les repositories mock sont en lecture seule, rien n'est persisté.
- Aucun secret côté frontend, aucun appel réseau sortant.
- Aucun compte étudiant payant, aucun déploiement, aucune publication.
- Le moteur ECOS n'est pas implémenté : la simulation n'existe que comme nature d'acquis
  et type de preuve.

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

`src/domain/__tests__/mastery.test.ts` couvre les invariants critiques (auto-déclaration,
validation par un tiers, progression). Le lanceur (`vitest`) sera ajouté avec l'itération
suivante ; la structure et les tests sont déjà en place.
