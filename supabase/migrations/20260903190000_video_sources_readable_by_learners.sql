-- L'autre moitie du correctif du 03/09 : ouvrir la LIGNE de l'asset, et pas
-- seulement l'objet dans le seau.
--
-- CE QUI RESTAIT CASSE. La migration 20260903100000 a ouvert la lecture des
-- objets de `course-sources` aux apprenants, en s'appuyant sur une sous-requete
-- vers `public.learning_resource_assets`. Mesure du 03/09 au soir : les
-- 4 videos de competence restaient INJOUABLES, et l'ecran affichait « Aucun
-- fichier n'est disponible pour ce support ».
--
-- LA CAUSE. La policy de la TABLE `learning_resource_assets` porte
--   `kind <> 'source' and processing_status = 'ready' and can_read_resource(...)`
-- Un apprenant ne voit donc JAMAIS la ligne d'un asset `source`. Or la
-- sous-requete de la policy de stockage s'execute avec les droits de l'appelant :
-- elle ne trouve rien, et le seau refuse a son tour. La porte du seau etait
-- ouverte, mais la ligne qui la commande restait invisible. Ouvrir l'une sans
-- l'autre ne sert a rien -- et c'est exactement le genre de panne qui ne leve
-- aucune erreur : `createSignedUrls` rend simplement un lien de moins.
--
-- POURQUOI `kind <> 'source'` EXISTAIT, ET POURQUOI ON NE LE SUPPRIME PAS.
-- Pour un diaporama commente, le `source` est le PPTX d'AUTEUR : on distribue
-- la lecture en ligne, jamais le fichier qui a servi a la fabriquer. La regle
-- est bonne ; elle est juste trop large. Pour une video, le fichier source EST
-- le contenu pedagogique. Il n'existe aucun rendu derive a servir a sa place :
-- l'exclure revient a rendre le support inutile.
--
-- LA REGLE RETENUE : C'EST LE FORMAT DU SUPPORT QUI DECIDE. C'est la meme
-- phrase que le 03/09 au matin -- « c'est le SUPPORT qui decide, pas le seau » --
-- appliquee un cran plus bas. Deux formats seulement sont ouverts, et ils le
-- sont parce que leur fichier source est le livrable lui-meme :
--   * `video` : la video est le cours ;
--   * `pdf`   : le document est le cours.
-- `narrated_slides` reste ferme (le PPTX d'auteur), `other` aussi (les
-- 22 chapitres SFC, dont le contenu est servi par `learning_resource_texts`,
-- jamais par leur archive d'import). Ajouter un format a cette liste doit
-- rester un geste explicite, discute -- pas un effet de bord.
--
-- LE RESTE DES GARDE-FOUS EST INCHANGE : `can_read_resource` exige que le
-- support soit publie, non `staff_only`, et l'etudiant inscrit au programme ;
-- `processing_status = 'ready'` cesse de servir un asset casse ou supprime sans
-- qu'on ait a effacer l'objet. Le staff garde l'acces quel que soit le statut,
-- c'est ce qui permet de diagnostiquer un fichier casse.

drop policy if exists learning_resource_assets_select_scoped
  on public.learning_resource_assets;

create policy learning_resource_assets_select_scoped
on public.learning_resource_assets
for select to authenticated
using (
  public.is_program_staff(program_id)
  or (
    processing_status = 'ready'
    and public.can_read_resource(resource_id)
    and (
      kind <> 'source'
      or exists (
        select 1
        from public.learning_resources r
        where r.id = learning_resource_assets.resource_id
          and r.format in ('video', 'pdf')
      )
    )
  )
);
