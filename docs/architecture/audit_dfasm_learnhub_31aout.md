# Audit de la plateforme existante — myDFASM (dfasm-learnhub)

Fait le 31/08/2026 à la demande de Stef, qui se souvenait d'y avoir mis des vidéos sur les
compétences. Audit **non intrusif** : lecture des routes déclarées dans le projet Lovable et
du paquet JavaScript public de l'application. Aucune connexion, aucun identifiant employé,
aucune donnée d'étudiant consultée.

- Application : `https://dfasm-learnhub.lovable.app` — « myDFASM », inscriptions soumises à
  validation par un administrateur.
- Projet : `lovable.dev/projects/e3860f5b-091d-4d36-ae37-c2899be8ecdd`, branche `main`.

**Note au passage** : l'aperçu Lovable fonctionne de nouveau. La panne de génération notée
le 26/08 (`lovable_sync_29aout`) est résolue.

## Le constat qui compte

**Une partie de ce que Campus Santé Augmenté reconstruit existe déjà ici, en service.**

Routes déclarées :

```
/                       /auth                /dashboard
/block-1 … /block-4     /contact             /ecos   /ecos/:slug
/mon-stage              /progress-tracking
/promotions             /promotions/:id      /promotions/:id/students/:studentId
/content-management     /admin               /admin/competencies
/admin/ecos             /ecos-admin          /ecos-admin/:id[/preview]
```

`/mon-stage`, `/progress-tracking`, `/promotions`, `/admin/competencies` : le stage, le
suivi de progression, les promotions avec leurs étudiants, et un référentiel de compétences.
Ce sont, sous d'autres noms, les objets du passeport V1.

## Le modèle de données

Tables lues dans le paquet public :

| table | ce qu'elle porte, selon toute vraisemblance |
|---|---|
| `competencies` | le référentiel de compétences |
| `student_competencies` | le suivi par étudiant — **l'équivalent d'`outcome_self_reports`** |
| `pedagogical_content` | les cours, documents **et vidéos** |
| `content_progress`, `content_ratings` | avancement et avis sur un contenu |
| `promotions`, `promotion_students` | les promos et leurs étudiants |
| `profiles`, `user_roles`, `registration_requests` | comptes, rôles, demandes d'inscription |
| `student_notes`, `student_summary` | notes et synthèse par étudiant |
| `ecos_cases`, `ecos_assets`, `ecos_evaluation_items`, `ecos_knowledge_items` | les ECOS |
| `app_settings` | réglages |

Seaux de stockage : `pedagogical-documents`, `student-photos`.

Champs repérés autour des compétences et des contenus : `competency_id`, `code`, `title`,
`description`, `category`, `domain`, `block`, `specialty`, `level`, `order_index`,
`position`. Les niveaux comportent au moins `avance` et `expert` — donc une échelle
graduée, pas un booléen.

Deux points saillants :

- **`block` et `category`** organisent les contenus (cohérent avec les routes `/block-1` à
  `/block-4`). C'est une **hiérarchie**, exactement ce qui manque à nos `outcomes`, plats.
- **`specialty`** distingue déjà le générique du spécialisé — la question que Stef pose ce
  soir sur les compétences DFASM générales et cardiologiques.

## Les vidéos : intégrables, et sans rien inventer

`pedagogical_content` porte un `content_type` dont les valeurs incluent `video`, `pdf`,
`document` et `Lien`, plus les colonnes `video_url` et `file_url`. Les vidéos sont donc des
**liens externes** (le formulaire propose `https://www.youtube.com/watch?v=…` comme
exemple), pas des fichiers déposés — le seau `pedagogical-documents` sert aux PDF.

**Conséquence : l'intégration est une simple reprise de données, pas un chantier.** La
Médiathèque de Campus Santé Augmenté porte déjà ce qu'il faut depuis le 29/08 —
`resource_format` accepte `video` et `link`, et `external_url` existe
(`20260829090000_mediatheque_external_url_and_links`). Une vidéo de myDFASM devient une
`learning_resource` de format `video` avec son `external_url`, rattachable ensuite aux
acquis comme n'importe quel support.

Ce qui manque pour le faire : **l'accès en lecture au Supabase de myDFASM**. Le paquet
public donne la forme, pas le contenu.

## Ce que cet audit change

1. **Ne pas chercher un référentiel de compétences sur internet avant d'avoir lu la table
   `competencies`.** Stef avait oublié les vidéos ; il a peut-être aussi déjà une liste de
   compétences construite et éprouvée. Lui rendre une liste trouvée ailleurs alors que la
   sienne existe serait du travail perdu, et pire, une source de confusion.
2. **La hiérarchie `block` / `category` conforte le besoin d'un `parent_outcome_id`** côté
   Campus — c'est exactement ce que Stef demande pour n'afficher que les titres de chapitres
   à l'étudiant.
3. **`student_competencies` est un précédent à lire** avant de finir le passeport : cet
   écran a déjà été utilisé par de vrais étudiants. Ce qui y a marché et ce qui n'y a pas
   marché vaut plus qu'une intuition.

## Étape suivante proposée

Ouvrir le tableau de bord Supabase du projet myDFASM et lire trois choses :
`competencies` (combien, quelle forme, générique ou spécialisé), `pedagogical_content`
filtré sur `content_type = 'video'` (combien de vidéos, quelles URL), et `student_competencies`
(l'échelle réellement employée). Une demi-heure, et elle évite des semaines de reconstruction.
