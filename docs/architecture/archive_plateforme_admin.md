# Archive complète — Campus Santé Augmenté (« Mon Passeport Éducatif »)

Document d'archive rédigé à la demande du porteur du projet. Il consigne :
1. les consignes et explications métier données par le porteur, module par module ;
2. la plateforme telle qu'elle existe aujourd'hui (maquette front, aucune écriture serveur) ;
3. la totalité des fonctionnalités côté administration mises en place ;
4. l'historique des changements, les décisions et ce qui reste à faire.

Statut global : maquette front-end complète, déterministe, non publiée. Aucun appel IA réel,
aucune base de données activée. 600 tests unitaires au vert, typage strict sans erreur.

---

## 1. Consignes fondatrices données par le porteur

### 1.1 Positionnement
- Projet **neuf et indépendant**, nommé initialement « Passeport Éducatif Médical Core ».
- Interdiction absolue de remixer, cloner ou modifier `dfasm-learnhub` (production existante).
- Le projet reste **privé et non publié** jusqu'à recette explicite.
- Identité produit finale : **Campus Santé Augmenté** — « Formation, compétences et développement
  professionnel ». L'espace apprenant s'appelle **« Mon Passeport Éducatif »**.

### 1.2 Produit
- Une **seule plateforme multi-programmes configurable**, jamais deux architectures parallèles.
- Programmes initiaux : **DIU d'Échocardiographie** (~400 apprenants/an) et
  **DFASM Cardiologie** (~100 étudiants/an). Un troisième programme **DPC « HVG–Amylose »** a été
  maquetté puis **gelé** sur consigne, au profit des deux priorités DIU puis DFASM.

### 1.3 Architecture imposée
- Monolithe **modulaire** React + TypeScript strict + Tailwind + shadcn/ui.
- Séparation stricte des couches : `src/domain` (métier pur) → `src/application`
  (ports, orchestration, stores) → `src/infrastructure` (mock, Supabase) → `src/features` + `src/routes` (UI).
- Dépendances dirigées **vers le domaine**. Accès aux données uniquement via **interfaces de
  repository** (`src/application/ports/repositories.ts`).
- Supabase est la cible d'infrastructure, mais **le schéma doit être validé avant activation**.
- Réintégration ultérieure du legacy par **adapters et migrations traçables**.
- Pas de microservices, pas de sur-ingénierie.

### 1.4 Cœur métier
Entités : `Program`, `CurriculumVersion`, `Cohort`, `Enrollment`, `RoleAssignment`, `Outcome`,
`OutcomeRelation`, `Placement`, `PlacementAssignment`, `Evidence`, `EvidenceValidation`,
`LearningResource`, `AuditEvent`.

Règles métier explicitées par le porteur :
- **La progression est dérivée de preuves**, jamais saisie directement.
- Une preuve peut venir d'un QCM, d'une activité réelle, d'un stage, d'une simulation/ECOS ou
  d'une validation humaine.
- Distinguer **connaissance**, **compétence simulée** et **compétence réelle**.
- **Une compétence réelle ne peut jamais être déclarée acquise par l'apprenant seul** : validation
  tierce obligatoire (encadrant ou enseignant).

### 1.5 Rôles et sécurité
- Rôles **contextualisés** (jamais globaux) : apprenant, encadrant de stage, enseignant,
  administrateur. Portée obligatoire : programme, promotion ou terrain de stage.
- Aucun secret côté frontend. À terme : RLS testée, stockage privé, audit, quotas, journalisation
  et **comptabilité de tout appel IA**.
- Aucun compte étudiant OpenAI payant : tous les appels passent par l'API propriétaire.

### 1.6 IA
- OpenAI est la pile privilégiée ; **Realtime prioritaire pour le vocal DFASM**, optionnel DIU.
- **Aucun appel IA réel** tant que gateway, authentification, quotas et mesure de coût ne sont pas
  en place. Tout ce qui est IA dans la maquette est explicitement marqué comme simulé.

### 1.7 Réintégration sélective du legacy
- Candidats : utilisateurs/promotions nettoyés, contenus, 57 compétences, 6 612 états historiques,
  moteur ECOS OpenAI Realtime, éditeur ECOS, certains composants UI.
- **À ne pas reprendre** : ancien dashboard, ancienne progression binaire, faux moteur QCM,
  endpoints `chat-gpt` / `realtime-token` historiques, ancien modèle global de rôles.

### 1.8 Règle de livraison permanente
Toujours indiquer dans l'interface ce qui est **réel, mocké ou prévu** (badges « Simulé »,
`MockBadge`, `ScopeNotice`).

---

## 2. Explications de fonctionnement données module par module

### 2.1 Passeport de l'apprenant
- Titre imposé : **« Mon Passeport Éducatif »**.
- Organisation **par nature d'acquis** : Connaissances, Compétences simulées, Compétences réelles.
- Deux questions structurantes de la page : **« Qu'ai-je acquis ? »** et
  **« Que dois-je faire maintenant ? »**.
- Plan d'acquisition dérivé des preuves, consultable en Liste, Kanban, Calendrier et Gantt.
- L'apprenant ne voit jamais le PPTX source d'un support : uniquement le DTO de lecture.

### 2.2 Carnet de stage
- Module **configurable par programme** (activable/désactivable).
- Le carnet est un **élément de validation du stage** : s'il est prévu par le Concepteur, sa
  réception conditionne la validation finale.
- Le responsable de stage valide les compétences réelles ; l'apprenant ne peut pas s'auto-valider.

### 2.3 Navigation d'administration (structure imposée par le porteur)
Sept onglets pour un programme sélectionné : **Vue d'ensemble, Structure (Concepteur + Pilotage),
Classes, Connaissances, Compétences, Évaluations, Sécurité**, complétés par **Gestion des stages**
et **Documents et certificats**.

Comportement du sélecteur de programme (« switcher ») :
- Une entrée **« Tous les programmes »** en tête.
- En mode « Tous les programmes » : les onglets spécifiques à un programme sont **masqués**.
- Dès qu'un programme est choisi : les onglets d'administration apparaissent.

### 2.4 Concepteur vs Pilotage — la frontière fondamentale
- **Concepteur de programme** = le **modèle** (référentiel, ressources, planning type). Ce qu'on
  conçoit une fois.
- **Pilotage de programme** = l'**exploitation d'une promotion précise**. Un même programme est
  rejoué par plusieurs promotions, parallèles ou successives : le pilotage se lit **toujours
  promotion par promotion**.
- Le Concepteur suit un **bandeau gris en 4 étapes** :
  1. Concevoir le programme (analyse IA simulée, sélection des ressources) ;
  2. Préparer la promotion ;
  3. **Programmer le planning général** (dates de début/fin, planning des supports, stages,
     évaluations) ;
  4. **Piloter le programme** — étape débloquée **seulement** après validation du planning.
- Dans le Pilotage : **pas de boutons redondants en tête**, uniquement **quatre actions en
  accordéon replié par défaut** : Programmation, Activité, Gestion des apprenants, Documents.
- Consigne de forme : **aucune énumération alphabétique (a., b., c.) ni indentation** dans le
  Concepteur.

### 2.5 Modèle de flux linéaire imposé à chaque onglet
Chaque onglet d'administration suit le **même format** :
> liste de l'existant → création (import possible **au-dessus** du mode manuel) → paramètres et
> éléments de validation → suivi.

Corollaires exigés :
- **Un seul outil de création** par objet, **une seule liste** : ce qui est créé dans le Concepteur
  apparaît immédiatement dans l'onglet dédié, et inversement.
- **L'import est intégré dans la card de création**, jamais dans un bloc séparé.
- Le **suivi nominatif** (apprenant par apprenant) appartient au **Pilotage** et aux Classes,
  jamais au référentiel.

### 2.6 Évaluations (consigne détaillée)
- Supprimer les trois boutons non logiques.
- Afficher d'abord les **modalités d'évaluation existantes** du programme.
- Permettre la création d'une modalité avec : nom, date de création, date de mise à jour,
  **type** (présentiel ou en ligne), **sous-type** (présentiel : oral ou écrit ; en ligne : QCM,
  simulation, évaluation orale par IA…), **modalité d'usage** (auto-évaluation, examen de
  validation…).
- **Retirer le terme « ECOS »** de cette page.
- Conserver l'**importation des résultats externes**.
- Afficher les **résultats par cohorte**, réalisés et à venir.
- Les mêmes éléments doivent se retrouver dans la partie Évaluation du Pilotage.

### 2.7 Gestion des stages (consigne détaillée)
Reprendre le format des Évaluations :
- stages existants et leur **responsable** ;
- création d'un terrain avec ses éléments administratifs ;
- **éléments de validation** : certificat à envoyer au responsable de stage, carnet de stage ;
- **association** aux apprenants d'une cohorte (plusieurs cohortes possibles par programme) ;
- **suivi** des stages avec étapes reliées : validation des compétences, validation finale,
  réception du carnet si prévu dans le Concepteur.

### 2.8 Page « Tous les programmes »
- **Bandeau de filtres sticky et repliable** : filière FMI/FMC, états, dates.
- Bouton **« Catégories »** à **choix unique** : DFASM 1/2/3, Master, DIU, DPC…
- Chaque carte affiche filière et catégorie.

### 2.9 Communication
- Système **global et automatisé** : messages pré-programmés, sélection d'audience,
  **scan de détection de données patient** avant envoi.
- Intégré dans la section Notifications du Pilotage.

### 2.10 Apprenants et inscriptions
- Modèle **Directory** générique, import **CSV/TSV**, **archivage** (jamais de suppression sèche).
- Import/export de promotions.

### 2.11 Médiathèque, supports narrés et PPTX
- Médiathèque pédagogique côté administration.
- **Dépôt et conversion PPTX → HTML5 synchronisé** avec la narration, lecteur web dédié
  (`NarratedReaderView`), suivi de complétion.
- Extraction **OOXML locale via `fflate`**, sans dépendance à iSpring ; l'apprenant ne reçoit jamais
  le PPTX source.

### 2.12 IA de contenu et crédits
- Tuteur IA **citant systématiquement ses sources** (couverture 100 % des supports publiés).
- Module de **crédits IA** : quotas, comptabilité et journalisation de chaque appel (simulé).

### 2.13 DPC / ODP2C (gelé)
- Cycle : **Audit T0 → formation → audit T1 → attestation**.
- Séparation **programme de référence** (`dpcProgram.ts`) et **implémentation exploitée**
  (`dpcProgramImplementation.ts`) — décision D82.
- Assistant coordinateur « import-driven » : import Word/PDF → analyse automatique → vérification →
  programmation, action finale **« Ouvrir cette implémentation »**.
- **Blocage de publication** si validation médicale manquante ou si des données patient sont
  détectées.
- Module **gelé** sur consigne : priorité 1 DIU Échocardiographie, priorité 2 DFASM Cardiologie.

### 2.14 Portabilité et persistance
- Portabilité **smartphone dès 360 px**, cibles tactiles ≥ 44 px.
- Persistance de session en `sessionStorage` (identité simulée, programme actif).

---

## 3. La plateforme telle qu'elle existe aujourd'hui

### 3.1 Couches et arborescence
```
src/domain/          métier pur, testé, sans dépendance UI ni infrastructure
src/application/     ports de repository, session, stores de brouillon, plan d'acquisition
src/infrastructure/  mock/ (fixtures déterministes), supabase/ (adaptateur préparé, inactif)
src/features/        UI par espace : administration, passport, stage, supervision, resources…
src/routes/          routage TanStack Router (fichiers = URL)
docs/                architecture, base de données (draft), politiques
```

### 3.2 Espaces et routes principales
- **Accueil** `/`, **Architecture** `/espace/architecture`, **Audits** `/espace/audits`.
- **Apprenant** : `/espace` (tableau de bord), `/espace/passeport`, `/espace/stage`,
  `/espace/ressources`, `/espace/ressources/:id/lecture`, `/espace/profil`.
- **Responsable de stage** : `/espace/encadrement` + étudiants, compétences, carnets, cas, alertes,
  bilans, messages, profil.
- **Administration de programme** : `/espace/administration` et ses 10 onglets (voir §4) :
  Vue d'ensemble · Concepteur de programme · Pilotage de programme · Classes d'apprenants ·
  Base de connaissances · Compétences · Évaluations · Gestion des stages · Documents et certificats ·
  Administration et sécurité (`PROGRAM_ADMIN_NAV`, entrée DPC insérée seulement si `dpcEnabled`).
- **Direction plateforme** : `/espace/plateforme` (Vue d'ensemble), `/espace/plateforme/programmes`
  (Programmes agrégés), `/espace/plateforme/statistiques`, `/espace/plateforme/pilotage`
  (Pilotage et paramétrage) — `PLATFORM_ADMIN_NAV`, voir §4.18.
- **Tous les programmes** : `/espace/programmes`.

### 3.3 Domaine métier implémenté
`mastery.ts` (progression dérivée des preuves, validation tierce obligatoire pour une compétence
réelle), `roles.ts` (+ `isRoleScopeConsistent`), `access.ts` et `accessGrant.ts` (RBAC contextualisé),
`acquisitionPlan.ts`, `placementDraft.ts`, `competenceDraft.ts`, `knowledgeDraft.ts`,
`assessmentModality.ts`, `documentRequirement.ts`, `cohortDraft.ts`, `cohortRoster.ts`,
`directory.ts`, `stageLog.ts`, `supervision.ts`, `mediaLibrary.ts`, `pptxConversion.ts`,
`contentAi.ts`, `aiCredits.ts`, `communication.ts` / `communicationPlan.ts`, `statistics.ts`,
`clinicalAudit.ts`, `ecosMigration.ts`, famille `dpc*`.

### 3.4 Stores de session (maquette)
`placementDraftStore`, `competenceDraftStore`, `knowledgeDraftStore`, `assessmentModalityStore`,
`documentRequirementStore`, `cohortDraftStore`, `accessGrantStore`, `directoryStore`,
`communicationStore`. Règle commune : liste **unique** partagée entre Concepteur, onglet dédié,
Pilotage et espaces apprenant/encadrant ; rien n'est persisté côté serveur ; l'état disparaît au
rechargement, volontairement.

### 3.5 Base de données
`docs/database/draft/` contient le schéma cible non appliqué : 13 enums, tables du cœur métier,
tables du plan d'acquisition et des préférences de partage, **GRANT** explicites, **RLS** par portée
(programme / promotion / terrain), `SECURITY DEFINER` avec `search_path` imposé, triggers
d'immuabilité de la provenance des preuves, `updated_at` automatiques, matrice RLS et journal de
décision. **Rien n'est activé** : validation du schéma requise avant bascule.

---

## 4. Fonctionnalités côté administration — inventaire complet

### 4.1 Sélecteur de programme et bandeau
- Entrée « Tous les programmes » : proposée **uniquement** à un administrateur de plateforme et
  depuis la route `/espace/plateforme` ; onglets spécifiques masqués dans ce mode, révélés dès la
  sélection d'un programme.
- Liste filtrée : une personne ne voit que les programmes où elle possède un rôle ou une inscription
  active ; un rôle de portée **plateforme** conserve l'accès à tous les programmes.
- Navigation automatique au changement de programme : choisir un programme depuis la Direction
  plateforme ouvre son administration ; « Tous les programmes » ramène à la vue d'ensemble.
- Atterrissage par rôle via `landingRouteFor` : un administrateur arrive sur `/espace/programmes`
  (bug de redirection au changement d'identité simulée corrigé).
- Deux bandeaux distincts : `PROGRAM_ADMIN_NAV` (administration d'un programme) et
  `PLATFORM_ADMIN_NAV` (Direction plateforme). Jamais fusionnés.

### 4.2 Tous les programmes
Bandeau de filtres sticky repliable (filière FMI/FMC, états, dates), bouton **Catégories** à choix
unique (DFASM 1/2/3, Master, DIU, DPC…), cartes affichant filière et catégorie, moteur de filtres
déterministe `allProgramsFilters.ts`.

### 4.3 Vue d'ensemble du programme
Sélecteur de promotion explicite (plus d'agrégat implicite), **prochaine échéance**, tâches et
alertes **actionnables** (chaque ligne pointe vers l'écran de traitement en conservant le contexte
de promotion), accès aux **statistiques pluriannuelles** et à la section **Crédits IA**.

### 4.4 Concepteur de programme (le modèle)
- Atelier en 4 étapes (bandeau gris) : Concevoir → Préparer la promotion → **Programmer le planning
  général** → Piloter (débloqué après validation du planning).
- Analyse IA **simulée** proposant des ressources.
- Formulaires **réels et partagés** intégrés : `KnowledgeCreationForm`, `CompetenceCreationForm`,
  `AssessmentModalityForm`, `PlacementCreationForm`, `CohortCreationForm`,
  `DocumentRequirementForm`. Les créations alimentent directement les stores globaux.
- Compteurs « Éléments existants » agrégeant modèle métier + ajouts de session.
- `SCHEDULE_TEMPLATE` pour le planning type.

### 4.5 Pilotage de programme (l'exploitation d'une promotion)
- Sélecteur de promotion, bandeau d'état (phase, avancement calendaire, inscriptions, carnets reçus,
  alertes), **calendrier daté** de la promotion, signaux à traiter, intervenants et rôles
  contextualisés.
- **Quatre actions en accordéon replié** avec badges d'état : Programmation, Activité, Gestion des
  apprenants, Documents.
- **Suivi croisé nominatif** (`LearnerTrackingSection`) : bases théoriques, compétences, stage,
  évaluations — composant identique à celui des Classes.
- **Stages et Évaluations en mode suivi** : réutilisation des blocs des onglets dédiés
  (`PlacementSection`, `AssessmentModalitySection`) avec création désactivée.
- Outil de communication intégré à la section Notifications.

### 4.6 Classes d'apprenants
Liste des promotions, **création avec choix saisie manuelle ou import** dans la même card, roster,
export en bas de page, suivi croisé des apprenants, store partagé `cohortDraftStore`.

### 4.7 Connaissances
Flux linéaire liste → création (`KnowledgeCreationForm`) → suivi ; nature toujours « connaissance ».

### 4.8 Compétences
Flux linéaire avec import placé **au-dessus** du mode manuel, détection de **diff** de référentiel,
suivi nominatif déplacé dans le Pilotage.

### 4.9 Évaluations
Modalités existantes → création (nom, dates, type présentiel/en ligne, sous-type oral/écrit/QCM/
simulation/évaluation orale par IA, usage auto-évaluation/examen de validation) → **importation des
résultats externes** (colonnes attendues, prévisualisation) → **sessions réalisées et à venir par
cohorte**. Terme « ECOS » retiré de la page.

### 4.10 Gestion des stages
Terrains existants et responsables → création du terrain (établissement, service, lieu, places,
responsable, mode de validation) → **éléments de validation** (certificat au responsable, carnet de
stage attendu si prévu) → **association apprenant/terrain par cohorte** → **suivi par étapes**
(compétences réelles, validation finale bloquée si compétences incomplètes, réception du carnet).
Modèles de carnet gérés par `StageLogTemplatesSection`.

### 4.11 Documents et certificats
Modèle `documentRequirement.ts`, store dédié, flux linéaire liste → création → suivi des pièces
attendues et reçues.

### 4.12 Administration et sécurité
Droits **contextualisés** obligatoires (portée programme / promotion / terrain), **motif de
justification obligatoire**, interdiction des rôles globaux ou plateforme, contrôle de cohérence
rôle/portée, refus des doublons, règles de partage et de conservation, **journal d'audit** simulé.

### 4.13 Communication
Assistant en 5 étapes : messages pré-programmés, sélection d'audience, **scan de données patient**,
prévisualisation, envoi simulé. Plan de communication dérivé du calendrier du programme.

### 4.14 Médiathèque, supports narrés, PPTX
Médiathèque pédagogique, dialogues d'ajout et de détail, panneau de conversion narrée,
`PptxConverterDialog` avec pipeline `pptxReader.ts` / `pptxPipeline.ts` (extraction OOXML locale),
politique de rétention documentée (`docs/architecture/pptx_retention_policy.md`).

### 4.15 IA de contenu et crédits
`ContentAiSection` (tuteur avec citations obligatoires), `AiCreditsSection` (quotas, consommation,
journalisation). Tout est **simulé** et étiqueté comme tel.

### 4.16 Personnes et inscriptions
`PeopleEnrollmentsView` : annuaire générique, import CSV/TSV, staging, archivage.

### 4.17 DPC (gelé)
Assistant d'implémentation, comparaison d'audits T0/T1, section audit clinique, migration ECOS.
Conservé mais non prioritaire.

### 4.18 Direction plateforme (profil administrateur de plateforme)
Espace **transversal**, strictement distinct de l'administration d'un programme : aucun dossier
pédagogique nominatif n'y est ouvrable (`platformAdminCanOpenLearnerFile()` reste faux). Garde
d'accès `canAccessPlatformAdministration` sur la route parente `/espace/plateforme`.

Bandeau à 4 onglets (`PLATFORM_ADMIN_NAV`) :

1. **Vue d'ensemble** (`PlatformOverview`, page d'atterrissage) : compteurs programmes, apprenants
   tous programmes, promotions ouvertes, supports pédagogiques, intervenants (hors apprenants),
   conservation « à définir » ; panneaux « Programmes en cours et états », « Classes en cours et
   avancement », « Intervenants et interventions », « Consommation stockage et IA », « Aller plus
   loin ».
2. **Programmes agrégés** (`PlatformProgramsView`) : un bloc détaillé par programme (promotions et
   phases, avancement calendaire, supports, terrains de stage, crédits IA, administrateurs
   autorisés, historique pluriannuel et historique d'utilisation). Message explicite : pour ouvrir
   un programme complet, cliquer sur son bloc ou passer par le menu déroulant.
3. **Statistiques** (`espace.plateforme.statistiques`) : agrégats pluriannuels simulés, sans donnée
   nominative.
4. **Pilotage et paramétrage** (`PlatformPilotageView`) : utilisateurs par groupe de rôle (admin
   plateforme, admin programme, responsable de stage, enseignant, apprenant) avec fiche consultable
   et modifiable par l'admin plateforme, paramètres généraux de la plateforme, paramètres par
   programme, notifications et sollicitations, et outil de **courriel aux intervenants (hors
   apprenants)**. Domaines `platformGovernance.ts`, `platformSettings.ts`, `platformDirectory.ts` ;
   store `platformSettingsStore`. Aucun envoi réel, tout est étiqueté simulé.

`PlatformAdminView` reste la vue de supervision historique (programmes, administrateurs autorisés,
quotas, audit global simulé).

---

## 5. Historique des changements (chronologie des lots livrés)

1. Socle technique, modèle métier, mock repositories, vitest, README.
2. Correction d'architecture : ports en `src/application/ports/`, mock en `src/infrastructure/mock/`,
   mastery à validation tierce, `isRoleScopeConsistent`, routes stage/ressources, scripts
   `typecheck` et `test`.
3. Draft SQL complet + revue de sécurité (portées RLS, `search_path`, GRANT granulaires,
   immuabilité de la provenance des preuves, stockage privé).
4. Refonte du Passeport par nature d'acquis, RBAC `access.ts`, espace Profil, plan d'acquisition
   multi-vues.
5. Extension du draft SQL au plan d'acquisition et aux préférences de partage.
6. Renommage « Mon Passeport Éducatif », carnet de stage configurable, vues Responsable de stage et
   Administrateur (décision D53).
7. Audit fonctionnel, médiathèque, migration ECOS, responsive 360 px, persistance de session.
8. Supports narrés PPTX → HTML5, lecteur dédié, isolation du DTO apprenant.
9. Socle IA simulé avec citations, crédits IA, import/export de promotions.
10. Module DPC HVG–Amylose, renommage « Campus Santé Augmenté ».
11. Conversion PPTX locale (fflate), audit de renommage puis corrections appliquées.
12. Analyse d'écart ODP2C, assistant DPC, séparation référence/implémentation (D82), assistant
    import-driven.
13. Système de communication automatisé avec scan de données patient.
14. Gel du DPC, refonte de la navigation d'administration en 7 onglets + switcher « Tous les
    programmes », séparation physique Concepteur / Pilotage.
15. Alignement successif de tous les onglets sur le flux linéaire : Classes, Connaissances,
    Compétences, Évaluations, Stages, Documents, Administration et sécurité, Vue d'ensemble.
16. Filtres de la page « Tous les programmes », suppression des routes orphelines, dédoublonnage
    Classes / Pilotage, correction de la redirection au changement d'identité simulée.
17. **Dernier lot** : Pilotage réutilisant `PlacementSection` et `AssessmentModalitySection` en mode
    suivi (`showCreation={false}`) ; **boucle apprenant** — `useLearnerPassport` fusionne les
    connaissances, compétences et terrains créés côté administration ; **boucle encadrant** —
    `useSupervision` voit les mêmes terrains. Test de contrat
    `src/features/__tests__/sharedPilotSections.test.ts`.
18. Incident de synchronisation GitHub : `main` avait écrasé la refonte admin ; restauration
    exacte du brouillon « Archivé la plateforme admin » (93 fichiers), puis réapplication du
    sélecteur de programme (navigation automatique + filtrage par rôle/inscription).
19. **Dernier lot — Direction plateforme** : bandeau à 4 onglets (Vue d'ensemble / Programmes
    agrégés / Statistiques / Pilotage et paramétrage), nouvelles routes
    `/espace/plateforme/{programmes,statistiques,pilotage}`, vues `PlatformOverview`,
    `PlatformProgramsView`, `PlatformPilotageView` (utilisateurs par groupe de rôle avec fiche
    modifiable, paramètres généraux et par programme, notifications, courriel aux intervenants hors
    apprenants) ; domaines `platformGovernance.ts`, `platformSettings.ts`, `platformDirectory.ts`.

---

## 6. Invariants à ne jamais casser

1. Une **compétence réelle** exige toujours une validation humaine tierce.
2. La **progression est dérivée des preuves**, jamais saisie.
3. **Rôles contextualisés uniquement**, portée obligatoire, motif de justification exigé.
4. **Un seul outil de création et une seule liste** par objet métier.
5. Le **Concepteur** porte le modèle, le **Pilotage** l'exploitation d'une promotion.
6. Tout élément simulé, mocké ou prévu est **étiqueté dans l'interface**.
7. **Aucun appel IA réel**, aucun secret frontend, aucune donnée patient acceptée.
8. Projet **privé, non publié** ; schéma Supabase **non activé** avant validation.

---

## 7. Reste à faire (non engagé)

- Audit global de cohérence routes / onglets / stores (point proposé et non retenu à ce stade).
- Validation puis activation du schéma Supabase, tests RLS réels.
- Gateway IA propriétaire : authentification, quotas, comptabilité de coût, journalisation.
- Réintégration sélective du legacy par adapters (57 compétences, 6 612 états, moteur ECOS).
- Dégel du DPC après recette du DIU puis du DFASM.
