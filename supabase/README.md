# Socle Supabase — Campus Santé Augmenté

Ce dossier est la première base **exécutable et versionnée** du backend. Il est
indépendant de Lovable : Lovable reste l'éditeur de l'interface React et ne
porte ni les secrets, ni les fichiers sources, ni la conversion PPTX.

## État de ce lot

- configuration locale Supabase ;
- migrations du noyau identité/programmes/promotions/inscriptions/rôles ;
- ressources pédagogiques, métadonnées d'objets et pipeline PPTX ;
- RLS fermée par défaut et buckets privés déclarés par migration ;
- projet de développement `campus-sante-augmente-dev` provisionné en Europe de l'Ouest ;
- quatre migrations appliquées et contrôlées par `supabase db lint --linked` ;
- aucun secret réel commité ;
- aucun environnement staging/production et aucun worker de conversion déployé.

## Environnements

Utiliser trois projets Supabase séparés : `development`, `staging`,
`production`. Ne jamais employer la base Lovable comme source de vérité. Les
mêmes migrations sont appliquées dans chaque environnement par CI, dans cet
ordre : développement, recette, puis production après validation humaine.

## Démarrage local

Prérequis : Docker et la CLI Supabase.

```powershell
supabase start
supabase db reset
supabase status
```

Copier `.env.example` vers `.env.local` et y reporter les valeurs locales
affichées par `supabase status`. `.env.local` ne doit jamais être commité.

## Règles de sécurité

1. `service_role` n'est utilisé que par des fonctions serveur et le worker.
2. Le navigateur ne choisit jamais un chemin de stockage.
3. Tous les buckets sont privés ; le lecteur reçoit des URL signées courtes.
4. Le PPTX source n'est jamais exposé à l'apprenant.
5. Les écritures privilégiées revérifient le rôle métier avant d'utiliser
   `service_role`, car cette clé contourne la RLS.
6. Les migrations déjà appliquées ne sont jamais réécrites : toute évolution
   est une nouvelle migration additive.

## Pipeline cible

```text
client coordinateur
  -> demande d'upload autorisée côté serveur
  -> URL signée vers pptx-sources
  -> création d'un conversion_job
  -> worker isolé (LibreOffice + FFmpeg + transcription)
  -> course-artifacts privés
  -> revue humaine
  -> publication
  -> manifest expurgé + URL signées pour l'apprenant
```

Le worker lourd est volontairement extérieur aux Edge Functions Supabase.
