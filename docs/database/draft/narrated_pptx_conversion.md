# Pipeline de conversion des PowerPoint sonorisés (DRAFT — non activé)

Statut : conception. Aucun stockage, aucune file d'exécution, aucun service de
conversion et aucune migration ne sont activés. La maquette applicative n'ouvre,
ne convertit, ne stocke ni ne transmet aucun fichier.

## Décision fonctionnelle

Le format cible distribué aux apprenants est un **lecteur web HTML5 synchronisé**
(images de diapositives + pistes audio + transcription + sommaire), et non le
PPTX source. Un MP4 de secours reste optionnel, réservé aux cas d'accessibilité
ou de téléchargement encadré, jamais exposé par défaut.

## Étapes du pipeline

| # | Étape (`conversion_step`) | Rôle | Sortie attendue |
|---|---------------------------|------|-----------------|
| 1 | `upload` | dépôt du PPTX par l'enseignant | paquet source privé |
| 2 | `analysis` | inventaire des diapositives, pistes audio, notes, polices | pré-contrôle |
| 3 | `slide_render` | rendu image de chaque diapositive | images web |
| 4 | `audio_extract` | extraction/normalisation des pistes audio | audio par diapositive |
| 5 | `transcript` | transcription et alignement temporel | transcription |
| 6 | `packaging` | assemblage du lecteur web (+ MP4 optionnel) | artefact web |
| 7 | `review` | validation humaine par l'équipe pédagogique | artefact validé |
| 8 | `publication` | mise à disposition selon visibilité et fenêtre | artefact publié |

## Statuts de conversion

`not_required`, `awaiting_upload`, `queued`, `analyzing`, `converting`,
`review_required`, `ready`, `failed`.

Règles :

- `ready` exige un artefact web validé **et** une revue humaine explicite.
- `review_required` est imposé si des alertes bloquantes subsistent
  (diapositive sans commentaire, audio absent, polices non embarquées,
  transcription incomplète).
- `failed` conserve le journal des étapes pour rejeu ; aucune donnée apprenant
  n'est impactée.
- Un support non `slides_audio` reste `not_required`.

## Isolation du fichier source

- Le paquet source (nom de fichier, chemin, taille, MP4 de secours) n'est
  accessible qu'à l'équipe pédagogique et à l'administration.
- Le DTO apprenant (`LearnerNarratedDeck`) ne contient jamais de référence au
  source ; il expose uniquement diapositives, durées, chapitres et, si
  autorisée, la transcription. Ce contrat est verrouillé par test unitaire.
- Prévu côté base : buckets privés distincts `narrated-source` (écriture
  serveur uniquement, `service_role`) et `narrated-web` (lecture via URL
  signée courte selon la visibilité du support). Aucun bucket n'est créé.

## Modèle de données envisagé (non migré)

- `narrated_decks` : support, cible de conversion, statut, options, horodatages
  serveur.
- `narrated_deck_sources` : paquet source, écriture serveur exclusivement.
- `narrated_deck_artifacts` : artefact web, nombre de diapositives, durée
  totale, présence de transcription, état `draft|ready|published`.
- `narrated_deck_slides` : index, titre, durée, présence de commentaire,
  transcription.
- `narrated_deck_chapters` : sommaire (titre, diapositive de départ).
- `narrated_deck_steps` : journal append-only des étapes, avec état et note.

Invariants prévus par trigger : journal append-only, transition de statut
contrôlée, publication interdite sans revue humaine enregistrée, immuabilité de
l'artefact publié (nouvelle version au lieu d'une modification).

## Traçabilité et audit

Chaque transition et chaque action (relancer l'analyse, régénérer la
transcription, valider, publier, remplacer le source) est destinée à produire un
`AuditEvent` avec auteur, horodatage serveur et statut avant/après. Dans la
maquette, ces actions n'affichent qu'un message explicitement simulé.
