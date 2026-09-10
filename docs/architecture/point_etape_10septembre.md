# Point d'étape — 10 septembre 2026

Soirée consacrée à l'**environnement Encadrant**, menée en parallèle du chantier
« Communication interne » qui vivait dans un autre fil, sur le même dépôt.

Tout ce qui suit a été **exécuté en base** et **committé**. Rien n'attend en
local ; il reste à pousser.

---

## 1. Ce qui a changé en base

Cinq migrations, dans l'ordre, toutes passées au banc d'essai (PostgreSQL 16 en
conteneur, schéma complet rejoué) avant exécution :

| migration | ce qu'elle pose |
|---|---|
| `20260910200000_encadrant_a_l_activation` | le vivier `people` porte une **intention de rôle** (`intended_role`, `intended_placement_id`) ; `handle_people_activation` fabrique un encadrant à l'activation du compte |
| `20260910230000_semaines_de_presence` | `supervision_group_weeks` : l'alternance **semaine en service / semaine chez soi**, portée par le groupe ; génération du rythme + correction semaine par semaine |
| `20260910240000_choix_du_groupe` | `join_supervision_group` : l'étudiant se place lui-même ; **journal** des entrées et sorties alimenté par déclencheur ; `set_group_members` réécrite **par différence** |
| `20260910250000_responsable_de_stage` | `placement_manager` entre dans `is_program_staff` et dans `supervises_enrollment` ; contrainte `validator_role` élargie ; activation étendue |

*(Les deux migrations `20260910220000` et `20260910221000` viennent du chantier
communication, pas d'ici.)*

**Deux fonctions qui existaient depuis le 31/08 et que personne n'appelait** ont
été branchées ce soir, sans une ligne de SQL nouvelle :
`validate_outcome_declaration` et `revoke_outcome_validation`. Le geste central
de l'encadrement attendait un bouton, pas une migration.

---

## 2. Les décisions prises, et pourquoi

**L'alternance se pose sur le GROUPE, pas sur l'étudiant ni sur la promotion.**
Deux moitiés qui alternent l'une contre l'autre sont deux groupes de
supervision, calendriers décalés d'une semaine. L'équipe d'encadrement reste
commune aux deux : un groupe dit *quand* des étudiants sont là, jamais *qui* les
encadre.

**L'étudiant choisit son groupe, et peut en changer en cours de stage.**
Les étudiants savent entre eux qui est dans quelle moitié ; l'administration,
non. Ce qui rend le changement sans danger n'est pas un verrou mais le
**journal** : sans lui, changer de groupe réécrit le passé — une semaine manquée
disparaît, une semaine off devient une semaine manquée. Le carnet suit
l'inscription et le terrain, pas le groupe : changer ne fait perdre aucune
journée écrite.

**Le responsable de stage fait tout ce que fait l'encadrant, plus la validation
du stage et l'envoi de messages.** Une seule porte ouvre les deux :
`is_program_staff` garde à la fois les lectures du dépôt et les trois fonctions
de communication interne. La clôture du stage n'est **restreinte à personne** :
l'encadrant garde le droit de clore.

**L'encadrant suit des groupes, le responsable répond d'un terrain.** C'est la
différence de nature entre les deux, et elle se lit dans
`supervises_enrollment` : le premier passe par `supervision_group_supervisors`,
le second par la portée de son rôle. Le responsable n'est **pas** rattaché aux
groupes — deux chemins vers le même droit finissent par diverger.

**Les alertes n'ont plus d'onglet.** Un signal qui vit dans sa propre page
devient une seconde boîte que personne n'ouvre. Les compteurs sont posés là où
le geste se fait : carnets et compétences.

**Le bilan de fin de stage ne crée aucune table.** Clore un stage, c'est valider
la période entière — `stage_log_validations` porte déjà `covers_from` /
`covers_to`, une décision et un commentaire.

---

## 3. L'espace Encadrant, écran par écran

Les huit objectifs du matin sont passés :

1. **Mes étudiants** — cartes sous 640 px, le bouton n'exige plus de défilement
2. **Carnets à valider** — refait autour d'un calendrier de présence ; on valide
   une *période* de jours déclarés, décision écrite en base
3. **Compétences à confirmer** — le geste réel, connaissances théoriques hors
   champ (la base le refuse aussi)
4. **Cas et questions** — supprimé
5. **Alertes** — supprimé, compteurs redistribués
6. **Bilans** — synthèse réelle par étudiant, clôture du stage
7. **Messagerie** — deux pavés : annonces reçues / échanges
8. **Profil** — adresse et mot de passe **réellement** modifiables, dans les
   deux profils (l'apprenant ne pouvait pas non plus)

Côté apprenant : bloc « dans quel groupe suis-je », et le carnet ne réclame plus
de journées pendant une semaine de travail personnel.

---

## 4. Ce qui reste, par ordre de blocage

1. **Les invitations.** Les 6 personnes du vivier 4O n'ont jamais été invitées,
   donc aucune n'a de compte, donc aucun rôle ne se pose. Tant que ce geste
   n'existe pas, l'espace Encadrant n'a qu'un seul utilisateur et le rôle
   Responsable de stage n'est pas observable. C'est le chantier communication.
2. **Renommer un groupe** — impossible depuis l'interface. Une promotion
   découpée en deux gardera le libellé de la première.
   Proposition en attente : « 4O — première semaine en service » /
   « 4O — première semaine chez soi », plutôt que A et B : ce qui est stable,
   c'est par quoi le groupe commence, pas son état de la semaine.
3. **Les statistiques** — maquette complète, aucun instantané de promotion en
   base. Chantier entier, pas une vérification.
4. **Le nettoyage des fins de ligne** — `npm run lint` est rouge sur tout le
   dépôt (CRLF), et l'était avant ce soir.

---

## 5. Pièges d'environnement mesurés

- **`.git/HEAD.lock` et `index.lock`** laissés par des lectures git concurrentes
  bloquent tout commit avec un message trompeur (« Another git process seems to
  be running »). Les supprimer ; ils sont vides.
- **Fins de ligne** : la plupart des fichiers sont en CRLF. Un `open(p,'w')`
  Python les réécrit en LF et fabrique des centaines de lignes de diff
  fantômes. Lire en binaire, restaurer les CRLF avant d'écrire.
- **Jamais `git add .`** : une quarantaine de fichiers apparaissent modifiés
  sans l'être. Committer les fichiers nommément, vérifier avec
  `git diff --ignore-all-space --stat`.
- **Éditeur SQL Supabase** : coller le SQL par `monaco.editor.getModels()[0]
  .setValue()`, puis **vérifier l'empreinte SHA-1 contre le fichier du banc**
  avant d'exécuter. La frappe directe avale des sauts de ligne.
- **Deux sessions sur le même dépôt** ont produit ce soir une collision
  d'horodatage de migration et un import supprimé d'un côté, utilisé de l'autre.
  Committer court et souvent.

---

## 6. Points de contact avec le chantier communication

- `is_program_staff` a changé de contenu : le nouveau rôle y entre. Les trois
  fonctions de communication s'ouvrent donc au responsable de stage.
- `RoleName` (TypeScript) connaît désormais les **cinq** valeurs de l'enum.
  Un rôle présent en base et absent de l'union ne provoque aucune erreur : il
  ressort **en blanc** à l'écran.
- `PendingPerson.origin` accepte `sync`, et `intendedRole` est exposé.
- Marina Dijos est responsable de stage, pas encadrante : le vivier compte
  toujours 6 lignes, dont 5 encadrants.
