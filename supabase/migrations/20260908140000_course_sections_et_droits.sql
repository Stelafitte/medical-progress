-- LE TEXTE 2026 DECOUPE, ET LES DROITS QUE L EDITEUR SQL AVAIT LAISSES OUVERTS.
--
-- DEUX CHOSES DANS CETTE MIGRATION, ET LA SECONDE EST LA PLUS URGENTE.
--
-- 1. VERSIONNER CE QUI EXISTE DEJA EN BASE. `course_sections`,
--    `outcome_rubriques` et `referentiel_figures.section_id` ont ete crees dans
--    l editeur SQL, hors de toute migration. Le DDL ci-dessous est RELEVE EN
--    BASE le 08/09, pas recopie d une note : colonnes, cles, index et policies
--    lus dans `information_schema`, `pg_constraint` et `pg_policies`.
--
--    AUCUN COMPTE N EST ECRIT ICI. Le decoupage a ete corrige trois fois dans
--    la seule journee du 08/09 — un chapitre tronque, un autre ampute, un
--    troisieme portant une section fantome. Un nombre grave dans un commentaire
--    aurait ete faux avant d etre relu. Cette migration decrit une FORME ; les
--    volumes se lisent en base.
--
-- 2. RESSERRER LES DROITS. Constat du 08/09, dont Stef a identifie la cause :
--    les huit tables creees dans l editeur SQL portent DELETE, INSERT,
--    REFERENCES, SELECT, TRIGGER, TRUNCATE et UPDATE pour `anon` ET
--    `authenticated`. Aucune des cinquante tables issues de migrations ne les
--    porte. L editeur herite du `grant all` par defaut du schema `public` ; le
--    pipeline de migration le resserre, pas l editeur.
--
--    LA RLS NE SUFFIT PAS. Avec une policy en SELECT seul, INSERT / UPDATE /
--    DELETE sont bien refuses. Mais **TRUNCATE N EST PAS SOUMIS A LA RLS dans
--    PostgreSQL** : le droit accorde a `anon` sur `course_sections` n est
--    arrete par rien cote base. Seul le fait que PostgREST ne l expose pas en
--    HTTP protege aujourd hui le texte du cours. Un droit ne doit pas dependre
--    de ce qu une API expose.
--
--    RIEN NE CASSE. Ces tables sont alimentees depuis l editeur SQL sous le
--    role `postgres`, jamais depuis l application (verifie avec Stef). Le
--    `revoke all` puis `grant select to authenticated` ne coupe aucun chemin
--    d ecriture existant.

begin;

/* ------------------------------------------------------------------ */
/* 1. course_sections — le texte 2026, decoupe par section             */
/* ------------------------------------------------------------------ */

/*
 * `rubrique is null` N EST PAS UNE DONNEE MANQUANTE : ce sont des paragraphes
 * du cours sans contrepartie dans le referentiel. De vrais contenus, qui
 * doivent s afficher — mais ne JAMAIS etre comptes comme connaissances, sans
 * quoi les compteurs de progression deviennent faux.
 *
 * L IDENTITE D UNE SECTION EST `(chapitre, partie, numero)`, PAS `numero` SEUL.
 * Le chapitre 8 est decoupe en parties — les valvulopathies — et c est le seul
 * ou un meme `numero` revient dans deux parties differentes. Aucune contrainte
 * d unicite n est posee ici : elle echouerait sur des donnees qui n ont pas ete
 * mesurees contre elle, et une migration n est pas l endroit ou l on decouvre
 * un doublon. C est le code de lecture qui doit porter la cle a trois termes.
 */
create table if not exists public.course_sections (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid references public.learning_resources(id) on delete cascade,
  chapitre    int  not null,
  numero      text not null,
  titre       text not null,
  niveau      int  not null,
  ordre       int  not null,
  partie      text,
  rubrique    text,
  ligne_debut int  not null,
  ligne_fin   int  not null,
  contenu     text not null,
  source      text not null default 'ebook-2026',
  created_at  timestamptz default now()
);

alter table public.course_sections enable row level security;

/*
 * `outcome_id` EST RETIREE. Elle existe dans le DDL d origine et vaut null sur
 * toutes les lignes — zero appariement. La jointure acquis -> texte passe par
 * `outcome_rubriques`, pas par elle. Une colonne vide qu on garde « au cas ou »
 * finit par etre lue comme une source, et par mentir. Elle reviendra si
 * l arbitrage sur le chapitre 15 produit des appariements manuels.
 *
 * `drop column` emporte sa cle etrangere et son index ; le `drop index` qui
 * precede est la pour les bases ou l index aurait survecu seul.
 */
drop index if exists public.course_sections_outcome_idx;
alter table public.course_sections drop column if exists outcome_id;

create index if not exists course_sections_chapitre_idx
  on public.course_sections (chapitre, ordre);

/*
 * `create policy` n a pas de forme idempotente en PostgreSQL : le garde est
 * donc explicite. La policy est reproduite telle qu elle existe en base —
 * SELECT, role `authenticated`, `using (true)`.
 */
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'course_sections'
      and policyname = 'course_sections_read'
  ) then
    create policy course_sections_read on public.course_sections
      for select to authenticated using (true);
  end if;
end $$;

/* ------------------------------------------------------------------ */
/* 2. outcome_rubriques — la jointure acquis -> rubrique du referentiel */
/* ------------------------------------------------------------------ */

/*
 * CLE PRIMAIRE SUR `outcome_id` : un acquis porte au plus UNE rubrique. C est
 * ce qui rend la jointure du brief deterministe. La cascade a la suppression
 * est celle de la base, verifiee : supprimer un acquis emporte sa rubrique.
 */
create table if not exists public.outcome_rubriques (
  outcome_id   uuid primary key references public.outcomes(id) on delete cascade,
  rubrique     text not null,
  rubrique_src text not null,
  source       text not null default 'texte-cours-2022',
  text_offset  int  not null,
  created_at   timestamptz default now()
);

alter table public.outcome_rubriques enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'outcome_rubriques'
      and policyname = 'outcome_rubriques_read'
  ) then
    create policy outcome_rubriques_read on public.outcome_rubriques
      for select to authenticated using (true);
  end if;
end $$;

/* ------------------------------------------------------------------ */
/* 3. referentiel_figures.section_id — l ancrage des figures           */
/* ------------------------------------------------------------------ */

/*
 * ANCRAGE PAR LA POSITION DE LA LEGENDE DANS LE TEXTE, jamais par similarite.
 * L appariement lexical a ete mesure et ecarte le 07/09 : la plupart des
 * figures du chapitre 5 scoraient zero, et le seul score confiant etait un
 * faux. Les figures non ancrees gardent l affichage au chapitre.
 *
 * `on delete set null` : perdre une section ne doit pas faire disparaitre une
 * figure, seulement son ancrage.
 */
alter table public.referentiel_figures
  add column if not exists section_id uuid
    references public.course_sections(id) on delete set null;

/* ------------------------------------------------------------------ */
/* 4. Les droits des tables lues par l application                     */
/* ------------------------------------------------------------------ */

revoke all on public.course_sections     from public, anon, authenticated;
revoke all on public.outcome_rubriques   from public, anon, authenticated;
revoke all on public.referentiel_figures from public, anon, authenticated;

grant select on public.course_sections     to authenticated;
grant select on public.outcome_rubriques   to authenticated;
grant select on public.referentiel_figures to authenticated;

/* ------------------------------------------------------------------ */
/* 5. Tables de travail : droits resserres, jamais versionnees         */
/* ------------------------------------------------------------------ */

/*
 * TROIS TABLES QUI NE SONT PAS DES OBJETS DU PRODUIT, et que cette migration
 * ne doit donc pas creer :
 *
 * - `_ebook_chapitres` : les chapitres bruts, la trace de provenance.
 * - `_backup_texts_20260907` : le filet sur les segments de texte actuels.
 * - `_backup_ch01_item221_20260907` : LA SEULE COPIE D AVANT la reecriture du
 *   § V.B du chapitre 1. Mesure le 08/09 : ses segments different de
 *   `_backup_texts_20260907`, lui-meme identique au texte en ligne — la
 *   sauvegarde globale a donc ete prise APRES la reecriture, et ne remplace pas
 *   celle-ci. Elle reste.
 *
 * Une base neuve ne les a pas, d ou le garde `to_regclass`.
 *
 * MAIS LEURS DROITS SONT RESSERRES ICI. `_ebook_chapitres` porte la RLS sans
 * policy, ce qui est la bonne intention. Seulement elle ne tient qu a l absence
 * de policy : une seule ligne `create policy ... using (true)` ajoutee un jour
 * par distraction exposerait tout l ebook a `anon`. Les droits doivent porter
 * l intention, pas seulement la RLS.
 */
do $$
declare
  t text;
begin
  foreach t in array array[
    'public._ebook_chapitres',
    'public._backup_texts_20260907',
    'public._backup_ch01_item221_20260907'
  ] loop
    if to_regclass(t) is not null then
      execute format('revoke all on %s from public, anon, authenticated', t);
    end if;
  end loop;
end $$;

/* ------------------------------------------------------------------ */
/* 6. Les sauvegardes qui ont servi — SUPPRIMEES HORS MIGRATION        */
/* ------------------------------------------------------------------ */

/*
 * `_backup_outcomes_20260907`, `_backup_outcomes_th17_20260907` et
 * `_backup_outcomes_th23_20260907` ont ete supprimees le 08/09, directement
 * dans l editeur SQL. Elles ne figurent PAS ici, et c est deliberé.
 *
 * POURQUOI AUCUNE SUPPRESSION DE TABLE DANS UNE MIGRATION. Le depot tient une
 * regle, et un test la garde (`supabaseFoundation.test.ts`, « conserve des
 * migrations ordonnees et additives ») : l historique versionne ne supprime
 * jamais une table ni un type. Une migration se rejoue sur une base neuve
 * comme sur une base vivante ; une suppression y est irreversible et
 * silencieuse. Le test lit le texte brut des fichiers, commentaires compris —
 * les deux expressions interdites ne sont donc pas ecrites ici, meme pour en
 * parler.
 *
 * ET CE `drop` N AURAIT RIEN FAIT. Ces trois tables ont ete creees dans l
 * editeur SQL, hors migration : une base reconstruite depuis le depot ne les
 * cree jamais. La suppression ne concernait donc QUE la base existante — ou
 * elle a eu lieu, et ou elle a ete verifiee. L ecrire ici aurait ajoute une
 * instruction destructrice a l historique pour un effet nul.
 *
 * Le retrait de la colonne `outcome_id` plus haut suit le meme raisonnement, a
 * une difference pres qui le rend acceptable : la colonne appartient a une
 * table que cette migration cree, le `create table` ci-dessus ne la declare
 * pas, et le retrait conditionnel est donc un no-op sur une base neuve. Il
 * n efface que la derive, jamais un objet du produit.
 */

commit;
