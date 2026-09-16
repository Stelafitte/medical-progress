# Format d'import des mini-DP et KFP — brief pour le chat « DEV EVALUATION » (15/09)

Campus importe déjà une banque de QRM (`qcm-banque/banque.json`, 1493 questions :
`id`, `chapter`, `chapter_title`, `section`, `section_title`, `outcome` (code ECN-xxx-yy),
`rank`, `stem`, `options[{letter, text, correct, explanation}]`). Les mini-DP et KFP
s'importeront par le MÊME outil (onglet Évaluations → Banque de questions → fichier),
à condition de respecter la forme ci-dessous. Un fichier = une banque (une `source`).

## Forme attendue

```json
{
  "metadata": { "kind": "dossiers", "generated": "2026-09-15", "referentiel": "CNEC 2026" },
  "dossiers": [
    {
      "id": "DP26-01-001",
      "kind": "mini_dp",
      "chapter": 9,
      "chapter_title": "CHAPITRE 9: Item 152 Endocardite infectieuse",
      "outcome": "ECN-152-04",
      "rank": "A",
      "title": "Fièvre chez un porteur de prothèse valvulaire",
      "vignette": "Un homme de 68 ans, porteur d'une prothèse aortique mécanique depuis 2019, consulte pour une fièvre à 38,5 °C évoluant depuis 8 jours…",
      "questions": [
        {
          "id": "DP26-01-001-Q1",
          "format": "qrm",
          "new_data": null,
          "stem": "Quels examens demandez-vous en première intention ?",
          "outcome": "ECN-152-04",
          "rank": "A",
          "options": [
            { "letter": "A", "text": "Trois hémocultures espacées", "correct": true, "explanation": "…" },
            { "letter": "B", "text": "Échocardiographie transthoracique", "correct": true, "explanation": "…" }
          ]
        },
        {
          "id": "DP26-01-001-Q2",
          "format": "qru",
          "new_data": "Les hémocultures reviennent positives à Staphylococcus aureus. L'ETT montre une végétation de 12 mm.",
          "stem": "Quel est le diagnostic le plus probable ?",
          "outcome": "ECN-152-01",
          "rank": "A",
          "options": [
            { "letter": "A", "text": "Endocardite infectieuse sur prothèse", "correct": true },
            { "letter": "B", "text": "Thrombose de prothèse", "correct": false }
          ]
        },
        {
          "id": "DP26-01-001-Q3",
          "format": "qroc",
          "new_data": null,
          "stem": "Citez le geste chirurgical à discuter en urgence.",
          "outcome": "ECN-152-07",
          "rank": "B",
          "answers": ["remplacement valvulaire", "chirurgie valvulaire", "réintervention valvulaire"]
        }
      ]
    },
    {
      "id": "KFP26-01-001",
      "kind": "kfp",
      "chapter": 13,
      "chapter_title": "CHAPITRE 13: Item 232 Fibrillation atriale",
      "outcome": "ECN-232-02",
      "rank": "A",
      "title": "Palpitations irrégulières",
      "vignette": "Une femme de 74 ans…",
      "questions": [
        {
          "id": "KFP26-01-001-K1",
          "format": "menu",
          "key_feature": "Diagnostic",
          "stem": "Quel diagnostic retenez-vous ?",
          "outcome": "ECN-232-02",
          "rank": "A",
          "options": [
            { "letter": "A", "text": "Fibrillation atriale", "correct": true },
            { "letter": "B", "text": "Flutter atrial", "correct": false },
            { "letter": "C", "text": "Extrasystoles auriculaires", "correct": false }
          ]
        },
        {
          "id": "KFP26-01-001-K2",
          "format": "qrm",
          "key_feature": "Prise en charge",
          "max_selection": 2,
          "stem": "Quelles sont les deux mesures à prendre en priorité ?",
          "outcome": "ECN-232-05",
          "rank": "A",
          "options": [
            { "letter": "A", "text": "Score CHA2DS2-VASc", "correct": true },
            { "letter": "B", "text": "Anticoagulation", "correct": true },
            { "letter": "C", "text": "Cardioversion immédiate", "correct": false }
          ]
        }
      ]
    }
  ]
}
```

## Règles

- `kind` : `mini_dp` (3 à 6 questions, données nouvelles possibles entre les questions,
  pas de retour en arrière) ou `kfp` (vignette courte, 2 à 3 questions « point clé »).
- `format` d'une question : `qrm` (plusieurs réponses, barème EDN 1 / 0,5 / 0,2 / 0),
  `qru` (une seule réponse), `qroc` (réponse courte, liste `answers` de formes acceptées,
  comparaison insensible à la casse et aux accents), `menu` (liste déroulante, une
  réponse). Pour une KFP, `max_selection` borne le nombre de coches d'une `qrm`.
- `outcome` par question ET par dossier : le code de l'acquis (`ECN-xxx-yy`), comme la
  banque de QRM. Le rang par question (`rank`), comme la banque de QRM.
- `id` unique par dossier et par question, stable d'un export à l'autre (c'est la clé de
  fusion).
- `chapter` / `chapter_title` : le chapitre CNEC (= l'item), même numérotation que la
  banque de QRM (1 à 22).
- `new_data` : texte affiché AVANT la question, ajouté à la vignette ; `null` sinon.
- `key_feature` (KFP seulement) : le libellé du point clé, pour le score par point clé.

Ce qui sera construit côté plateforme sur cette base : table `question_cases`, questions
rattachées avec position et données intermédiaires, formats `qru`/`qroc`/`menu` dans le
lecteur, mode « dossier » (vignette persistante, questions dans l'ordre, sans retour),
score par dossier et par point clé, choix « QRM / mini-DP / KFP » dans le pilotage par
promotion. Un fichier de deux dossiers suffit pour caler l'import.
