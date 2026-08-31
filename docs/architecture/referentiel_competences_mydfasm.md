# Le référentiel de compétences de myDFASM — lecture et portage

Lu le 31/08/2026 dans la table `competencies` de myDFASM (57 lignes, backend Lovable).
Ce document dit ce qu'il contient, ce qu'il résout pour Campus, et ce qu'il faudrait
trancher avant de le porter.

## Ce qu'il est

**57 compétences, 7 thèmes, 3 niveaux attendus.** Colonnes : `id`, `theme` (entier),
`theme_label`, `order_in_theme`, `label`, `level`, `created_at`, `updated_at`.

| thème | intitulé | nombre |
|---|---|---|
| 1 | Relationnel avec l'équipe soignante | 5 |
| 2 | Relationnel avec le patient et sa famille | 9 |
| 3 | Interrogatoire et recueil d'antécédents | 9 |
| 4 | Examen clinique cardiovasculaire | 11 |
| 5 | Lecture et interprétation de l'ECG | 10 |
| 6 | Gestes techniques et procédures | 8 |
| 7 | Raisonnement clinique et prise en charge | 5 |

Niveaux : `base`, `avance`, `expert`.

**Toutes les lignes sont des savoir-faire**, sans exception : se présenter, recueillir,
ausculter, reconnaître, poser, rédiger. Aucune connaissance déclarative. C'est exactement
ce qui manquait à Campus, dont le référentiel DFASM-CARDIO ne portait que 6 compétences
pour 14 connaissances — parce que l'import ne pouvait produire que des connaissances.

## Les trois questions qu'il résout

**1. La hiérarchie que Stef demandait existe déjà, et elle est bonne.**
`theme` / `order_in_theme` est le « titre de chapitre, puis paragraphes » qu'il voulait
afficher. Sur un téléphone, l'étudiant voit **7 lignes**, pas 57. C'est la démonstration
que `parent_outcome_id` sur `outcomes` est le bon ajout — ou, plus simplement, que le thème
peut être un acquis parent dont les 57 sont enfants.

**2. « Combien d'acquis tient un passeport de 12 semaines ? »** — question posée ce soir
sans réponse. La sienne, tirée de la pratique : **57 compétences**, plus les connaissances.
Ce n'est pas une hypothèse, c'est ce qu'il a déjà mis devant des étudiants.

**3. `level` n'est PAS une auto-évaluation.** C'est le niveau *attendu* de la compétence,
porté par la compétence elle-même — donc l'équivalent de notre `outcomes.target_mastery`,
pas de `outcome_self_reports.declared_level`. Ne pas confondre les deux au portage.

Correspondance proposée vers l'échelle de Campus
(`not_started` → `novice` → `intermediate` → `proficient` → `autonomous`) :

| myDFASM | Campus `target_mastery` |
|---|---|
| `base` | `intermediate` |
| `avance` | `proficient` |
| `expert` | `autonomous` |

## Ce qu'il faut trancher avant de porter

### Générique ou spécialisé : la distinction n'existe pas, et elle vaut cher

La table n'a pas de colonne `specialty`. Or, à la lecture, **une bonne moitié de ces
compétences ne doit rien à la cardiologie** : se présenter à l'équipe, respecter l'intimité,
recueillir un consentement, poser une voie veineuse, rédiger une observation, construire une
hypothèse diagnostique. Elles valent pour n'importe quel stage.

Estimation à vérifier par Stef — **c'est une lecture de non-clinicien** :

| thème | plutôt générique | plutôt cardiologique |
|---|---|---|
| 1 — équipe soignante | 5 | 0 |
| 2 — patient et famille | 6 | 3 |
| 3 — interrogatoire | 2 | 7 |
| 4 — examen clinique | 3 | 8 |
| 5 — ECG | 0 | 10 |
| 6 — gestes | 4 | 4 |
| 7 — raisonnement | 4 | 1 |
| **total** | **≈ 24** | **≈ 33** |

**Pourquoi ça compte** : les étudiants enchaînent les spécialités par périodes de 12
semaines. Les ~24 génériques **suivent l'étudiant d'un stage au suivant** — il ne réapprend
pas à se présenter à l'équipe en pneumologie. Les ~33 cardiologiques s'arrêtent avec le
stage. Marquer la distinction transforme le passeport : d'un instantané par stage, il
devient un parcours qui se cumule.

C'est aussi la réponse à la question de ce soir sur « les compétences générales DFASM1 et
les spécialisées » : elles sont déjà là, mélangées, et il suffit de les étiqueter.

### La pneumologie manque

Les 12 semaines couvrent **cardiologie ET pneumologie**. Ce référentiel est purement
cardiologique. Il manque donc l'équivalent des thèmes 3, 4 et 5 côté pneumo — interrogatoire
respiratoire, examen pleuro-pulmonaire, lecture d'une radiographie thoracique et d'une EFR.
C'est là, et seulement là, qu'une recherche externe a du sens.

### Trois compétences ne relèvent pas de la nature « compétence réelle »

Notre modèle distingue `real_competence` (validée par un tiers, jamais auto-déclarée) et
`simulated_competence`. Or trois lignes sont explicitement de la simulation ou de la
formation :

- « Participer à un geste de défibrillation externe (formation ou simulation) » ;
- « Maîtriser le massage cardiaque externe (formation AFGSU) » ;
- et, d'une autre manière, « Assister à la pose d'une voie veineuse centrale » et
  « Observer une coronarographie » — qui sont de l'**observation**, ni simulation ni
  pratique autonome.

Notre modèle n'a pas de nature « observé ». Deux options : les ranger en
`simulated_competence`, ou reformuler l'attendu. À trancher avec Stef.

## Portage proposé

1. Créer 7 acquis « thème » dans DFASM-CARDIO, comme parents.
2. Importer les 57 comme enfants, en `real_competence` (sauf les cas ci-dessus),
   `target_mastery` selon la correspondance des niveaux, `order_in_theme` conservé.
3. Étiqueter générique / spécialisé — une colonne à ajouter, ou un domaine (`domain`
   existe déjà sur `outcomes` et n'est pas utilisé).
4. Ne pas toucher aux 14 connaissances existantes : elles se rangeront sous leurs propres
   thèmes quand le référentiel du collège sera importé en entier.

**Prérequis technique** : `outcomes` est plat. Le parent (`parent_outcome_id`) est à ajouter
avant l'import, sans quoi les 57 arriveraient en vrac et l'écran étudiant serait illisible.
