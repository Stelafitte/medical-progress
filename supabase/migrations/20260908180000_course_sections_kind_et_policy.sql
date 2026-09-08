-- LE TYPE D UNE SECTION, ET LE RESSERRAGE DE SA LECTURE.
--
-- DEUX CHOSES, ET LA SECONDE EST LA PLUS IMPORTANTE.
--
-- 1. `kind` DIT CE QU EST UNE LIGNE DE `course_sections`. La colonne a ete
--    ajoutee dans l editeur SQL le 08/09 au soir, avec la renumerotation du
--    chapitre 15. Elle est versionnee ici pour que le depot cesse de decrire un
--    schema faux : `read_outcome_sections` et `read_chapter_sections` la lisent
--    toutes les deux, et un relecteur du DDL precedent aurait cherche en vain.
--
--    Les quatre valeurs et leur rendu attendu sont dans le `comment on column`
--    ci-dessous, la ou le prochain lecteur les cherchera.
--
-- 2. LA LECTURE DE `course_sections` ETAIT OUVERTE A TOUT COMPTE CONNECTE.
--    La policy valait `using (true)` : n importe quel compte authentifie
--    pouvait lire l integralite du texte du livre via PostgREST, quel que soit
--    son programme et que le chapitre soit publie ou non. La table etait un
--    brouillon quand cette policy a ete ecrite ; elle est devenue la seule
--    copie du cours 2026, et la policy n a pas suivi.
--
--    LE CADRAGE N ETAIT PAS POSSIBLE AVANT. Il repose sur `resource_id`, qui
--    etait declaree nullable : on ne cadre pas sur une colonne qui peut etre
--    vide. La mesure du 08/09 a montre la colonne renseignee sur toutes les
--    lignes, ce qui a rendu le correctif applicable.
--
--    `can_read_resource` est la regle deja utilisee par `learning_resources`,
--    `learning_resource_texts` et `learning_resource_outcomes` : equipe du
--    programme, ou inscrit au programme sur une ressource publiee et de
--    visibilite `cohort` / `program`. Les deux sources de texte portent
--    desormais la meme regle, ce qui est le point : la bascule du bouton
--    chapitre d une table vers l autre ne doit rien changer aux droits.
--
--    Applique en base le 08/09 au soir par la session « referentiel » ; rejoue
--    ici pour que le depot en porte la trace. `drop policy if exists` puis
--    `create policy` plutot qu un `alter policy` : la forme est idempotente et
--    ne suppose pas qu une policy existante ait ete creee par le garde
--    conditionnel de la migration precedente.

begin;

alter table public.course_sections
  add column if not exists kind text not null default 'section';

alter table public.course_sections
  drop constraint if exists course_sections_kind_check;

alter table public.course_sections
  add constraint course_sections_kind_check
  check (kind in ('section', 'sous-item', 'encadre', 'annexe'));

comment on column public.course_sections.kind is
  'section = section numérotée ; sous-item = bloc titré non numéroté ; '
  'encadre = aparté « Pour comprendre », rendu dans sa section hôte et jamais '
  'dans le plan ; annexe = Points clés / Entraînement / Pour en savoir plus, '
  'rendu en fin de chapitre. Pour sous-item et encadre, numero désigne la '
  'section hôte ; pour annexe, numero est vide. ordre donne la position de '
  'lecture et suffit à tout placer.';

drop policy if exists course_sections_read on public.course_sections;

create policy course_sections_read on public.course_sections
  for select to authenticated
  using (public.can_read_resource(resource_id));

commit;
