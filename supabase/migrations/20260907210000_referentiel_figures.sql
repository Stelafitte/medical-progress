-- LES LEGENDES DES 196 FIGURES DU REFERENTIEL.
--
-- POURQUOI CETTE MIGRATION ARRIVE APRES LA TABLE. `referentiel_figures` a ete
-- creee directement en base le 07/09, pendant la mise a jour du referentiel de
-- cardiologie, sans passer par une migration. Un environnement reconstruit
-- depuis le depot n'aurait donc eu ni la table ni ses legendes. On la verse ici
-- telle qu'elle existe, sans rien changer a sa structure.
--
-- LE DEFAUT QU'ELLE CORRIGE, ET C'EST LE PLUS IMPORTANT : la RLS avait ete
-- activee par prudence, SANS AUCUNE POLICY. Une table protegee sans regle de
-- lecture n'est pas prudente, elle est MUETTE : `select` rend zero ligne a tout
-- le monde, sans erreur. Cote apprenant, les figures s'affichaient donc avec
-- « Fig. 5.1 » et jamais leur legende, et le client, ecrit en meilleur effort,
-- n'avait aucun moyen de distinguer « pas de legende » de « lecture refusee ».
-- C'est le mode de panne que ce depot traque partout : le faux succes.
--
-- LES DROITS ETAIENT AUSSI OUVERTS EN GRAND — `grant all` a `anon` ET
-- `authenticated` (INSERT, UPDATE, DELETE, TRUNCATE...), jamais revoque. Inerte
-- tant que la RLS refusait tout, mais un `grant` qui ne correspond a aucun usage
-- devient dangereux le jour ou une policy s'ouvre.

create table if not exists public.referentiel_figures (
  num text primary key,
  chapitre integer not null,
  url text,
  legende text not null default '',
  source text,
  created_at timestamptz not null default now()
);

alter table public.referentiel_figures enable row level security;

revoke all on public.referentiel_figures from public, anon, authenticated;
grant select on public.referentiel_figures to authenticated;

-- PORTEE : tout compte connecte. Cette table n'a AUCUNE colonne de programme —
-- c'est un referentiel global de numeros de figures et de legendes de manuel.
-- On ne peut donc pas la restreindre par programme comme les autres, et il n'y
-- a rien a y restreindre : le contenu n'est ni personnel ni sensible. `anon`,
-- lui, ne lit rien.
drop policy if exists referentiel_figures_select on public.referentiel_figures;
create policy referentiel_figures_select on public.referentiel_figures
for select to authenticated using (true);

comment on table public.referentiel_figures is
  'Legendes des figures du referentiel. Jointure vers les fichiers : '
  'object_path = ''referentiel-figures/fig-'' || num || ''.jpg'' dans '
  'learning_resource_assets (kind = ''illustration'', bucket course-sources).';
