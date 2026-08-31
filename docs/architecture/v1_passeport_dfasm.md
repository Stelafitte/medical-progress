# V1.0 DFASM — le passeport de stage

Spécification arrêtée le 31/08/2026. Ce document dit ce que la V1 fait, ce qu'elle ne fait
pas, et pourquoi le modèle de données a la forme qu'il a. Il fait autorité sur les
intentions ; le code fait autorité sur l'état.

## L'intention

Un étudiant de DFASM part en stage de cardiologie pendant **12 semaines**. La V1 lui met
entre les mains un **passeport** où il suit sa propre montée en connaissances et en
compétences.

Le passeport lui propose un **rétroplanning** : des jalons datés, répartis sur les douze
semaines, chacun portant un paquet d'acquis attendus. L'étudiant le remplit **lui-même, en
déclaratif, depuis son téléphone**, et cela doit être très facile — la contrainte mobile
est une contrainte de conception, pas un confort.

Le rétroplanning est une **proposition**, pas une contrainte subie : l'étudiant peut
déplacer ses jalons selon ses capacités et son organisation. Seuls les jalons marqués
officiels résistent.

En option, une compétence peut être **validée par un senior encadrant**. Optionnelle : le
passeport doit rester utile sans elle.

## Hors périmètre, explicitement

- Les connaissances **ne sont pas testées**. Pas de QCM, pas d'épreuve.
- Les compétences **ne sont pas testées** non plus.
- **Pas d'évaluation.**

> **Révision du 31/08 (même jour).** Le carnet de stage, d'abord exclu, est **réintégré au
> périmètre** à la demande de Stef, activable programme par programme. Voir la section
> « Le carnet de stage » plus bas. Le reste du hors-périmètre est inchangé.

Conséquences à assumer : `assessment_modalities` n'a pas à être ouvert aux apprenants ; la
génération de QCM et l'interrogation de l'apprenant sortent de cette version ; le lecteur de
cours commenté côté apprenant n'est pas requis pour que la V1 tienne debout.

## Les trois décisions de modélisation

**1. L'étudiant pose son niveau ; il n'accumule pas de preuves.**
Il choisit directement où il en est sur l'échelle existante — Non commencé, Découverte,
Intermédiaire, Maîtrise, Autonome. Une saisie par acquis, modifiable à tout moment.

L'échelle de `src/domain/mastery.ts`, ses libellés français et `progressPercent` sont
conservés. Ce qui disparaît est la règle qui **dérivait le niveau du nombre de preuves**
(1 preuve → Découverte, 4 → Autonome). Cette règle supposait des épreuves ; la V1 n'en a
pas, et demander quatre saisies par acquis sur un téléphone contredirait « très facile ».

**2. Le rétroplanning est fait de jalons qui regroupent des acquis.**
Quatre à six jalons datés sur les douze semaines, chacun portant plusieurs connaissances et
compétences — pas une échéance par acquis. Un étudiant tient une poignée de dates, pas
vingt. Un acquis hérite de la date de son jalon.

**3. Ancrage sur la cohorte, calendrier déplaçable par l'étudiant.**
Le stage commence à une date donnée pour toute la promo : `cohorts.starts_on`. Un jalon
porte un **rang de semaine**, pas une date ; l'échéance se calcule. Rejouer le même
rétroplanning l'année suivante ne demande que de changer la date de la cohorte.

L'étudiant peut décaler un jalon pour son organisation personnelle. La règle qui décide
existe déjà et n'est pas à réinventer : `approvalRuleForImpact()` dans
`src/domain/acquisitionPlan.ts` distingue `personal_pace` (accepté d'office) de
`official_deadline` (validation enseignant). Un jalon `official` ne bouge pas ; les autres
se déplacent librement. En V1, un jalon officiel est **verrouillé** — le circuit de demande
et de validation n'est pas construit.

## L'invariant du socle, et ce qu'il devient

`src/domain/mastery.ts` porte en tête :

> une compétence RÉELLE ne peut jamais être acquise par auto-déclaration.

Il est **conservé**, et il s'accorde exactement avec l'option senior : le niveau déclaré sur
une `real_competence` reste « à valider » tant qu'un tiers autorisé ne l'a pas confirmé.
C'est la même idée que `blockedBySelfDeclaration`, exprimée sur une déclaration plutôt que
sur une preuve.

## Le modèle de données

Quatre tables, aucune modification des tables existantes.

### `plan_milestones` — le rétroplanning modèle (posée le 31/08)

Un jalon appartient à une **cohorte**, pas à un programme : « semaine 4 » n'a de sens que
pour un stage donné, là où une connaissance existe indépendamment de toute promo.

| colonne | rôle |
|---|---|
| `cohort_id`, `program_id` | le second est dénormalisé pour que la RLS décide sans jointure ; une clé étrangère composite vers `cohorts (id, program_id)` l'empêche de mentir |
| `label` | « Semaine 4 — les bases de l'ECG » |
| `week_offset` | rang de semaine, 0 à 104. **La date n'est pas stockée** : `cohorts.starts_on + week_offset * 7` |
| `official` | échéance institutionnelle, non déplaçable par l'étudiant |
| `position` | ordre d'affichage |

La contrainte `unique (id, official)` n'est pas redondante avec la clé primaire : c'est la
cible de la clé étrangère composite de `learner_milestone_shifts`, qui rend le refus d'un
décalage sur jalon officiel **déclaratif** plutôt que confié à un bouton grisé.

### `plan_milestone_outcomes` — le contenu d'un jalon (posée le 31/08)

`(milestone_id, outcome_id, position)`. C'est ce qui remplace « une échéance par acquis ».

### `outcome_self_reports` — la déclaration de l'étudiant (à poser)

`(enrollment_id, outcome_id)` **unique** : une seule ligne par acquis et par étudiant, mise
à jour, jamais accumulée. Porte le `declared_level`, la date, et pour l'option senior le
`validated_by` / `validated_at`.

Invariant : **changer son niveau efface la validation**. Sans cela, un senior aurait validé
« Découverte » et l'écran afficherait « Autonome, validé ».

### `learner_milestone_shifts` — le décalage personnel (à poser)

`(enrollment_id, milestone_id, shifted_due_on)`. Une ligne **seulement** quand l'étudiant a
déplacé un jalon ; en son absence, la date de la cohorte s'applique.

Invariant : **un jalon officiel refuse le décalage**, en base.

## Le carnet de stage

Réintégré au périmètre le 31/08. Activable **programme par programme** : l'interrupteur
existe déjà, `programs.placements_enabled`, et l'écran Stage y est déjà conditionné.

Ce qu'il fait : l'étudiant **coche ses jours de présence** dans le service, note **en texte
libre** ce qu'il a fait, et l'encadrant **valide par bloc** — une semaine ou plus.

### Trois décisions

**Le vocal ne se code pas.** Un champ de texte long, et l'étudiant dicte avec la touche
micro de son propre clavier — natif sur iPhone et Android, gratuit, sans réseau. On ne
conserve que le texte. Écartés : l'enregistrement audio transcrit par Edge Function (un
aller-retour que l'hôpital n'offre pas toujours) et l'API de reconnaissance vocale du
navigateur (peu fiable sur Safari iOS).

**Une entrée = un jour présent.** La présence n'est pas une colonne, c'est l'existence de
la ligne ; supprimer une journée déclare l'absence. Un geste, pas deux.

**La validation porte une période**, pas une journée : `covers_from` / `covers_to`. C'est
ce qui permet de valider une semaine, trois, ou tout le stage sans qu'un découpage soit
imposé à l'avance. L'historique est conservé — une demande de correction puis une
validation sont deux lignes.

### Le terrain réel, et ce qu'on n'a pas sur-modélisé

Un seul service (celui de Stef ; les cinq autres du CHU sont hors périmètre), plusieurs
encadrants, et des **groupes d'étudiants** à l'intérieur — un encadrant peut suivre
plusieurs groupes, un groupe avoir plusieurs encadrants. Les cohortes tournent toutes les
12 semaines, quatre par an : c'est exactement la table `cohorts`, celle qui ancre déjà le
rétroplanning.

Le rôle `placement_supervisor` porte une contrainte SQL dure — il exige une portée
`placement` — et la table `placements` n'existait pas : **aucun encadrant n'était créable
en base**. D'où une seule ligne dans `placements` (le service), et les groupes gérés à
part : `supervision_groups`, `supervision_group_members`, `supervision_group_supervisors`.

**Le rôle dit ce qu'un senior a le droit de faire ; le groupe dit sur quels étudiants.**
Séparer les deux évite de toucher à l'énumération `role_scope_kind` et à ses contraintes.

Conséquence directe dans le code : `supervises_enrollment()` **n'utilise pas**
`is_program_staff()`. Cette dernière est vraie pour tout `placement_supervisor` du
programme, ce qui donnerait à l'encadrant du groupe A les carnets du groupe B. Seule
l'administration du programme voit tout.

### Ce qui reste à faire côté code

`src/domain/stageLog.ts` fait autorité et n'a pas été réécrit — la migration lui donne un
stockage. Deux ajustements restent nécessaires au câblage :

- `StageLogValidation` doit recevoir `coversFrom` / `coversTo` : le type n'a pas de période.
- `listLogsToValidate(placementAssignmentIds)` ne correspond plus au modèle par groupes ;
  sa signature devra changer.

Ses trois règles non négociables restent entières : la photo est un fragment explicitement
autorisé, **aucune acquisition n'est jamais dérivée d'une photo**, aucun champ patient
nominatif n'existe. La V1 ne construit pas les photos — la politique est stockée, rien de
plus.

## Ce que la V1 n'active pas

Les écrans Passeport, Compétences, Stage, Progression, Messages, Audits et DPC existent en
maquette et resteront vides pour ce qui ne relève pas du passeport : les tables `evidence`,
`placements`, `stage_logs`, `plan_schedule`, `messages`, `clinical_audit_*` et `dpc_*`
**n'existent pas**. Aucun remplissage ne les activera. Voir `backend_gap_analysis.md`.

## Ce qui reste à construire, dans l'ordre

1. La seconde moitié de la migration : `outcome_self_reports`, `learner_milestone_shifts`.
2. Le bloc **Rétroplanning** du Concepteur : composer les jalons, les dater en semaines, y
   glisser les acquis. Rangé comme les objectifs pédagogiques — un bloc du Concepteur, pas
   d'onglet propre, parce qu'un jalon appartient à une cohorte.
3. L'écran mobile de l'étudiant.
4. La levée du verrou d'inscription : aucun écran ne renseigne `intended_cohort_id`, donc
   aucun étudiant n'est créable par l'interface aujourd'hui.
