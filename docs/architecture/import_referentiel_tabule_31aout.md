# Importer un référentiel déjà structuré — 31/08/2026, soirée

Deuxième voie d'entrée du référentiel, à côté de l'import de corpus documentaire.
Écrite ce soir, éprouvée dans la foulée sur les 57 compétences de myDFASM.

## Pourquoi une deuxième voie

`CorpusImport` part de **documents** et fait travailler l'IA pour en TIRER des acquis.
C'est la bonne réponse quand le référentiel n'existe que sous forme de cours, de PDF ou
de site. Ce n'était pas le cas ici : le référentiel de myDFASM est **déjà une table** —
thème, ordre, intitulé, niveau attendu. Le faire relire par un modèle aurait consisté à
payer des crédits pour reformuler ce qui était déjà exact, avec un risque de dérive sur
57 intitulés cliniques.

D'où une voie qui **ne devine rien de ce que la source affirme** : elle lit, elle montre
ce qu'elle a compris, et elle attend.

## Un bouton, deux onglets

Conformément à la règle du projet (« un bloc, un bouton d'import »), il n'y a **pas** de
nouveau bouton. `CorpusImport` porte désormais deux onglets :

| onglet                 | source                         | IA  | dépôt en médiathèque |
| ---------------------- | ------------------------------ | --- | -------------------- |
| Documents et archives  | fichiers, ZIP, site enregistré | oui | oui                  |
| Tableau déjà structuré | CSV, Excel, texte collé        | non | non                  |

Les quatre points de montage existants (Compétences, Connaissances, et le Concepteur
trois fois) en héritent sans une ligne de plus. L'onglet n'est pas proposé pour les
modalités d'évaluation : elles n'ont pas de référentiel tabulé.

## Les trois couches

### `src/domain/delimitedTable.ts` — lire un tableau, quel qu'il soit

Extrait de `cohortRoster`, qui le portait seul. Détection du séparateur par
**régularité** (le caractère dont le nombre d'occurrences varie le moins d'une ligne à
l'autre), recherche de la ligne d'en-tête dans les dix premières, guillemets respectés.
Générique : il ne connaît ni étudiants ni acquis, seulement des colonnes et des alias.

### `src/domain/outcomeRoster.ts` — ce qui est propre aux acquis

Reconnaissance des colonnes, traduction des niveaux et des natures, regroupement par
thème **dans l'ordre d'apparition** (un tri alphabétique détruirait un ordre qui a un
sens pédagogique), et fabrication d'un code lisible quand la source n'en porte pas :
`T3-07` — thème 3, septième acquis. Volontairement lisible plutôt qu'opaque : on le
retrouve à l'œil dans une liste, un identifiant technique non.

Rien n'est écrit : ce module rend une **prévisualisation**. 19 tests.

La correspondance des niveaux mérite d'être relue avant de la réutiliser ailleurs :
l'échelle de myDFASM a trois crans, celle du socle en a cinq. `base` → `intermediate`
(et non `novice` : « base » est ce qu'on attend de tout étudiant en fin de stage),
`avancé` → `proficient`, `expert` → `autonomous`. C'est un choix, pas une évidence.

### `src/application/outcomeRosterImport.ts` — la séquence d'écriture

Créer les thèmes, créer les acquis retenus, puis un seul `setOutcomesTheme` par thème
dans l'ordre du fichier. 12 tests, dont un qui rejoue la séquence complète contre
`mockDataAccess`.

Trois décisions y sont inscrites, avec leur raison :

1. **L'import ne s'arrête pas à la première erreur.** Il n'y a pas de transaction
   possible à travers 57 appels ; s'arrêter au milieu laisserait un import à moitié fait
   sans moyen de le finir. Comme le code est l'identité d'un acquis et le libellé celle
   d'un thème, **rejouer le même fichier reprend là où ça s'était cassé**.
2. **Un thème refusé n'annule pas ses acquis** — ils sont créés non rangés, et l'échec
   est rapporté. La matière est dans l'acquis, pas dans le chapitre.
3. **`domain` porte la portée** (générique / spécialisé) quand la source en a une, sinon
   le libellé du thème. Le chapitre est désormais tenu par `themeId` ; `domain` était
   libre et c'est exactement la distinction que le Concepteur veut filtrer.

### `src/features/administration/OutcomeRosterImportPanel.tsx` — l'écran

Mêmes idiomes que l'import d'étudiants : fichier ou collage, et **tout ce qui a été
deviné reste affiché et corrigeable** — séparateur, ligne d'en-tête, colonnes reconnues,
codes engendrés, natures supposées. Rien n'est écrit avant le clic.

Deux garde-fous méritent d'être conservés si l'écran est retouché :

- **Aucune colonne « Nature » → case à cocher bloquante.** Toutes les lignes prendraient
  la nature par défaut ; une connaissance rangée parmi les compétences fausse le
  passeport de l'étudiant.
- **Les thèmes sont relus au moment du clic**, pas au montage de l'écran. Entre
  l'ouverture et la validation, un autre import a pu en créer, et un thème ignoré ferait
  un chapitre en double.

## Le portage myDFASM

Le référentiel a été récupéré **par le chat de Lovable**, pas par SQL : myDFASM est
construit dans Lovable, ses tables ne sont pas dans l'environnement Supabase de Campus,
et Lovable n'expose pas d'éditeur SQL. Le prompt donné à Lovable était préfixé
« Ne modifie AUCUN fichier. Lecture seule. » et demandait un bloc CSV `;` trié par thème
puis ordre, avec une colonne `Nature` **construite par Lovable** et remplie uniquement
sur les quatre lignes qui ne sont pas des compétences en situation réelle
(défibrillation, massage cardiaque AFGSU, pose de voie veineuse centrale,
coronarographie observée).

Les 57 compétences ont été importées dans DFASM-CARDIO le 31/08 au soir.
**Le recomptage en base reste à faire** : c'est la première chose à vérifier au prochain
chat, avant de bâtir quoi que ce soit dessus.

## Ce que cet import a mis au jour, et qui n'est pas corrigé

### Un acquis ne se corrige pas

Il n'existe **aucun `update_outcome`**, ni en base ni dans les ports. Un acquis se crée
et s'archive. Son intitulé, sa nature et son niveau attendu sont donc figés à la
création — d'où l'insistance à corriger le tableau AVANT de valider.

C'est défendable pour une donnée de référentiel signée par un concepteur, mais ça ne
tiendra pas : une coquille dans un intitulé n'a pas à coûter un archivage. À trancher.

### Un code archivé reste pris, et l'écran l'ignore

`listTakenOutcomeCodes` existe précisément pour ça, mais le panneau de tableau compare
aux codes **actifs** que lui passe l'écran parent. Conséquence : archiver les 57 pour
réimporter un fichier corrigé ferait échouer les 57 créations sur la contrainte
d'unicité, ligne par ligne, en fin de course.

Le même piège est déjà documenté pour l'import de corpus. **Correction à faire :** le
panneau doit lire `listTakenOutcomeCodes(programId)` et la fusionner avec la liste reçue.

### La sélection multiple n'existe que dans le Concepteur

`ProgramAssociationList` — cases à cocher, « Retirer du programme » (qui archive le lot),
« Activer les sélections » — est enfermée dans `AdminProgramDesigner`. L'onglet
Compétences, celui où l'on vient d'importer 57 lignes, n'a aucune sélection : en retirer
trois oblige à passer par le Concepteur.

**Correction à faire :** extraire le composant dans son propre module et le monter aussi
dans les onglets Compétences et Connaissances. Même composant, deux portes — la règle du
projet.

### Ce qui, en revanche, va bien

Un acquis archivé est **déjà invisible partout** : `listOutcomes` filtre
`archived_at is null`, la règle d'accès des étudiants aussi, et aucun écran ne liste les
archivés. La crainte d'un référentiel encombré d'archives est sans objet.
