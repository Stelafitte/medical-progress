-- CHERCHER DANS LE TEXTE 2026.
--
-- CE QUI MANQUAIT, ET POURQUOI CA BLOQUAIT UNE DECISION DE STEF. Le reglage
-- pose ce matin offre trois politiques de reponse, dont la moins chere —
-- `seuil`, qui est le DEFAUT et le reglage actuel de DFASM-CARDIO — repose sur
-- un SCORE DE PERTINENCE : sous le seuil, l assistant repond « rien trouve »
-- sans appeler le modele, et la question coute zero.
--
-- Or ce score venait de `search_learning_resource_texts`, qui interroge le
-- texte importe en 2022. `course_sections` — le texte 2026, devenu la source
-- unique — ne porte AUCUN index plein texte. Basculer l assistant sur le 2026
-- sans cette fonction aurait donc supprime en silence la seule politique qui
-- protege du cout, ou pire : fait decider sur un corpus et repondre sur
-- l autre.
--
-- CADREE SUR UN CHAPITRE, PAS SUR LE PROGRAMME. C est la difference avec la
-- recherche de 2022, et elle est voulue : l assistant est desormais TOUJOURS
-- ancre — sur un chapitre (`ai_threads.resource_id`) ou sur un acquis
-- (`outcome_id`), dont on connait le chapitre. Chercher dans les vingt-trois
-- chapitres quand on sait lequel on lit ramenerait des passages d un autre
-- cours, avec un score plausible : exactement le defaut mesure le 04/09.

begin;

/* ================================================================== */
/* 1. L index                                                          */
/* ================================================================== */

-- SUR LA FORME DESACCENTUEE SEULEMENT, parce que c est la seule que la fonction
-- interroge. `immutable_unaccent` existe depuis le 30/08 et doit s appliquer
-- DES DEUX COTES — au contenu indexe et au texte cherche — sinon l index ne
-- sert pas et le planificateur retombe sur un parcours complet des 981
-- sections a chaque question.
create index if not exists course_sections_search_idx
  on public.course_sections
  using gin (to_tsvector('french', public.immutable_unaccent(contenu)));

/* ================================================================== */
/* 2. La recherche                                                     */
/* ================================================================== */

-- `security invoker` (le defaut) ET C EST LE POINT IMPORTANT : la fonction lit
-- `course_sections`, qui porte depuis le 08/09 une policy cadree sur
-- `can_read_resource(resource_id)`. En invoker, elle ne peut donc pas rendre
-- une section que l appelant n aurait pas le droit de lire directement — la
-- propriete est structurelle, elle ne depend pas de la vigilance du prochain
-- qui touchera au corps. C est la lecon du 08/09, ou deux fonctions proposees
-- en `security definer` ouvraient l ouvrage entier a tout compte connecte.
--
-- LES MOTS OUTILS SONT ECARTES, liste reprise telle quelle de la recherche
-- 2022 : sans elle, « peux-tu m expliquer... » ramene tout le chapitre avec un
-- score honorable, et le seuil ne protege plus de rien.
--
-- PAS DE `ts_headline` : il se calculerait sur le texte DESACCENTUE et rendrait
-- a l etudiant un extrait sans accents — inacceptable sur du texte medical. La
-- reduction se fait dans la fonction edge, ou elle se mesure.
create or replace function public.search_course_sections(
  p_resource_id uuid,
  p_query text,
  p_limit integer default 5
) returns table (
  section_id uuid,
  numero text,
  titre text,
  ordre integer,
  partie text,
  contenu text,
  n_caracteres integer,
  rank real
)
language sql
stable
set search_path = public, pg_temp
as $$
  with lexemes as (
    select v.lexeme
    from unnest(
      to_tsvector('french', public.immutable_unaccent(coalesce(p_query, '')))
    ) as v(lexeme, positions, weights)
    where length(v.lexeme) >= 3
      and v.lexeme <> all (array[
        'quel', 'comment', 'pourquoi', 'quand', 'combien', 'quoi',
        'lequel', 'dont', 'donc', 'ains', 'peux', 'peut', 'pouv',
        'dis', 'dit', 'expliqu', 'donn', 'fair', 'veux', 'voudr'
      ])
  ),
  requete as (
    select case
             when count(*) = 0 then null
             else string_agg(lexeme, ' | ')::tsquery
           end as q
    from lexemes
  )
  select cs.id,
         cs.numero,
         cs.titre,
         cs.ordre,
         cs.partie,
         cs.contenu,
         length(cs.contenu)::integer,
         ts_rank_cd(
           to_tsvector('french', public.immutable_unaccent(cs.contenu)),
           requete.q
         ) as rank
  from requete
  join public.course_sections cs
    on requete.q is not null
   and cs.resource_id = p_resource_id
  where to_tsvector('french', public.immutable_unaccent(cs.contenu)) @@ requete.q
  order by rank desc, cs.partie, cs.ordre
  limit greatest(1, least(coalesce(p_limit, 5), 50));
$$;

revoke all on function public.search_course_sections(uuid, text, integer) from public, anon;
grant execute on function public.search_course_sections(uuid, text, integer) to authenticated;

commit;
