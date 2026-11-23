-- 23/11 -- LIENS D'INVITATION SANS EXPIRATION PRATIQUE (demande de Stef)
--
-- Constat : des etudiants du groupe B (DFASM-CARDIO) ouvrent leur courriel plus de 7 jours
-- apres l'envoi et trouvent « lien expire ».
-- Decision de Stef : duree illimitee. claim-invitation compare `expires_at` a l'instant du
-- clic ; on repousse donc la valeur par defaut a 100 ans (« infinity » serait lu comme une
-- date invalide par new Date()).
-- Garde-fous conserves : un nouvel envoi revoque les liens precedents de la meme adresse ;
-- le jeton reste personnel, seule son empreinte SHA-256 est stockee.
-- N'affecte QUE les liens crees apres cette migration. REJOUABLE.

alter table public.invitation_links
  alter column expires_at set default now() + interval '100 years';
