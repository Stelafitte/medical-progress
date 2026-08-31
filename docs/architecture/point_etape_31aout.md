# Point d'étape — dimanche 31 août 2026

Journée partie du commit `4f8e852`, base Supabase dev `wbmkazfideylaixjkzyn` à jour.
Ce document raconte ce qui a été fait, dans l'ordre, avec ce qui a été **mesuré** plutôt
que supposé.

## 1. Les tests étaient au vert, et on le savait mal

Le seul angle mort laissé par le 30/08 était que `npm.cmd test` n'avait jamais tourné :
plusieurs tests requalifiés, un test ajouté sur `splitText`, tous relus, aucun exécuté.
Stef les a lancés le 30 au soir : **642 tests, tout passe.** Rappel qui vaut d'être écrit,
parce qu'il coûte du temps à chaque fois : `vitest` ne tourne pas depuis le shell distant,
`node_modules` étant compilé pour Windows.

## 2. `transcribe-slide-audio` : déployée, puis réellement exercée

Déployée par le tableau de bord (la CLI Supabase n'est pas installée sur ce poste), JWT
legacy désactivé, secret `OPENAI_API_KEY` présent.

Vérifiée en deux temps, et le premier compte autant que le second :

**Test de fumée sans écriture.** Un appel avec un `resourceId` volontairement inexistant
répond `404 {"error":"Support introuvable."}`. Ce 404 prouve que la fonction est déployée,
que le JWT est accepté, que le secret est lu et que le code s'exécute jusqu'à la requête en
base — sans écrire une ligne. Recette à réutiliser pour toute Edge Function.

**Transcription réelle**, sur un vrai cours : `200 {"slideIndex":2,"characters":409,
"remaining":8,"done":false}` en **6 secondes**. Neuf diapositives audio ≈ une minute pour
la boucle complète, chaque diapositive étant une invocation séparée. Le choix « une
diapositive par appel » est validé : aucun risque de dépasser le temps d'exécution, même
sur un cours long. Le texte rendu est du français correct, accents intacts, fidèle à la
narration.

**Manque découvert au passage** : `transcribeNextSlide` n'a qu'un seul appelant, la boucle
de publication (`NarratedPackagePublishDialog.tsx:306`). Aucun bouton ne permet de relancer
la transcription d'un cours déjà publié — alors que le message d'erreur de ce même dialogue
dit à l'utilisateur « relancez-la depuis le support ». Une promesse d'écran que le code ne
tient pas, même défaut que « Réutiliser l'existant » corrigé la veille.

## 3. Cartographie de la vue étudiant, avant de remplir quoi que ce soit

Décision méthodologique de la journée : ne pas remplir un programme en espérant que
l'espace apprenant devienne testable. La cartographie a montré que **remplir ne suffit
pas**.

Un étudiant ne lit aujourd'hui que **six tables** : `profiles`, `programs`, `enrollments`,
`role_assignments`, `learning_resources`, `learning_resource_outcomes`.
`createSupabaseDataAccess` part de `...mockDataAccess` : 8 dépôts sur 20 sont câblés sur
Supabase, les autres retombent sur des fixtures qui rendent `[]` **sans erreur** face à de
vrais UUID.

Trois verrous, dont deux se sont révélés être des pièges silencieux :

**Verrou 1 — aucun étudiant n'est créable par l'interface.** L'écran de pré-inscription
appelle `createPendingPerson` sans `intendedCohortId`. Le champ existe dans le port et dans
l'adaptateur, mais aucun écran ne le renseigne, donc le déclencheur ne crée ni
l'inscription ni le rôle `learner`. Toujours ouvert.

**Verrou 2 — l'apprenant ne voyait pas le référentiel.** `outcomes_select` était réservée à
`is_program_staff`. Le commentaire d'origine était honnête pour son époque (« aucun écran
apprenant ne consomme ce référentiel dans cette itération ») mais était devenu faux.
Le piège : l'espace apprenant se serait affiché **vide sans erreur**, et le tableau de bord
aurait annoncé « Tous les jalons sont atteints. » sur zéro jalon. Un écran vide qui se fait
passer pour un écran réussi. **Corrigé** (§5).

**Verrou 3 — un cours publié reste invisible.** `listLearnerNarratedDecks` est encore
délégué au mock. Hors périmètre V1.

## 4. Le cap : la V1.0 DFASM

Périmètre arrêté par Stef, écrit dans `v1_passeport_dfasm.md` — un passeport déclaratif sur
téléphone, pour un stage de cardiologie de 12 semaines, avec un rétroplanning déplaçable et
une validation optionnelle par un senior. Pas de QCM, pas d'évaluation, pas de carnet.

Ce périmètre a **simplifié** la suite : il sort la génération de QCM, l'interrogation de
l'apprenant et le lecteur de cours apprenant du chemin critique.

## 5. `20260831090000_outcomes_readable_by_learners.sql`

`outcomes_select` accepte désormais l'apprenant inscrit — mais **plus étroitement que le
staff** : seulement les acquis `retained_at is not null` et `archived_at is null`.

C'est un choix de sens, pas une commodité : l'apprenant voit le **parcours**, pas le
référentiel de travail du concepteur. Cocher « retenue pour le parcours » devient ce qui met
un acquis dans le passeport de l'étudiant.

`assessment_modalities` n'est délibérément pas ouvert : la V1 ne comporte aucune évaluation,
donc le commentaire d'origine de cette table reste exact.

## 6. Le référentiel DFASM-CARDIO était amputé de moitié

Mesure en base juste après : **20 acquis, tous en `knowledge`, zéro compétence.**

Deux enseignements.

**Le chiffre « 14 retenues sur 21 » du 30/08 ne correspondait plus** : `retained_at` a pour
défaut `now()`, donc tout acquis créé entre dans le parcours d'office. Depuis la policy
ci-dessus, ce défaut ne décide plus de l'affichage du Concepteur mais de ce qui remplit le
passeport de l'étudiant. C'est devenu une décision pédagogique déguisée en valeur par
défaut, et elle mérite d'être rediscutée.

**L'import ne pouvait pas produire de compétences.** La règle « un écran ne retient que la
nature qu'il vise » est correcte — elle évite qu'un import lancé depuis « Compétences »
remplisse la base de connaissances en silence. Mais elle implique qu'un référentiel importé
depuis « Base de connaissances » sort forcément amputé de sa moitié. Plusieurs des vingt
« connaissances » étaient en fait des gestes.

**Correction appliquée** (dry-run, accord, puis `update` sur 6 lignes) : six gestes passés
en `real_competence` — la nature qui déclenche la validation par un tiers, donc exactement
l'option senior de la V1.

| code | libellé |
|---|---|
| BILAN-CLINIQUE-01 | Bilan clinique systématique des territoires |
| BILAN-CLINIQUE-03 | Réalisation d'un ECG |
| BILAN-CLINIQUE-04 | Mesure de l'IPS |
| BILAN-CLINIQUE-05 | Dépistage d'anévrisme de l'aorte abdominale |
| BILAN-CLINIQUE-06 | Bilan clinique annuel |
| PRISE-EN-CHARGE-… | Éducation thérapeutique du patient athéromateux |

État après : **14 connaissances, 6 compétences réelles.**

Reste non tranché : « Éducation thérapeutique » et « Éducation thérapeutique du patient
athéromateux » font probablement doublon. À **archiver**, pas à supprimer, le jour où le
choix sera fait.

## 7. `20260831091000_plan_milestones.sql`

Première moitié du modèle du passeport : `plan_milestones`, `plan_milestone_outcomes`,
leurs policies de lecture (staff **et** apprenant inscrit), et quatre fonctions d'écriture
en `security definer` (`create` / `update` / `delete_plan_milestone`,
`set_milestone_outcomes`). L'écriture directe sur les tables n'est ouverte à personne.

**Vérifiée avant d'être appliquée**, en rejouant les 22 migrations sur un PostgreSQL neuf,
puis en testant les fonctions sur des données jouets. Ce que le test a confirmé :

- un jalon « semaine 4 » sur une cohorte démarrant le 7 septembre donne bien le
  **5 octobre** — la date se déduit, elle n'est pas stockée ;
- `set_milestone_outcomes` conserve l'ordre de composition ;
- un acquis d'un autre programme est refusé, **et le lot refusé n'efface rien** : les liens
  existants étaient intacts après l'échec. C'est le point qui comptait, la fonction faisant
  `delete` puis `insert`.

## 8. Le carnet de stage, réintégré au périmètre

Stef est revenu en cours de journée sur le « pas de carnet de stage » : il en faut un,
activable programme par programme. Trois découvertes ont rendu l'ajout tenable au lieu de
coûteux.

**C'était déjà conçu.** `src/domain/stageLog.ts` existe, avec ses modèles de carnet, ses
champs, ses objectifs à quotas, ses entrées datées et ses validations — et ses trois règles
non négociables. La migration lui donne un stockage, elle ne réécrit rien.

**L'interrupteur existait.** `programs.placements_enabled` est une colonne, et l'écran
Stage y est déjà conditionné.

**Le blocage était ailleurs.** Le rôle `placement_supervisor` exige une portée `placement`
(contrainte SQL de `20260821090000`), et la table `placements` n'existait pas : aucun
encadrant n'était créable en base. Une seule ligne dans `placements` — le service — suffit
à lever ça, sans construire la gestion des cinq autres services du CHU.

Le terrain réel de Stef : un service, plusieurs encadrants, des groupes d'étudiants,
plusieurs-à-plusieurs dans les deux sens, et des cohortes qui tournent **toutes les 12
semaines, quatre par an** — c'est-à-dire exactement la table `cohorts` sur laquelle le
rétroplanning est déjà ancré.

Le piège évité, et il était sérieux : `supervises_enrollment()` **n'utilise pas**
`is_program_staff()`, qui est vraie pour tout `placement_supervisor` du programme. L'utiliser
aurait donné à l'encadrant du groupe A tous les carnets du groupe B et vidé les groupes de
leur sens. Le test n° 4 vérifie précisément ce refus.

`20260831093000_stage_logbook.sql` : 8 tables, 9 fonctions, 8 policies. Rejouée sur
PostgreSQL neuf, puis **onze tests fonctionnels** sur un scénario à deux groupes et deux
seniors croisés — dont le refus de valider hors de son groupe, la journée hors période, la
validation qui déborde du stage, et le mélange de deux promos dans un même groupe.

Une dette assumée : la validation porte désormais une période, que `StageLogValidation`
n'a pas encore dans le domaine ; et `listLogsToValidate(placementAssignmentIds)` ne
correspond plus au modèle par groupes. Deux ajustements à faire au câblage.

## Ce que la journée laisse ouvert

1. Bloc **Rétroplanning** du Concepteur — c'est là que la conception se pilotera.
3. Écran mobile de l'étudiant.
4. Verrou 1 : `intended_cohort_id` jamais renseigné, aucun étudiant créable par l'interface.
5. Doublon « Éducation thérapeutique », à trancher puis archiver.
6. Relance de transcription sur un cours déjà publié : promise à l'écran, absente du code.
7. Module 6 à republier avec le rognage vidéo corrigé — **mis en pause par Stef**.
8. Bruit CRLF/LF : `git status` montre 41 fichiers et 8866 lignes +/− identiques.
   `git diff --ignore-all-space` ne rend rien : **ce n'est pas du travail non commité**.
   À traiter par un `.gitattributes`, sans urgence.

## Méthode et pièges, pour ne pas les redécouvrir

- **Vérifier une migration avant de la proposer** : rejouer toutes les migrations sur un
  PostgreSQL neuf dans le conteneur. `initdb` refuse de tourner en root — créer un
  utilisateur dédié et lancer par un script, pas en `su -c` inline. Le shim doit fournir
  `auth.users`, `auth.uid()`, `auth.role()`, les rôles `anon` / `authenticated` /
  `service_role`, et `storage.buckets` / `storage.objects`.
- L'éditeur SQL Supabase affiche **« Potential issue detected »** dès qu'un script contient
  `revoke` ou `delete`, y compris dans le corps d'une fonction qui ne s'exécute pas à la
  migration. Confirmer par « Run query ».
- Remplir cet éditeur : `window.monaco.editor.getModels()[0].setValue(sql)`. Taper le SQL
  corrompt le texte.
- Coller dans la console DevTools de Chrome exige de taper `allow pasting` une première
  fois. Un `POST … 404` en rouge dans la console n'est que le journal du navigateur pour une
  réponse non-2xx, pas une erreur applicative.
