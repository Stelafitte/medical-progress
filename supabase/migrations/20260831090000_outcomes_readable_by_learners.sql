-- Un apprenant inscrit peut lire le referentiel de son programme.
--
-- Contexte : outcomes_select (20260828090000, reconduite telle quelle par
-- 20260830090000_lock_reconstructed_grants) reserve la lecture a
-- is_program_staff. La note laissee dans 20260827093000 disait vrai a
-- l'epoque : « aucun ecran apprenant ne consomme ce referentiel dans cette
-- iteration ». Ce n'est plus le cas — useLearnerPassport appelle listOutcomes,
-- et le Passeport de la V1 DFASM est entierement construit dessus.
--
-- Sans cette policy, l'espace apprenant est vide SANS ERREUR, ce qui est pire
-- qu'une panne : le tableau de bord affiche « Tous les jalons sont atteints. »
-- sur zero jalon, et l'ecran Ressources montre l'UUID brut des acquis au lieu
-- de leur libelle.
--
-- Portee volontairement plus etroite que celle du staff : l'apprenant voit le
-- PARCOURS, pas le referentiel de travail du concepteur. Un acquis present
-- dans le programme mais hors parcours (retained_at nul) ou archive
-- (archived_at non nul) lui reste invisible. Les trois etats d'un acquis sont
-- decrits dans 20260830110000_outcome_retained.sql.
--
-- assessment_modalities n'est deliberement PAS ouvert ici : la V1 DFASM ne
-- comporte aucune evaluation, donc la note de 20260827093000 reste exacte pour
-- cette table. Elle sera a revoir le jour ou un ecran apprenant la consommera.

drop policy if exists outcomes_select on public.outcomes;

create policy outcomes_select on public.outcomes
for select
using (
  public.is_program_staff(program_id)
  or (
    retained_at is not null
    and archived_at is null
    and public.is_enrolled_in_program(program_id)
  )
);
