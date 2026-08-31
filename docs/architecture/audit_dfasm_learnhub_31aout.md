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

## Les vidéos : introuvables pour l'instant

**Correction du 31/08, après lecture des données.** J'avais affirmé que les vidéos de Stef
étaient des liens externes stockés dans `pedagogical_content`. C'était une déduction tirée
de la **forme du formulaire** lue dans le paquet JavaScript — `content_type` accepte
`video`, et le champ propose `https://www.youtube.com/watch?v=…` en exemple — et non des
données. Lecture faite, la table contient **18 lignes : 11 `text`, 7 `link`, zéro `video`**.

Leçon : le paquet public donne la forme, jamais le contenu. Ne pas conclure de l'un à
l'autre.

Pistes restantes, par ordre de vraisemblance :

1. **Les 7 lignes `link`** — une vidéo YouTube saisie dans un champ « Lien » ressort en
   `link`, pas en `video`. À lire en premier, avec leurs URL complètes.
2. **Le seau `pedagogical-documents`**, qui peut contenir des fichiers vidéo malgré son nom.
3. **Les ECOS**, qui emploient de l'avatar animé (`useLiveAvatarSandbox`,
   `liveavatar-session`) — peut-être ce dont Stef se souvient.
4. **Une autre plateforme** : Stef en a plusieurs.

Si des vidéos existent sous forme de liens, leur intégration reste triviale : la Médiathèque
de Campus porte `resource_format` = `video` / `link` et `external_url` depuis le 29/08. Mais
c'est à vérifier, plus à supposer.

## Comment lire ces données — et comment NE PAS s'y prendre

**myDFASM a été construit dans Lovable et son backend est géré par Lovable : ces tables
n'existent pas dans l'organisation Supabase de Stef.** Il n'y a donc pas d'éditeur SQL à
ouvrir comme pour Campus. Précision donnée par Stef le 31/08, après une première proposition
erronée de ma part.

La voie praticable est **l'application elle-même** : elle sait lire ses tables, et Stef y est
administrateur. Il se connecte — jamais Claude, qui ne manipule aucun identifiant — puis les
écrans `/admin/competencies` et `/content-management` affichent respectivement le référentiel
de compétences et les contenus, vidéos comprises. Le contenu se lit alors depuis la page.

Deux autres voies, si celle-là ne suffit pas : demander à Lovable, dans son propre fil de
conversation, d'exporter une table en CSV ; ou brancher le dépôt GitHub du projet, s'il est
synchronisé, pour lire les migrations et les données de départ.

## Ce qu'il faut en tirer

Trois choses : `competencies` (combien, quelle forme, générique ou spécialisé),
`pedagogical_content` filtré sur les vidéos (combien, quelles URL), et l'échelle réellement
employée dans `student_competencies`. Une demi-heure, et elle évite des semaines de
reconstruction.
