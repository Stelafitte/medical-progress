# Cartographie fonctionnelle et matrice rôle → écran → action

**Statut : maquette mock. Aucune base activée, aucune migration exécutée, aucun stockage, aucun appel IA, aucun envoi de message.**
Ce document décrit les écrans livrés dans la maquette privée « Mon Passeport Éducatif » et les
règles d'accès qu'ils supposent. Il complète — sans les modifier — les invariants RLS déjà décrits
dans `002_rls_policies.sql`, `003_server_invariants.sql`, `rls_matrix.md` et
`stage_logbook_architecture.md`.

## 1. Espaces et cloisonnement

| Espace | Condition d'accès (dérivée des `RoleAssignment`) | Périmètre de données |
| --- | --- | --- |
| Espace apprenant | rôle `learner` dans le programme sélectionné | sa seule inscription |
| Espace responsable de stage | rôle `placement_supervisor` avec portée `placement` du programme | uniquement les affectations dont la personne est responsable |
| Administration du programme | rôle `administrator` avec portée **`program`** du programme sélectionné | ce seul programme |
| Administration plateforme | rôle `administrator` avec portée **`platform`** | programmes, administrateurs, paramètres, audit — **jamais** un dossier pédagogique |

Règles implémentées côté domaine (`src/domain/access.ts`) :

- `canAccessProgramAdministration` exige une portée `program` : un administrateur de plateforme
  n'obtient jamais l'administration d'un programme par héritage ;
- `canAccessPlatformAdministration` exige une portée `platform` ;
- `canAccessSupervision` exige une portée `placement` dans le programme actif ;
- un changement de programme recalcule tous ces droits (contexte de session).

## 2. Matrice rôle → écran → action

### Responsable de stage (`/espace/encadrement/*`)

| Écran | Actions de démonstration | Interdits |
| --- | --- | --- |
| Vue d'ensemble | consulter étudiants encadrés, stages, tâches, alertes | voir un étudiant non affecté |
| Mes étudiants | filtrer, ouvrir une fiche synthétique | accéder à la promotion complète |
| Carnets à valider | valider unitairement, valider un lot **après revue de la synthèse**, valider en fin de stage, demander une correction motivée | validation groupée silencieuse |
| Compétences à confirmer | modifier le niveau d'autonomie, confirmer, refuser, demander un complément | déclarer une compétence réelle sans acte humain |
| Cas et questions | commenter, marquer traité/non traité | saisir un élément nominatif patient |
| Alertes | filtrer par type | agir hors de son périmètre |
| Bilans de stage | relire la synthèse, signer (signature **simulée**), transmettre en interne, demander le certificat | envoyer une pièce par e-mail |
| Messagerie | préparer un message ou une relance | expédier réellement |
| Mon profil d'encadrant | consulter terrains/périodes, régler des préférences (non enregistrées) | élargir son périmètre |

### Administration du programme (`/espace/administration/*`)

| Section | Écran | Actions de démonstration |
| --- | --- | --- |
| A. Pilotage | `/` | indicateurs de promotion, tâches prioritaires, alertes, avancement des certificats |
| B. Organisation | `/organisation` | versions de cursus, cohortes, utilisateurs et rôles contextualisés, terrains, affectations |
| C. Configuration pédagogique | `/pedagogie` | référentiels par nature d'acquis, règles de validation, jalons, modèles de carnets, ressources |
| D. Suivi pédagogique | `/suivi` | cockpit, états des carnets, retards, fiche apprenant administrative, carnets reçus |
| E. Communications | `/communications` | modèles de messages, préparation, historique « préparé, non envoyé » |
| F. Documents et certificats | `/documents` | pièces demandées/reçues/manquantes, workflow du certificat, exports simulés |
| G. Gouvernance | `/gouvernance` | droits par portée, partage/export, conservation « à définir avant backend », audit simulé |

La signature du certificat de complétude relève du responsable de stage
(`nextCertificateStatus(..., 'sign')`), sa validation de l'administration
(`nextCertificateStatus('signed', 'validate')`). L'administration ne signe jamais à la place de
l'encadrant.

### Administration plateforme (`/espace/plateforme`)

Vue limitée : programmes, administrateurs autorisés, paramètres communs, quotas IA et stockage
**prévus** (non actifs), audit global. `platformAdminCanOpenLearnerFile()` retourne `false` :
l'invariant est explicite dans le domaine et testé.

## 3. Objets de données nécessaires aux écrans (conception, non exécutée)

Ces objets existent aujourd'hui en mock (`src/infrastructure/mock/professionalFixtures.ts`). Leur
projection SQL future respecte les mêmes portées que les tables déjà décrites :

| Objet mock | Table future | Portée RLS visée |
| --- | --- | --- |
| `SupervisionAlert` | `supervision_alerts` (dérivée, calculée serveur) | apprenant : la sienne ; encadrant : ses affectations ; admin programme : son programme |
| `CaseDiscussion` + `CaseComment` | `case_discussions`, `case_comments` | idem ; aucune colonne patient nominative |
| `CompetenceConfirmation` | `competence_confirmations` | écriture réservée aux validateurs de la portée |
| `PlacementReport` | `placement_reports` | écriture par l'encadrant du stage ; lecture admin programme après transmission |
| `ProfessionalMessage` | `messages` | expéditeur/destinataire uniquement ; jamais d'envoi externe |
| `AdminDocument` | `admin_documents` | admin programme ; apprenant en lecture de ses propres pièces |
| `CompletionCertificate` | `completion_certificates` | transitions strictes par trigger (`request/remind/sign/validate`) |
| `AdminTask`, `MessageTemplate`, `SendHistoryItem` | `admin_tasks`, `message_templates`, `message_batches` | admin programme |
| `PlatformSupervisionRow` | vue d'agrégats | admin plateforme, **sans** jointure vers preuves ou carnets |

Invariants à conserver lors de l'activation du backend :

1. aucune preuve ni carnet accessible depuis une portée `platform` ;
2. aucune acquisition de compétence réelle dérivée d'un QCM, d'une photo ou d'une auto-déclaration ;
3. validation groupée journalisée carnet par carnet (aucune écriture de masse anonyme) ;
4. signature de bilan et certificat : append-only, une correction exige une nouvelle décision ;
5. transmission = changement d'état interne, jamais un envoi de pièce par e-mail ;
6. durée de conservation « à définir avant backend » avant toute mise en production.
