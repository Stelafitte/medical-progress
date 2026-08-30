-- Texte integral des supports, conserve et interrogeable.
--
-- POURQUOI. Jusqu'ici, importer un document deposait son FICHIER dans le
-- stockage prive et en extrayait un referentiel. Le texte lui-meme n'etait
-- garde nulle part : pour le relire il aurait fallu retelecharger le binaire
-- et refaire l'extraction, cote client, a chaque usage.
--
-- Or le texte est la matiere de tout ce qui vient ensuite : l'apprenant qui
-- pose une question sur un cours, l'interrogation automatique, l'enseignant
-- qui fait produire des QCM. Ces usages lisent des PASSAGES, pas un fichier.
--
-- DECOUPAGE EN SEGMENTS. Le texte est stocke par morceaux, pas d'un bloc.
-- Trois raisons, dans cet ordre d'importance :
--   1. repondre a une question suppose de retrouver le passage pertinent, pas
--      de relire 110 000 caracteres ;
--   2. tout modele a une limite d'entree : un chapitre entier ne tient pas
--      dans un appel, des segments si ;
--   3. le jour ou l'on ajoutera des plongements vectoriels, ils se calculent
--      par segment — la table est deja a la bonne granularite.
--
-- RECHERCHE. Un index GIN plein texte francais rend la recherche disponible
-- tout de suite, sans dependre d'un service externe. La recherche semantique
-- pourra s'ajouter par-dessus ; elle ne la remplace pas, les deux se
-- completent.
--
-- LES ACCENTS. Mesure faite sur un texte reel : le dictionnaire francais
-- racinise bien les pluriels et les accords, mais << retrecissement >> tape
-- sans accent ne trouve PAS << retrecissement >> accentue. En medecine
-- personne ne tape les accents ; sans traitement, la recherche echouerait sur
-- une grande part des requetes reelles, et en silence.
--
-- On indexe donc les DEUX formes, accentuee et desaccentuee, et on interroge
-- avec les deux : un texte est trouve si l'une ou l'autre correspond.
--
-- Ce que cela ne couvre pas, et qu'il faut savoir : le radical francais
-- DEPEND des accents (<< serre >> donne serr, << serrees >> donne serre).
-- Une forme flechie tapee sans accent peut donc ne pas retrouver sa forme
-- accentuee. Le cas est etroit et sans solution par dictionnaire ; la
-- recherche semantique, plus tard, le couvrira. Mieux vaut le savoir que
-- croire la recherche exhaustive.
--
-- `unaccent(regdictionary, text)` — la forme a deux arguments — est
-- immutable, contrairement a la forme a un argument : c'est la seule qui
-- puisse entrer dans un index sans mentir au planificateur.

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.immutable_unaccent(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = extensions, public, pg_catalog
as $$ select unaccent('unaccent'::regdictionary, p_text) $$;

comment on function public.immutable_unaccent(text) is
  'Retire les accents, de facon immutable, pour pouvoir servir dans un index. A appliquer des deux cotes : au contenu indexe et au texte cherche.';

revoke all on function public.immutable_unaccent(text) from public, anon, authenticated;
grant execute on function public.immutable_unaccent(text) to authenticated;

create table public.learning_resource_texts (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.learning_resources (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  -- Chemin du document d'origine dans l'archive importee. Un support peut
  -- venir de plusieurs fichiers ; sans ce champ on ne saurait plus lequel.
  source_path text not null default '',
  segment_index integer not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (resource_id, source_path, segment_index)
);

create index learning_resource_texts_resource_idx
  on public.learning_resource_texts (resource_id);

create index learning_resource_texts_search_idx
  on public.learning_resource_texts
  using gin (
    (
      to_tsvector('french', content)
      || to_tsvector('french', public.immutable_unaccent(content))
    )
  );

alter table public.learning_resource_texts enable row level security;

-- Meme portee que le support lui-meme : qui peut lire le support peut lire son
-- texte. Aucune regle propre a inventer ici — deux regles de lecture pour un
-- meme contenu finiraient par diverger.
revoke all on public.learning_resource_texts from public, anon, authenticated;
grant select on public.learning_resource_texts to authenticated;

create policy learning_resource_texts_select_scoped on public.learning_resource_texts
for select to authenticated
using (public.can_read_resource(resource_id));

-- Ecriture par lot, et remplacement complet pour ce document source : un
-- reimport doit donner le meme etat qu'un premier import, sans accumuler les
-- segments d'une version precedente.
create function public.store_learning_resource_text(
  p_resource_id uuid,
  p_source_path text,
  p_segments text[]
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_count integer := 0;
begin
  select program_id into v_program_id
  from public.learning_resources where id = p_resource_id;
  if v_program_id is null then
    raise exception 'Support introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  delete from public.learning_resource_texts
  where resource_id = p_resource_id and source_path = coalesce(p_source_path, '');

  if p_segments is null then
    return 0;
  end if;

  insert into public.learning_resource_texts
    (resource_id, program_id, source_path, segment_index, content)
  select
    p_resource_id, v_program_id, coalesce(p_source_path, ''),
    ordinality::integer, segment
  from unnest(p_segments) with ordinality as t(segment, ordinality)
  where length(trim(segment)) > 0;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.store_learning_resource_text(uuid, text, text[])
  from public, anon, authenticated;
grant execute on function public.store_learning_resource_text(uuid, text, text[])
  to authenticated;

-- Recherche de passages, cote serveur.
--
-- La normalisation vit ICI et nulle part ailleurs : si le client construisait
-- sa requete lui-meme, il finirait par la construire autrement que l'index,
-- et la recherche renverrait moins que ce qu'elle contient — sans erreur, ce
-- qui est le pire des cas.
--
-- La RLS de `learning_resource_texts` s'applique : cette fonction n'est PAS
-- security definer, elle voit ce que l'appelant a le droit de voir.
create function public.search_learning_resource_texts(
  p_program_id uuid,
  p_query text,
  p_limit integer default 10
) returns table (
  resource_id uuid,
  resource_title text,
  source_path text,
  segment_index integer,
  content text,
  rank real
)
language sql
stable
set search_path = public, pg_temp
as $$
  select t.resource_id, r.title, t.source_path, t.segment_index, t.content,
         ts_rank(
           to_tsvector('french', t.content)
             || to_tsvector('french', public.immutable_unaccent(t.content)),
           plainto_tsquery('french', p_query)
             || plainto_tsquery('french', public.immutable_unaccent(p_query))
         ) as rank
  from public.learning_resource_texts t
  join public.learning_resources r on r.id = t.resource_id
  where t.program_id = p_program_id
    and (
      to_tsvector('french', t.content)
        || to_tsvector('french', public.immutable_unaccent(t.content))
    ) @@ (
      plainto_tsquery('french', p_query)
        || plainto_tsquery('french', public.immutable_unaccent(p_query))
    )
  order by rank desc, t.segment_index
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

revoke all on function public.search_learning_resource_texts(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.search_learning_resource_texts(uuid, text, integer)
  to authenticated;
