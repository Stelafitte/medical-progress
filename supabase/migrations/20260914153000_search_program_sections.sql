-- CHERCHER DANS TOUT LE TEXTE 2026 D UN PROGRAMME.
--
-- POURQUOI UNE SOEUR, ET PAS UN ELARGISSEMENT DE L EXISTANTE.
-- `search_course_sections` (09/09) prend un `resource_id` OBLIGATOIRE, et
-- c est voulu : l assistant IA est TOUJOURS ancre — sur un chapitre
-- (`ai_threads.resource_id`) ou sur un acquis (`outcome_id`, dont on connait
-- le chapitre) — et chercher dans les vingt-trois chapitres quand on sait
-- lequel on lit ramene des passages d un autre cours avec un score plausible.
-- Cette contrainte reste JUSTE pour lui. Elle est FAUSSE pour la recherche
-- transverse de l etudiant, qui n a justement pas encore choisi son chapitre :
-- c est elle qui CHOISIT l ancre, et qui sert de porte d entree a l assistant.
-- Deux usages opposes, donc deux fonctions. Modifier celle du 09/09 aurait
-- change le comportement de l assistant EN PRODUCTION sans que personne le
-- demande — la base de dev EST la base de production.
--
-- ELLE NE COUTE RIEN : Postgres seul, aucun appel au fournisseur. C est ce qui
-- rend la recherche utilisable vingt fois par jour sans toucher au plafond par
-- question regle le 09/09.
--
-- Entree : (programme, texte cherche, limite)
-- Sortie : une ligne par section, avec SON CHAPITRE (`resource_id` + titre) —
--          de quoi router l etudiant vers la lecture — et `total_matches`, le
--          nombre total de sections trouvees AVANT la limite, pour ecrire
--          « voir les 12 autres » sans payer une seconde requete.

begin;

/* ================================================================== */
/* 1. Aucun index a poser                                              */
/* ================================================================== */

-- `course_sections_search_idx` — GIN sur
-- `to_tsvector('french', public.immutable_unaccent(contenu))` — existe depuis
-- le 09/09 et sert cette fonction TELLE QUELLE : le predicat est identique,
-- seul le cadrage change. C est la raison pour laquelle ce chantier tient en
-- une fonction et rien d autre.
--
-- CE QUI N EST VOLONTAIREMENT PAS CHERCHE : le titre de la section. L indexer
-- demanderait un SECOND index GIN sur `titre || ' ' || contenu` — donc un
-- doublon de l index existant — pour un gain non mesure. A rouvrir si l usage
-- reel montre des recherches qui echouent sur un intitule de section.

/* ================================================================== */
/* 2. La recherche, cadree sur le programme                            */
/* ================================================================== */

-- `security invoker` (le defaut) ET C EST LE POINT IMPORTANT, repris du 09/09 :
-- la fonction lit `course_sections`, qui porte une policy cadree sur
-- `can_read_resource(resource_id)`, et joint `learning_resources`, qui porte la
-- sienne. En invoker, elle ne peut donc pas rendre une section que l appelant
-- n aurait pas le droit de lire directement — la propriete est STRUCTURELLE,
-- elle ne depend pas de la vigilance du prochain qui touchera au corps. C est
-- la lecon du 08/09, ou deux fonctions proposees en `security definer`
-- ouvraient l ouvrage entier a tout compte connecte.
--
-- LE SEUIL DE LONGUEUR PASSE DE 3 A 2, ET C EST LA SEULE DIVERGENCE VOULUE
-- AVEC LES DEUX RECHERCHES EXISTANTES. Elles filtrent `length(lexeme) >= 3`.
-- Pour une QUESTION en langue naturelle le filtre ne coute rien. Pour un CHAMP
-- DE RECHERCHE il est faux : « FA », « IM », « RA », « IC » sont des requetes
-- d etudiant en cardiologie parfaitement normales, et le seuil a 3 les vide
-- entierement — `q` devient null, la fonction rend zero ligne, et l etudiant
-- lit « aucun resultat » sur un mot que le cours contient partout. Le filtre a
-- 3 etait une ceinture par-dessus les bretelles : le dictionnaire `french`
-- retire deja les mots vides (« le », « la », « de », « ou »…) avant ce
-- filtre. Descendre a 2 ne laisse donc pas passer de bruit, seulement des
-- abreviations cliniques.
--
-- LA LISTE DES MOTS OUTILS EST REPRISE TELLE QUELLE : sans elle,
-- « peux-tu m expliquer... » ramene tout le chapitre avec un score honorable.
--
-- PAS DE `ts_headline` : il se calculerait sur le texte DESACCENTUE et rendrait
-- a l etudiant un extrait sans accents — inacceptable sur du texte medical. La
-- reduction a un extrait lisible se fait cote application, ou elle se mesure.
create or replace function public.search_program_sections(
  p_program_id uuid,
  p_query text,
  p_limit integer default 10
) returns table (
  section_id uuid,
  resource_id uuid,
  resource_title text,
  chapitre integer,
  numero text,
  titre text,
  partie text,
  rubrique text,
  contenu text,
  n_caracteres integer,
  rank real,
  total_matches bigint
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
    where length(v.lexeme) >= 2
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
  ),
  trouvees as (
    select cs.id,
           cs.resource_id,
           r.title as resource_title,
           cs.chapitre,
           cs.numero,
           cs.titre,
           cs.partie,
           cs.rubrique,
           cs.contenu,
           length(cs.contenu)::integer as n_caracteres,
           ts_rank_cd(
             to_tsvector('french', public.immutable_unaccent(cs.contenu)),
             requete.q
           ) as rank,
           /*
            * COMPTE AVANT LA LIMITE. Une fenetre vide compte les lignes du
            * resultat complet, et elle est evaluee AVANT le `limit` : c est ce
            * qui permet d annoncer « voir les 12 autres » sans seconde
            * requete. Le meme chiffre sert de compteur au bloc.
            */
           count(*) over () as total_matches
    from requete
    join public.course_sections cs
      on requete.q is not null
    join public.learning_resources r
      on r.id = cs.resource_id
     and r.program_id = p_program_id
    where to_tsvector('french', public.immutable_unaccent(cs.contenu)) @@ requete.q
  )
  select *
  from trouvees
  -- TRI DETERMINISTE : deux sections de meme score ne doivent pas changer de
  -- place d un rafraichissement a l autre. Le chapitre puis l ordre dans le
  -- chapitre departagent.
  order by rank desc, resource_id, chapitre, numero
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

comment on function public.search_program_sections(uuid, text, integer) is
  'Recherche plein texte francaise dans le texte 2026 de TOUT un programme. Soeur cadree programme de search_course_sections, qui reste cadree chapitre pour l assistant IA. security invoker : la RLS de course_sections et de learning_resources s applique.';

-- Les trois roles avant de regranter, convention du projet : `revoke ... from
-- public` ne retire pas un droit accorde nommement a `anon` ou a
-- `authenticated`.
revoke all on function public.search_program_sections(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.search_program_sections(uuid, text, integer)
  to authenticated;

commit;
