-- Archive les six modalites d'evaluation saisies le 29/08 sur DFASM-CARDIO.
--
-- POURQUOI. Ces six lignes decrivaient ce que la plateforme savait executer,
-- pas ce que l'etudiant rencontre pendant son stage (Stef, 14/09 : « tout ce
-- pave est faux »). Trois etaient mal classees faute de format adequat a
-- l'epoque (les deux ECOS en « simulation », le journal de stage en « cas
-- clinique commente »), une etait en double, une promettait une interaction
-- vocale que le hub simule. Depuis le 14/09 le Concepteur propose un catalogue
-- de dix-sept modalites avec les bons formats : ce qui est vrai se recoche en
-- deux clics.
--
-- REVERSIBLE. Aucune suppression : `archived_at` se remet a null.
--   update public.assessment_modalities set archived_at = null
--    where program_id = (select id from public.programs where code = 'DFASM-CARDIO')
--      and archived_at::date = current_date;
--
-- Les six intitules sont nommes un par un : rien d'autre ne peut etre touche.
update public.assessment_modalities
   set archived_at = now()
 where program_id = (select id from public.programs where code = 'DFASM-CARDIO')
   and archived_at is null
   and name in (
     'ECOS simulé',
     'ECOS simulés',
     'Journal de stage',
     'QCM',
     'Cas cliniques progressifs',
     'Interaction vocale'
   )
 returning name, subtype, usage, archived_at;
