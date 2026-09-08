-- LE TEXTE D UN ACQUIS, PAR TROIS VOIES, ET LA VOIE EST DITE.
--
-- TROIS VOIES, DANS CET ORDRE DE PRIORITE :
--
-- 1. `manuel`   — les rattachements arbitres de `outcome_sections` ;
-- 2. `rubrique` — les sections du chapitre qui portent la rubrique de l acquis ;
-- 3. `chapitre` — a defaut, le chapitre entier.
--
-- LE REPLI EST LE CHAPITRE, JAMAIS UN REFUS. Un acquis sans texte propre montre
-- son chapitre, comme le livre imprime : ce n est pas faux, seulement moins
-- precis. Refuser aurait prive l etudiant d un texte qui existe.
--
-- `origine` DIT LAQUELLE A SERVI, et c est ce qui rend ce repli utilisable
-- plutot que devinable. L ecran s en sert pour ne PAS afficher un bouton
-- « Lire le texte de cette connaissance » quand la reponse est le chapitre
-- entier — sinon il ouvrirait exactement le meme contenu que le bouton
-- « Lire le texte du chapitre », repete a chaque ligne de la liste. La fonction
-- edge s en sert pour dire au modele si les passages traitent l acquis ou son
-- chapitre.
--
-- `n_caracteres` EST LA POUR LA FONCTION EDGE. Elle envoie au modele les
-- sections dans l ordre de lecture jusqu a son budget, et s arrete sur une
-- frontiere de section. Couper au milieu d une section serait un troisieme
-- decoupage, apres celui du livre et celui du referentiel.
--
-- `security invoker`, ET C EST UN CHOIX. Une premiere version etait
-- `security definer` : elle contournait alors la policy de
-- `learning_resource_outcomes` et rendait le texte d un chapitre a un compte
-- d un autre programme, ou le texte d un chapitre non publie a un inscrit. Rien
-- ici n a besoin d un privilege eleve : les trois tables lues accordent
-- `select to authenticated` et portent chacune leur RLS. En `invoker`, la
-- fonction ne peut pas rendre une ligne que l appelant n aurait pas le droit de
-- lire directement — la propriete est structurelle, elle ne depend pas de la
-- vigilance du prochain qui touchera au corps.
--
-- `order by resource_id` D ABORD. `learning_resource_outcomes` a pour cle
-- primaire `(resource_id, outcome_id)` : rien n interdit qu un acquis soit
-- couvert par deux supports. La mesure du 08/09 n en a trouve aucun, mais le
-- schema le permet, et le jour ou le cas apparaitra la voie `chapitre`
-- retournerait deux chapitres. Trier par `resource_id` et rendre la colonne
-- fait apparaitre le cas au lieu de le concatener en silence.

begin;

create or replace function public.read_outcome_sections(p_outcome_id uuid)
returns table (
  section_id   uuid,
  resource_id  uuid,
  chapitre     int,
  partie       text,
  numero       text,
  titre        text,
  niveau       int,
  ordre        int,
  kind         text,
  rubrique     text,
  contenu      text,
  n_caracteres int,
  origine      text
)
language sql
stable
security invoker
set search_path = public
as $$
  with cible as (
    select lro.resource_id, orb.rubrique
    from learning_resource_outcomes lro
    left join outcome_rubriques orb on orb.outcome_id = lro.outcome_id
    where lro.outcome_id = p_outcome_id
  ),
  manuel as (
    select cs.*, os.position as p, 'manuel'::text as origine
    from outcome_sections os
    join course_sections cs on cs.id = os.section_id
    where os.outcome_id = p_outcome_id
  ),
  par_rubrique as (
    select cs.*, cs.ordre as p, 'rubrique'::text as origine
    from course_sections cs
    join cible c on c.resource_id = cs.resource_id
    where cs.rubrique = c.rubrique
      and cs.kind in ('section', 'sous-item')
      and not exists (select 1 from manuel)
  ),
  chapitre_entier as (
    select cs.*, cs.ordre as p, 'chapitre'::text as origine
    from course_sections cs
    join cible c on c.resource_id = cs.resource_id
    where not exists (select 1 from manuel)
      and not exists (select 1 from par_rubrique)
  ),
  tout as (
    select * from manuel
    union all select * from par_rubrique
    union all select * from chapitre_entier
  )
  select id, resource_id, chapitre, partie, numero, titre, niveau, ordre,
         kind, rubrique, contenu, length(contenu), origine
  from tout
  order by resource_id, p, ordre;
$$;

revoke all on function public.read_outcome_sections(uuid) from public, anon;
grant execute on function public.read_outcome_sections(uuid) to authenticated;

commit;
