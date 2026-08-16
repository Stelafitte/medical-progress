# Hébergement des contenus pédagogiques — conception (non exécutée)

DRAFT. **Aucun bucket n'est créé**, aucune base n'est activée, aucun fichier n'est
stocké. Ce document fixe la cible avant provisioning.

## 1. Principe

PostgreSQL ne contient **jamais** de binaire. La base porte uniquement :

- les métadonnées d'objet (`public.learning_resource_assets`) ;
- les transcriptions et segments textuels (Lot 3) ;
- l'audit des accès.

Les fichiers vivent dans un stockage objet privé. Aucune **URL publique durable**
n'est stockée ni générée : la table conserve `(storage_provider, bucket_name,
object_path)`, et un `CHECK` refuse un `object_path` ressemblant à une URL absolue.

## 2. Cible initiale

Supabase Storage, **buckets privés**, **région UE**. Aucun bucket public.

| Bucket      | Contenu                                              | Écrivains         |
| ----------- | ---------------------------------------------------- | ----------------- |
| `originals` | fichiers déposés tels quels (vidéo, PDF, DICOM export) | enseignant, admin |
| `derived`   | dérivés techniques (transcodage, vignettes, extraits) | service backend   |
| `evidence`  | pièces jointes de preuves d'apprenants               | apprenant, staff  |
| `documents` | documents administratifs de programme                | admin             |

Séparation par bucket **et** par préfixe : `{program_id}/{resource_id}/{asset_id}`.
Le `program_id` du chemin est redondant avec la FK composite
`lra_resource_same_program` : une fuite inter-programme exigerait de casser les deux.

## 3. Chemin d'accès

1. Le client demande l'accès à un asset au **service backend** (server function).
2. Le backend lit `learning_resource_assets` **avec la RLS de l'utilisateur** :
   si la ligne n'est pas visible (ressource non publiée, autre programme,
   asset non `ready`), la demande s'arrête là.
3. Seulement alors, le backend génère une **URL signée courte** (cible : 60 à 300 s,
   non renouvelable automatiquement, non mise en cache côté CDN).
4. L'accès est journalisé dans `audit_events`.

Les uploads suivent le même schéma inversé : le backend vérifie le droit d'écriture,
crée la ligne de métadonnées en `processing_status = 'pending'`, puis renvoie une
**URL signée d'upload**. Le client n'obtient jamais de credential de bucket.

## 4. RLS des métadonnées

`learning_resource_assets` est protégée par une policy **calquée sur la ressource
parente** (cf. `002_rls_policies.sql` §8) :

- apprenant : ressource publiée **et** asset `ready` **et** inscrit au programme ;
- encadrant de stage : idem (ressources publiées du programme) ;
- enseignant / admin de portée : tous les assets, tous statuts ;
- écriture réservée au staff de portée, `source_system` forcé à `native` ;
- aucun accès `anon`.

## 5. PostgreSQL vs stockage objet

| Donnée                              | Où          |
| ----------------------------------- | ----------- |
| binaire (vidéo, PDF, image)         | bucket privé |
| métadonnées, checksum, statut       | PostgreSQL  |
| transcription, segments             | PostgreSQL  |
| embeddings (`pgvector`)             | PostgreSQL — **Lot 3, non activé au Lot 1** |

`pgvector` est **prévu** pour `source_documents` / `source_segments` au Lot 3.
Aucune extension vectorielle n'est créée au Lot 1, aucune colonne `vector` n'existe
dans `001_core_schema.sql`.

## 6. IA

OpenAI ne reçoit que les **extraits strictement nécessaires** à la tâche demandée,
jamais un corpus complet ni un fichier brut par défaut. Le fournisseur n'est
**jamais source de vérité** : toute donnée exploitée est d'abord persistée et
horodatée côté plateforme, et tout appel est comptabilisé dans `ai_usage_events`
sous le quota de `ai_quota_policies`. Aucun appel IA réel n'existe à ce stade.

## 7. Portabilité

Un adaptateur `StorageProvider` est prévu côté application (interface de port,
au même niveau que les repositories) avec les opérations : `putSignedUploadUrl`,
`getSignedReadUrl`, `delete`, `stat`. L'enum SQL `storage_provider`
(`supabase | s3 | r2`) permet une migration ultérieure vers S3 ou Cloudflare R2 en
région UE **sans changer le modèle** : seules les lignes concernées changent de
`storage_provider`.

## 8. À définir explicitement avant toute mise en production

- sauvegarde **chiffrée**, indépendante du fournisseur de stockage, testée en restauration ;
- durées de rétention par bucket (originaux, dérivés, preuves, documents) ;
- procédure de suppression (effacement réel côté objet + trace d'audit conservée) ;
- politique d'analyse antivirus / quarantaine (`processing_status = 'quarantined'`) ;
- registre de traitement et base légale pour les données d'apprenants ;
- audit d'accès aux fichiers : volumétrie, durée de conservation des traces.

Aucun de ces points n'est implémenté. Aucun bucket ne doit être créé avant leur
validation.
