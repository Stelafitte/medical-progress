-- Deposer un corpus de documents, et pas seulement des PDF.
--
-- Deux blocages constates a l'usage, tous deux cote stockage :
--
-- 1. La contrainte `asset_bucket_kind_coherent` envoyait tout ce qui n'est pas
--    `source` vers `course-artifacts`. Une illustration est pourtant un
--    fichier SOURCE, importe avec son document : sa place est dans
--    `course-sources`, aux cotes du document qu'elle illustre.
--
-- 2. Le bucket `course-sources` n'acceptait que le PDF et la video. Un corpus
--    reel contient aussi des .docx, du texte, des pages HTML enregistrees et
--    leurs figures ; le televersement echouait sur le type MIME, avec un
--    message que rien ne permettait de relier au fichier fautif.

alter table public.learning_resource_assets
  drop constraint asset_bucket_kind_coherent;

alter table public.learning_resource_assets
  add constraint asset_bucket_kind_coherent check (
    (kind in ('source', 'illustration') and bucket_name in ('pptx-sources', 'course-sources'))
    or (kind not in ('source', 'illustration') and bucket_name = 'course-artifacts')
  );

update storage.buckets
set allowed_mime_types = array[
      'application/pdf',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'text/markdown', 'text/html',
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'
    ]
where id = 'course-sources';
