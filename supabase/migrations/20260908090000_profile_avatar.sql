-- PHOTO DE PROFIL — le seau, la colonne, les policies de stockage.
--
-- POURQUOI. Stef, 08/09 : « dans mon profil il faut fonction ajouter photo
-- profil […] cela pourrait permettre de suivre les etudiants ». L'avatar
-- affiche jusqu'ici est un rond de degrade portant les initiales : il ne
-- distingue pas deux etudiants aux memes initiales, et ne dit rien a un
-- encadrant qui ouvre une fiche.
--
-- CE QUE L'AUDIT DU 08/09 A ETABLI, avant d'ecrire quoi que ce soit :
-- - `public.profiles` est la table reliee a l'authentification
--   (`profiles_id_fkey -> auth.users`), RLS active, deux policies :
--   `profiles_select_scoped` (using `can_read_profile(id)`) et
--   `profiles_update_self` (using et check `id = auth.uid()`).
-- - `public.people` est autre chose : le vivier du programme, avec les
--   invitations et les statuts. La photo n'y va pas.
-- - Aucune colonne d'avatar n'existait nulle part. La seule qui y ressemblait,
--   `stage_log_templates.photo_policy`, regle les photos de stage.
-- - Trois seaux, tous prives : `course-sources`, `course-artifacts`,
--   `pptx-sources`. Pas d'`avatars`.
-- - `storage.objects` ne portait QUE TROIS POLICIES, TOUTES EN SELECT. Aucun
--   chemin d'ecriture client vers le stockage n'existait : tout passait par le
--   service role. Cette migration ouvre le premier, et c'est la raison pour
--   laquelle il est borne aussi etroitement.
--
-- AUCUNE POLICY DE TABLE N'EST CREEE. La colonne est ajoutee a `profiles`, donc
-- elle herite des deux policies deja en place : chacun ecrit la sienne, et la
-- lecture suit exactement la portee de la fiche. Un encadrant qui peut deja
-- lire la fiche d'un etudiant voit sa photo ; personne d'autre.

begin;

-- LE SEAU EST PRIVE, comme les trois autres. Une photo de personne n'a rien a
-- faire en acces libre : la lecture passera par une URL signee, comme les
-- figures du referentiel. 2 Mo et trois types d'image : le plafond et la liste
-- blanche sont poses ici, en base, et pas seulement dans le navigateur — un
-- controle cote client seul ne controle rien.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

alter table public.profiles add column if not exists avatar_path text;

comment on column public.profiles.avatar_path is
  'Chemin de la photo dans le seau prive avatars, au format <profile_id>/<fichier>. Lecture par URL signee. Herite de profiles_select_scoped et profiles_update_self.';

-- LA CONVENTION DE CHEMIN EST CE QUI TIENT LA SECURITE : `<profile_id>/<fichier>`.
-- Le premier segment du chemin EST l'identifiant du proprietaire, donc les
-- policies ci-dessous se lisent sur le nom de l'objet, sans jointure.

-- LECTURE : la meme portee que la fiche elle-meme. On reutilise
-- `can_read_profile(uuid)`, exactement comme `profiles_select_scoped` — si la
-- regle de visibilite des fiches change un jour, la photo suit sans qu'on ait
-- a y penser.
create policy avatars_read_scoped on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and can_read_profile(((storage.foldername(name))[1])::uuid)
  );

-- ECRITURE : son propre dossier, et rien d'autre. Trois policies distinctes
-- plutot qu'une seule en `all` : `update` exige un `using` ET un `with check`,
-- faute de quoi on pourrait deplacer un objet HORS de son dossier.
create policy avatars_insert_self on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update_self on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_delete_self on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
