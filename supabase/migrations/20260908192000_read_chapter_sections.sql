-- LE PLAN ET LE TEXTE D UN CHAPITRE, DEPUIS LA SOURCE 2026.
--
-- ELLE REMPLACE `learning_resource_texts` DERRIERE LE BOUTON « Lire le texte du
-- chapitre ». Le controle qui autorise cette bascule a ete fait par la session
-- « referentiel » : couverture ligne a ligne des chapitres, sans trou ni
-- chevauchement, et comparaison caractere par caractere sur le seul chapitre ou
-- les deux sources sont en edition 2026 — l ecart tient aux sauts de ligne
-- rognes entre blocs. L etudiant ne perd rien ; il gagne les Points cles en
-- version 2026 et un texte debarrasse des numeros de page.
--
-- `learning_resource_texts` DEVIENT UNE ARCHIVE et n est pas supprimee : c est
-- la seule trace de l import 2022.
--
-- LES DEUX BASCULES PARTENT ENSEMBLE. Ce bouton et l assistant lisent
-- aujourd hui la meme source. Basculer le bouton seul afficherait a l etudiant
-- le texte 2026, Points cles compris, pendant que l assistant lui citerait le
-- texte 2022 avec ses numeros de page, dans la meme vue.
--
-- `order by ordre` SEUL SUFFIT. `ordre` est croissant et unique par chapitre, et
-- porte l ordre de lecture du livre, parties comprises pour le chapitre qui en a.
--
-- ZERO LIGNE EST UNE REPONSE VALIDE, ET C EST LE TEST D AFFICHAGE DU BOUTON.
-- Des supports du programme n ont pas de chapitre dans le livre : les modules de
-- stage. Le bouton ne doit pas s afficher pour eux, et le nombre de lignes
-- rendues suffit a le decider — aucune liste en dur.
--
-- DEUX GARDES PLUTOT QU UN, ET C EST DELIBERE. `security invoker` fait deja
-- appliquer la policy de `course_sections`, qui cadre sur
-- `can_read_resource(resource_id)`. Le predicat explicite sur l argument est
-- redondant tant que cette policy tient — et c est precisement pourquoi il est
-- la : une premiere version de cette fonction etait `security definer` sans
-- aucune verification, et rendait n importe quel chapitre, y compris non
-- publie, a n importe quel compte connecte. Le predicat rend la fonction juste
-- meme si la policy est un jour relachee.

begin;

create or replace function public.read_chapter_sections(p_resource_id uuid)
returns table (
  section_id   uuid,
  chapitre     int,
  partie       text,
  numero       text,
  titre        text,
  niveau       int,
  ordre        int,
  kind         text,
  rubrique     text,
  contenu      text,
  n_caracteres int
)
language sql
stable
security invoker
set search_path = public
as $$
  select id, chapitre, partie, numero, titre, niveau, ordre, kind, rubrique,
         contenu, length(contenu)
  from course_sections
  where resource_id = p_resource_id
    and public.can_read_resource(p_resource_id)
  order by ordre;
$$;

revoke all on function public.read_chapter_sections(uuid) from public, anon;
grant execute on function public.read_chapter_sections(uuid) to authenticated;

commit;
