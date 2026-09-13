# Évaluations — le modèle avant les écrans (12 septembre 2026)

Ce document fixe ce qu'on construit et dans quel ordre, à partir des huit décisions prises
par Stef le 12/09. Il précède la maquette, qui précède le développement. Tout ce qui est
« mesuré » ci-dessous a été lu dans la base ou le dépôt ce jour ; tout ce qui est « à
mesurer » ne l'a pas encore été et ne doit pas être présumé.

---

## 1. Les décisions

| # | Question | Décision |
|---|---|---|
| 1 | Effet d'une évaluation machine réussie sur le passeport | **Une preuve, sans toucher au niveau.** La machine ne confirme jamais ; le niveau déclaré reste à l'étudiant, la confirmation à l'encadrant. |
| 2 | Qui rend une session de QRM sommative | **L'admin programme planifie des sessions** (chapitres, nombre de questions, fenêtre, seuil). L'entraînement reste toujours ouvert. |
| 3 | Grille d'observation par l'encadrant | **Confirmation binaire conservée**, telle qu'elle existe. Pas d'échelle. |
| 4 | ECOS virtuel | **Reprendre le moteur historique** (scénarios, grille pondérée, minuterie, débriefing) **sur l'IA de ce socle** (réglage par programme, crédits, fils privés partageables). Préalable : lecture à deux de l'inventaire conserver/adapter/remplacer déjà écrit dans `docs/database/draft/legacy_ecos_integration.md`. |
| 5 | Qui voit les résultats d'un étudiant | **L'étudiant, et son équipe de stage en lecture** — le même périmètre que le passeport (revu le 12/09 après lecture du § 3.4 ; le premier choix ouvrait à tout le staff du programme). |
| 6 | Épreuves en présentiel | **Saisie du résultat par l'enseignant**, rattachée aux acquis de l'épreuve, qui entre au passeport comme preuve. |
| 7 | Évaluation de la formation par l'apprenant | **Pas maintenant.** Nommée dans le modèle, non construite. |
| 8 | Ordre | **Ce document → maquette → QRM d'entraînement**, puis une modalité à la fois. |

---

## 2. Ce qui existe (mesuré le 12/09)

- `assessment_modalities` : le **catalogue** des modalités d'un programme — mode (présentiel /
  en ligne), sous-type (oral, écrit, pratique / QCM, simulation, oral IA, étude de cas), usage
  (auto-évaluation, formatif, examen de validation, certification). Rien ne tourne derrière :
  aucune table de session, de tentative, de réponse ni de note.
- `outcome_self_reports` : l'**auto-déclaration** de niveau par acquis, et sa **confirmation**
  par l'encadrant (`validated_by`, `validated_at`). C'est la seule évaluation vivante.
- `ai_threads` / `ai_messages` : l'infrastructure de **dialogue IA**, réelle depuis le 03/09,
  avec réglage et crédits par programme (`program_ai_settings`) et partage d'un fil à
  l'initiative de l'étudiant (une date, pas un booléen).
- La **banque de QRM** : `qcm-banque/banque.json`, 228 questions le 12/09 (cible 1 484),
  cinq propositions et cinq justifications chacune, rang A/B, code d'acquis `ECN-xxx-nn`,
  statut de relecture (« rédigé et relu par IA ; validation à faire » pour 223 d'entre elles).
  **Alimentée en continu par ChatGPT** : toute reprise en base doit être rejouable par
  identifiant de question.
- L'**ECOS historique** de dfasm-learnhub : inventaire module par module déjà rédigé, avec
  décisions conserver / adapter / remplacer ; rien d'exécuté, écran admin de maquette.

---

## 3. Le modèle

### 3.1 Les objets

```
assessment_modalities  (existe)   — le catalogue : ce qu'un programme sait faire passer
        │
        ├── question_banks ──── questions ──── question_options
        │     (import rejouable de banque.json, clé = id de la question)
        │
        ├── assessment_sessions            — une épreuve planifiée par l'admin programme
        │     modalité, promotion, chapitres/acquis couverts, nombre de questions,
        │     ouverture, fermeture, seuil, règles (tentative unique, tirage figé)
        │
        ├── assessment_attempts            — un passage : libre (session = null) ou de session
        │     inscription, début, fin, statut, score
        │     └── assessment_answers       — une ligne par question répondue
        │
        ├── ecos_stations ──── ecos_grid_items      — scénario + grille pondérée (repris)
        │     └── ecos_runs  (= un passage)         — lié à un ai_thread de scope « ecos »
        │           └── ecos_run_scores            — un score par item de grille
        │
        └── manual_results                  — résultat saisi pour une épreuve en présentiel
              session présentiel, inscription, note ou validé/non, saisi par, le
```

**La preuve n'est pas une table.** Une preuve est une *lecture* : « pour cet acquis, voici
les passages qui l'ont exercé et ce qu'ils ont donné ». Elle se calcule depuis les
tentatives, les passages ECOS et les résultats saisis, tous rattachés à des acquis codés.
Stocker une table `preuves` recopiée serait créer une seconde vérité qui divergerait de la
première — le défaut qu'on a chassé du concepteur le 11/09.

### 3.2 Les règles, écrites une fois

1. **Tout est rattaché à des acquis codés du référentiel.** Une question, une station, une
   épreuve sans acquis ne peut pas produire de preuve, donc n'a pas sa place.
2. **La machine ne confirme jamais** (décision 1). Aucun chemin d'écriture d'une tentative vers
   `outcome_self_reports.validated_*`. La base doit le garantir, pas l'écran.
3. **L'entraînement est libre et rejouable** : tirage à la demande par chapitre et par rang,
   correction immédiate avec les justifications, historique conservé.
4. **Une session est fermée par construction** : tirage figé à l'ouverture de la tentative,
   une tentative par inscription, réponses conservées, score calculé en base, pas à l'écran.
5. **Le sommatif ne tire que dans les questions validées par un humain** — à confirmer par
   Stef. L'entraînement peut utiliser toute la banque, en affichant le statut de relecture.
6. **L'import de la banque est idempotent** : même identifiant = même question mise à jour,
   jamais dupliquée ; une question retirée de la source est *archivée*, pas supprimée, parce
   que des tentatives la référencent.
7. **L'ECOS virtuel consomme des crédits** : c'est la seule modalité qui coûte à l'usage. Le
   réglage IA du programme s'applique, et l'admin voit la consommation.

### 3.3 Ce que chaque vue montre

| Vue | Fait | Voit |
|---|---|---|
| **Apprenant** | s'entraîne (QRM par chapitre/rang), passe les sessions ouvertes, joue une station ECOS | ses résultats **par acquis**, jamais une note seule ; ses passages ; ses fils ECOS |
| **Encadrant** | confirme les compétences (existe, binaire) | les résultats des étudiants de **sa promotion**, en lecture — le périmètre du passeport (décision 5) |
| **Responsable de stage** | idem + prononce le stage (existe) | idem, plus la vue promotion |
| **Admin programme** | catalogue (existe), banques (import), sessions, seuils, saisie des résultats présentiels, stations ECOS | résultats de promotion, consommation IA, export |
| **Admin plateforme** | rien de contenu | catalogue transversal et agrégats |

### 3.4 Un seul périmètre de visibilité par étudiant

La décision 5, revue, aligne les résultats d'évaluation sur le passeport : ce que voit un
encadrant d'un étudiant — passeport, carnet, résultats — obéit à **une seule règle**,
`supervises_enrollment` (la promotion, depuis le 11/09). Une première version ouvrait les
résultats à tout le staff du programme ; elle aurait créé deux périmètres pour la même
personne, et un encadrant aurait lu les QRM d'un étudiant dont il ne voit pas le passeport.
La policy des tentatives réutilisera donc `supervises_enrollment`, sans nouvelle fonction.

---

## 4. L'ordre de construction

1. **QRM d'entraînement** — import rejouable de la banque (avec mise en correspondance des
   codes `ECN-xxx-nn` et des acquis en base : *à mesurer*, les codes du référentiel importé
   le 08/09 ne sont peut-être pas les mêmes), écran apprenant, historique, lecture par acquis.
2. **Sessions sommatives** — objet session côté admin, passage fermé côté apprenant, résultats
   de promotion.
3. **Résultats présentiels** — la petite table et son écran de saisie.
4. **ECOS virtuel** — après lecture de l'inventaire historique ; scénarios et grille d'abord,
   dialogue texte, puis voix si les crédits le permettent.
5. **Évaluation de la formation** — hors chantier.

Chaque étape passe par le banc pour sa migration, et par la maquette pour ses écrans.

---

## 5. Points ouverts

- Correspondance entre les codes d'acquis de la banque (`ECN-221-04`) et ceux des `outcomes`
  du programme DFASM en base — **à mesurer avant tout import**.
- Où vit le drapeau « validé par un humain » d'une question : dans la source (ChatGPT) ou dans
  la base (un relecteur nommé, une date) ? Le second est traçable, le premier suit la source.
- Le partage d'un fil ECOS : la **grille et le score** suivent la décision 5 (visibles de
  l'équipe de stage) ; le **dialogue** lui-même reste privé sauf partage par l'étudiant, comme
  tout fil IA depuis le 03/09. À confirmer.
