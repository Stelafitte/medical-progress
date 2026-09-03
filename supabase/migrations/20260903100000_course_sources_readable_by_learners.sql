-- Rendre lisibles a l'apprenant les fichiers deposes dans `course-sources`.
--
-- CE QUI MANQUAIT. Les trois seaux de Campus sont prives, et chacun porte sa
-- propre regle de lecture. `course-artifacts` prevoit deja le cas de
-- l'apprenant : le staff, OU un acquis non-`source` dont le support est
-- lisible. `course-sources`, lui, n'avait qu'une seule branche,
-- `is_program_staff`. Consequence mesuree le 03/09 : une video televersee
-- depuis « Ajouter un support » atterrit dans `course-sources` avec
-- `kind = 'source'`, et AUCUN etudiant ne peut la lire. Pas seulement
-- « le lecteur ne l'affiche pas » : Supabase applique la RLS AVANT de signer,
-- donc `createSignedUrls` echoue aussi. Le fichier est inatteignable.
--
-- LA REGLE RETENUE : C'EST LE SUPPORT QUI DECIDE, PAS LE SEAU. C'est deja la
-- regle de `course-artifacts` ; on l'aligne, on n'invente rien.
-- `can_read_resource` verifie trois choses, et elles suffisent :
--   * le support est PUBLIE (`is_published`),
--   * sa visibilite est `cohort` ou `program` (jamais `staff_only`),
--   * l'etudiant est INSCRIT au programme.
-- Un PDF laisse en `staff_only` reste donc invisible, exactement comme avant.
-- Rien ne s'ouvre par accident : il faut un geste explicite de publication.
--
-- POURQUOI `processing_status = 'ready'` SUR LA SEULE BRANCHE APPRENANT.
-- `register_learning_resource_asset` pose deja 'ready' a l'insertion, la
-- condition est donc satisfaite par construction pour un televersement normal.
-- Elle protege du reste : un asset marque 'deleted' ou 'failed' cesse d'etre
-- servi a l'etudiant sans qu'on ait a effacer l'objet. Le staff, lui, garde
-- l'acces quel que soit le statut — c'est ce qui permet de diagnostiquer un
-- fichier casse. C'est la meme asymetrie que sur `course-artifacts`.
--
-- LE NOM DE LA POLITIQUE CHANGE. `storage_staff_read_course_sources` serait
-- devenu un mensonge : elle ne sert plus le seul staff. On la remplace par
-- `storage_scoped_read_course_sources`, du nom de sa jumelle sur les artefacts.

drop policy if exists storage_staff_read_course_sources on storage.objects;

create policy storage_scoped_read_course_sources on storage.objects
for select to authenticated
using (
  bucket_id = 'course-sources'
  and exists (
    select 1
    from public.learning_resource_assets a
    where a.bucket_name = storage.objects.bucket_id
      and a.object_path = storage.objects.name
      and a.kind in ('source', 'illustration')
      and (
        public.is_program_staff(a.program_id)
        or (
          a.processing_status = 'ready'
          and public.can_read_resource(a.resource_id)
        )
      )
  )
);

comment on policy storage_scoped_read_course_sources on storage.objects is
  'Lecture d''un fichier de course-sources : le staff du programme sans condition, '
  'ou tout apprenant inscrit lorsque le support est publie et sa visibilite '
  'ouverte (can_read_resource). C''est le support qui decide, pas le seau.';
