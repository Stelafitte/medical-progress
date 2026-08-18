# Exploitation IA des contenus — conception (DRAFT, rien n'est activé)

Statut : **maquette**. Aucun index, aucune extraction, aucun appel IA, aucun crawl,
aucun bucket, aucune migration. Ce document décrit le contrat visé et ce que
l'interface simule aujourd'hui.

## 1. Contrat universel

Tout support **publié** de la médiathèque possède un profil d'exploitation IA
(`ContentAiProfile`) au statut `ready` après contrôle pédagogique, quel que soit
son format. Le contenu pédagogique validé est la **source de vérité** : une
réponse doit citer une référence précise et signaler toute sortie du corpus.

| Format | Contenu extrait attendu | Référence citable |
| --- | --- | --- |
| PDF | texte, OCR, structure, pages | page (`p. 34`) |
| PowerPoint | texte, notes du présentateur, diapositives | diapositive |
| PowerPoint sonorisé | diapositives, notes, transcription audio, chapitres, timestamps | chapitre / timestamp |
| Vidéo | transcription, chapitres, timestamps | chapitre / timestamp |
| Page web HTML | titres, paragraphes, tableaux, ancres | titre / ancre (`#douleur-thoracique`) |
| QCM | questions, réponses, explications, objectifs | numéro de question |
| Cas clinique | scénario, étapes, raisonnement, compétences | étape du cas |
| Lien externe simple | métadonnées seules | métadonnées (hors corpus IA) |

Un **lien externe simple** n'entre jamais dans le corpus IA sans décision
explicite : transformation en page web HTML, transformation en document déposé,
ou non-publication (`LinkTransformDecision`).

## 2. Pipeline d'ingestion générique

```
dépôt / déclaration
  -> extraction (texte, OCR, notes, transcription, structure)
  -> normalisation et découpage sémantique
  -> rattachement aux objectifs et compétences
  -> instantané versionné (immuable une fois validé)
  -> contrôle pédagogique humain (obligatoire)
  -> indexation IA
  -> publication
```

Statuts exposés à l'administrateur : `awaiting_extraction`, `extracting`,
`structuring`, `review_required`, `indexing`, `ready`, `outdated`, `failed`.
Ils sont **distincts** du statut éditorial du support (`draft`, `published`,
`archived`).

Garde de publication (`evaluatePublicationGate`) : la publication est bloquée si
le profil IA n'est pas `ready`, si les références ne sont pas contrôlées, si les
facettes attendues du format manquent, ou si un lien externe n'a pas de décision.

## 3. Pages web HTML

- L'IA n'exploite **jamais** la page distante en direct : seul un instantané
  extrait, nettoyé (navigation, bandeaux, publicité), structuré, versionné puis
  validé alimente le corpus.
- Paramètres déclarés : URL canonique, accès (publique / authentifiée),
  fréquence de vérification (manuelle, mensuelle, trimestrielle), profondeur
  (page seule / sous-pages sélectionnées).
- Changement distant détecté : la ressource passe en « actualisation à
  contrôler ». L'instantané validé n'est **jamais** écrasé automatiquement.
- Aucun HTML brut n'est conservé dans la maquette (`rawHtmlStored: false`) et
  aucun accès réseau n'est effectué (`networkFetchActivated: false`).

## 4. Modes d'usage IA

`ask`, `be_questioned`, `generate_quiz`, `guided_clinical_case`,
`adaptive_review`, `voice`.

- **DFASM Cardiologie** : vocal activé et mis en avant (préparation ECOS).
- **DIU Échocardiographie** : vocal disponible mais jamais lancé par défaut
  (maîtrise des coûts).
- Les deux réglages restent modifiables par l'administrateur du programme.

## 5. Routeur de coûts (documenté, jamais appelé)

Escalade : `none` (contenu validé seul) -> `light_model` -> `advanced_model` ->
`realtime_voice`. Correspondance prévue : questions/QCM = modèle léger, cas
clinique guidé et révision adaptative = modèle avancé, vocal = temps réel.
Aucune requête n'est émise dans cette itération ; quotas, journalisation et
comptabilité des appels sont un prérequis d'activation.

## 6. Ce que la maquette simule aujourd'hui

- Profils IA de démonstration pour tous les supports (couverture 100 % des
  publiés), files « à traiter / à relire / prêts / obsolètes », actions
  Analyser / Relire / Valider pour l'IA / Réindexer / Prévisualiser.
- Indicateur « Couverture IA des contenus publiés » par format.
- Assistant apprenant « Étudier avec l'IA » : réponses fabriquées localement,
  citation systématique, mode vocal purement visuel (aucun microphone).
- Page web HTML de référence DFASM avec instantané validé et alerte
  d'actualisation.

## 7. Prérequis avant activation réelle

1. Validation du schéma Lot 1 et des tables de contenus / instantanés.
2. Stockage privé (aucune écriture client) et provenance immuable.
3. Gateway IA propriétaire, authentification, quotas, journalisation, coûts.
4. Traçabilité du contrôle pédagogique humain avant tout usage apprenant.
