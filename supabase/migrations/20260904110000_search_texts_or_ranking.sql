/* ==================================================================
   ETAPE 1 DU COMPAGNON IA — rendre la recherche ancree utilisable.

   CE QUI N'ALLAIT PAS, mesure le 04/09 sur la vraie base. La fonction du
   30/08 construit sa requete avec `plainto_tsquery`, qui relie TOUS les
   lemmes par ET — et le dictionnaire francais ne jette ni « quel » ni
   « comment » :

     'Quelle est la definition de l atherome ?'  =>  'quel' & 'definit' & 'atherom'
     'Comment interpreter un ECG normal ?'       =>  'comment' & 'interpret' & ...

   Un passage n'etait donc retenu que s'il contenait le mot « quel » EN PLUS
   du sujet, dans le meme segment de 4 000 caracteres. Resultat mesure :
   « atherome » rend 10 passages, « Quelle est la definition de l atherome ? »
   en rend ZERO — alors que le chapitre est en base. L'ancrage dependait du
   vocabulaire de la question, pas de son sujet. Et le compagnon aurait
   repondu « je ne trouve pas cela dans vos supports » : faux, et rassurant.

   CE QUI CHANGE, ET RIEN D'AUTRE :

   1. LES LEMMES SONT RELIES PAR OU. `ts_rank_cd` cesse d'etre decoratif : il
      ne classait que ce qui avait deja tout passe. En OU, la pertinence
      redevient un score, et c'est le classement qui tranche.

   2. LES LEMMES INTERROGATIFS SONT ECARTES. « quel », « comment »,
      « pourquoi » n'apportent rien au sujet et, en OU, ils ramenaient
      n'importe quel chapitre assez long. La liste est courte et explicite :
      on ecarte la forme de la question, jamais son contenu.

   3. LE DEFAUT PASSE DE 10 A 5 PASSAGES. Mesure du 04/09 : 10 passages =
      ~37 000 caracteres, soit 9 000 a 12 000 jetons envoyes au modele a
      CHAQUE question. C'est le poste de cout numero un du compagnon.

   CE QUI NE CHANGE PAS : la signature, les colonnes, les droits. La fonction
   n'est toujours PAS `security definer` — elle s'execute avec les droits de
   l'etudiant, la RLS de `learning_resource_texts` s'applique. Un
   `create or replace` suffit : aucun appelant a retoucher, et le retour
   arriere consiste a rejouer la definition du 30/08.

   PAS DE DECOUPE DU TEXTE ICI. On pourrait renvoyer une fenetre autour des
   termes (`ts_headline`), mais elle se calculerait sur le texte DESACCENTUE
   et rendrait a l'etudiant un extrait sans accents — inacceptable sur du
   texte medical. La reduction fine se fera dans l'Edge Function, ou on
   controle le decoupage et ou on peut le mesurer.
   ================================================================== */

create or replace function public.search_learning_resource_texts(
  p_program_id uuid,
  p_query text,
  p_limit integer default 5
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
  select t.resource_id,
         r.title,
         t.source_path,
         t.segment_index,
         t.content,
         ts_rank_cd(
           to_tsvector('french', public.immutable_unaccent(t.content)),
           requete.q
         ) as rank
  from requete
  join public.learning_resource_texts t
    on requete.q is not null
   and t.program_id = p_program_id
  join public.learning_resources r on r.id = t.resource_id
  where to_tsvector('french', public.immutable_unaccent(t.content)) @@ requete.q
  order by rank desc, t.resource_id, t.segment_index
  limit greatest(1, least(coalesce(p_limit, 5), 50));
$$;

revoke all on function public.search_learning_resource_texts(uuid, text, integer)
  from public, anon;
grant execute on function public.search_learning_resource_texts(uuid, text, integer)
  to authenticated;
