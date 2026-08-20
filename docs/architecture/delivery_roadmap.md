# Campus Santé Augmenté — feuille de route de transformation

Statut : **ordre d’exécution recommandé**, sans calendrier contractuel. Chaque
jalon doit être démontré en recette avant d’ouvrir le suivant à des utilisateurs
réels.

## Principes de livraison

- priorité fonctionnelle : **DIU**, puis **DFASM**, puis approfondissement DPC ;
- une seule architecture multi-programmes ;
- migrations additives et réversibles tant que possible ;
- aucune bascule globale « mocks vers production » ;
- les détails esthétiques non bloquants restent dans un backlog séparé ;
- une tranche est terminée uniquement avec sécurité, tests et exploitation.

## Phase 0 — fondations et décisions

Objectif : rendre les choix structurants opposables avant le provisioning.

- valider `product_target.md` et le vocabulaire commun ;
- fermer les questions bloquantes du journal de décisions ;
- nommer le propriétaire du projet Supabase indépendant et choisir la région ;
- fixer les environnements `development`, `staging`, `production` ;
- définir RPO/RTO, sauvegardes, rétention et procédure de sortie ;
- inventorier les données réellement nécessaires et interdire les données
  patient dans les imports pédagogiques ;
- convertir les brouillons SQL en migrations ordonnées seulement après revue.

Critère de sortie : architecture validée, responsabilités nommées, aucune
question de sécurité structurante reportée au développement.

## Phase 1 — socle réel DIU

Objectif : authentifier et cloisonner une première cohorte DIU.

- Supabase indépendant de Lovable ;
- personnes et comptes séparés, invitations, activation et suspension ;
- programme, version, implémentation, cohorte, inscription et rôles de portée ;
- import CSV/TSV réel avec aperçu, dédoublonnage et rapport de lignes ;
- annuaire coordinateur limité à sa portée ;
- audit des actions d’administration ;
- adaptateurs de repositories Supabase derrière les ports existants.

Critère de sortie : deux cohortes et deux programmes de recette prouvent qu’un
utilisateur autorisé ne lit ni ne modifie le périmètre voisin.

## Phase 2 — contenus DIU et PPTX sonorisé

Objectif : remplacer la démonstration PPTX par le premier flux pédagogique réel.

- dépôt direct, multipart/reprenable, vers un bucket privé ;
- enregistrement du fichier, empreinte, version et travail de conversion ;
- worker externe : diapositives fidèles, audio, durées, manifeste, transcription ;
- suivi `queued/running/review_required/ready/failed` avec reprise idempotente ;
- écran de contrôle humain avant publication ;
- lecteur sécurisé avec URLs courtes et sans accès au PPTX source ;
- événements de lecture et preuve de consultation définie pédagogiquement ;
- tableau individuel et agrégats de cohorte calculés depuis les événements.

Critère de sortie : un vrai PPTX de 50–100 Mo est déposé, converti, contrôlé,
publié et lu sur ordinateur et smartphone par un compte inscrit uniquement.

## Phase 3 — ressources et parcours DIU

Objectif : compléter le parcours DIU au-delà du seul diaporama.

- PDF, HTML validé, vidéo/lien et bibliographie dans le même cycle éditorial ;
- calendrier et jalons de l’implémentation ;
- QCM/tentatives et correction protégée côté serveur ;
- attestations, exports et cockpit coordinateur ;
- communications préparées automatiquement depuis le calendrier, avec
  approbation et historique d’envoi ;
- accessibilité et optimisation responsive du lecteur et des parcours.

Critère de sortie : une cohorte DIU peut suivre son parcours complet sans fixture
fonctionnelle dans les écrans concernés.

## Phase 4 — extension DFASM

Objectif : réutiliser le socle et activer les besoins propres au DFASM.

- référentiels de connaissances et compétences ;
- stages, affectations et responsables de stage ;
- carnet, preuves minimisées et validations tierces append-only ;
- ECOS textuel puis vocal, avec consentement et quotas ;
- plan d’acquisition, retards et supervision individuelle/collective ;
- exigences mobiles renforcées pour l’usage sur le terrain.

Critère de sortie : aucune règle DFASM ne contourne les abstractions communes et
aucune compétence réelle ne peut être auto-validée.

## Phase 5 — industrialisation DPC

Objectif : connecter les modèles DPC déjà préparés au backend commun.

- import documentaire et validation humaine d’un programme ;
- implémentations planifiées avec modules indépendants ;
- audits multi-dossiers et multi-tours distincts des QCM ;
- comparaison déterministe puis synthèse personnalisée traçable ;
- règles d’achèvement, présences et justificatifs ;
- communications et relances dérivées du calendrier ;
- exports et exigences réglementaires validés humainement.

Critère de sortie : un programme avec audit et un programme sans audit utilisent
le même moteur, sans branche codée spécifiquement pour HVG–Amylose.

## Phase 6 — exploitation et passage à l’échelle

- supervision des files, conversions et envois ;
- budgets et quotas par programme ;
- tests de restauration et plan de continuité ;
- analyse de vulnérabilités, pentest et revue des fournisseurs ;
- purge automatique vérifiée ;
- observabilité fonctionnelle et technique ;
- procédure de migration hors Lovable et hors fournisseur documentée.

## Backlog distinct

Ces sujets ne doivent pas bloquer les phases 0–2 sauf défaut d’utilisabilité :

- réduction fine des boutons mobiles du lecteur ;
- enrichissements graphiques secondaires ;
- automatisations DPC avancées ;
- IA vocale généralisée ;
- connecteurs institutionnels non nécessaires au pilote DIU.

