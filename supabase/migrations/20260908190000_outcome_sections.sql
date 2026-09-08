-- LES RATTACHEMENTS ACQUIS -> SECTION FAITS A LA MAIN.
--
-- POURQUOI UNE TABLE, ET PAS UNE REGLE. La voie normale d un acquis vers son
-- texte passe par sa rubrique : `outcome_rubriques` donne la rubrique, et les
-- sections du chapitre qui la portent sont le texte. Cette voie ne rend rien
-- dans deux cas, et aucun n est reparable par du calcul :
--
-- - le chapitre 15 (ECG) n est pas organise par rubrique mais par theme, et
--   aucune de ses sections ne porte de rubrique ;
-- - la rubrique « Identifier une urgence » n intitule presque jamais une
--   section du livre.
--
-- Ces rattachements sont donc des ARBITRAGES HUMAINS, valides par Stef, et
-- c est ce que dit `source`. Ils ne remplacent pas la voie par rubrique : ils
-- la precisent la ou elle est muette.
--
-- LA CLE EST UN UUID DES DEUX COTES. Aucun numero lisible n est stocke. Les
-- numeros de section (« I.E.1 ») sont un libelle d affichage : ils changent
-- quand le decoupage est corrige — le chapitre 15 a ete renumerote le 08/09 —
-- et des rattachements stockes sous forme de chaines auraient ete casses en
-- silence, sans qu aucun test ne le voie : la table serait restee peuplee, les
-- jointures auraient rendu zero ligne, et l ecran aurait affiche « pas de
-- texte » pour des acquis correctement rattaches la veille.
--
-- LA POLICY SUIT LA SECTION DESIGNEE. Un rattachement ne dit rien par lui-meme,
-- mais il designe une section : le droit de le voir est donc exactement le
-- droit de lire cette section. Ecrire `using (true)` ici aurait recree, sur une
-- table de jointure, l ouverture que la migration precedente vient de fermer
-- sur la table de contenu.
--
-- LA TABLE ARRIVE VIDE. Le semis des rattachements n est pas une migration :
-- c est de la donnee, appliquee une fois, sous `supabase/seeds/`. Une migration
-- rejouee a chaque deploiement ne doit pas reinjecter des arbitrages qui ont pu
-- etre corriges depuis.

begin;

create table if not exists public.outcome_sections (
  outcome_id  uuid not null references public.outcomes(id) on delete cascade,
  section_id  uuid not null references public.course_sections(id) on delete cascade,
  position    int  not null default 1,
  source      text not null default 'arbitrage-cnec-2026',
  created_at  timestamptz not null default now(),
  primary key (outcome_id, section_id)
);

create index if not exists outcome_sections_outcome_idx
  on public.outcome_sections(outcome_id, position);

alter table public.outcome_sections enable row level security;

revoke all on public.outcome_sections from public, anon, authenticated;
grant select on public.outcome_sections to authenticated;

drop policy if exists outcome_sections_read on public.outcome_sections;

create policy outcome_sections_read on public.outcome_sections
  for select to authenticated
  using (
    exists (
      select 1
      from public.course_sections cs
      where cs.id = outcome_sections.section_id
        and public.can_read_resource(cs.resource_id)
    )
  );

commit;
