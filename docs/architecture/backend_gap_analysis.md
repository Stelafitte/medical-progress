# Écarts entre la maquette et le backend cible

Statut : **audit de conception au 20 août 2026**. Cette matrice interdit de
promouvoir directement `docs/database/draft/001_core_schema.sql` en production :
le brouillon doit d’abord intégrer les décisions produit plus récentes.

| Capacité | Domaine TypeScript / maquette | Brouillon SQL actuel | Action avant migration |
| --- | --- | --- | --- |
| Personne distincte du compte | `directory.ts` sépare `DirectoryPerson` et `UserAccount` | `profiles.id = auth.users.id` impose un 1–1 | introduire `people` et liaison nullable vers `auth.users`; décider les comptes sans connexion |
| Programme versionné | modèles cœur + `dpcProgram.ts` | `programs`, `curriculum_versions` présents | conserver, aligner vocabulaire et états |
| Implémentation réelle | explicite pour le DPC, nécessaire transversalement | absente comme agrégat générique | ajouter `program_implementations`, modules, règles et calendrier communs |
| Cohorte et inscription | annuaire générique | présents, mais inscription liée directement au programme/cohorte | rattacher l’inscription à l’implémentation exacte et verrouiller les FK composites |
| Rôles contextualisés | `RoleAssignment` | modèle et helpers RLS avancés | adapter les FK à `people`; conserver les scénarios négatifs |
| Annuaire/import | création, retrait, archivage simulés | persistance et invitation incomplètes | définir commandes serveur idempotentes et journalisées |
| Ressources versionnées | médiathèque et pipeline PPTX | ressource + assets génériques présents | ajouter versions éditoriales, travaux, manifeste et publication par implémentation/cohorte |
| Conversion PPTX | POC local réel + lecteur | métadonnées d’asset seulement | ajouter uploads, conversion jobs, dérivés, contrôle humain et purge source |
| Consultation et progression | lecteur simulé | preuves génériques, pas d’événements de lecture détaillés | définir événements minimaux, agrégation et règle pédagogique de complétude |
| QCM | protection de correction au domaine | tentative détaillée absente du Lot 1 | modéliser tentatives/réponses côté serveur avant branchement UI |
| Audits DPC | programmes/grilles/tours/comparaison au domaine | absent du cœur SQL | traiter en Phase 5 sans contaminer les QCM ni le socle DIU |
| Communications | domaine générique et assistant simulé | anciens objets seulement évoqués | modéliser campagnes, audiences figées, approbations, planification et tentatives |
| Calendrier | DPC déterministe | absent transversalement | unifier activités synchrones/asynchrones et fuseaux horaires |
| ECOS et vocal | maquette DFASM | non modélisé | différer à la Phase 4, avec consentements et budgets |
| IA documentaire | profils et instantanés conçus | événements/quota partiels | garder le fournisseur derrière un port et tracer version/source/citations |
| Gouvernance fichiers | documentation privée | buckets non créés | appliquer la politique de rétention après validation humaine |

## Ordre de résolution du schéma

1. identité `people` / compte `auth.users` ;
2. programme / version / implémentation / cohorte / inscription ;
3. rôles et helpers RLS adaptés à cette chaîne ;
4. ressources versionnées et publication contextualisée ;
5. assets, uploads et travaux asynchrones ;
6. événements de consultation et progression dérivée ;
7. domaines suivants par phase de la feuille de route.

## Règle de transition des repositories

Chaque repository doit pouvoir être fourni par l’adaptateur mock ou Supabase,
mais un écran donné ne mélange pas les deux pendant une même session. Si le
backend d’une tranche est indisponible, l’écran de recette affiche une erreur
explicite ; il ne revient pas silencieusement à une fixture qui donnerait une
fausse impression de persistance.

## Points à faire valider humainement avant provisioning

- une personne peut-elle exister sans compte de connexion ? Proposition : oui,
  pendant une phase d’invitation ou pour un intervenant externe ;
- une cohorte appartient-elle toujours à une seule implémentation ? Proposition :
  oui pour le pilote, avec groupes internes si nécessaire ;
- politique finale de conservation des PPTX : proposition 30 jours après
  validation, sauf conservation explicite ;
- propriétaire juridique et technique des environnements Supabase ;
- région, sauvegarde, restauration, RPO/RTO et procédure de réversibilité ;
- définition exacte d’une « consultation achevée » pour le DIU.

