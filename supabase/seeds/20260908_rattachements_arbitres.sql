-- =====================================================================
-- SEMIS DES RATTACHEMENTS ACQUIS -> SECTION
-- Arbitrages valides par Pr Lafitte le 8 septembre 2026.
--
-- CE FICHIER N EST PAS UNE MIGRATION, et c est pourquoi il n est pas
-- dans `supabase/migrations`. C est de la donnee, appliquee une fois.
-- Rejoue a chaque deploiement, il reinjecterait des arbitrages qui ont
-- pu etre corriges depuis.
--
-- A APPLIQUER APRES la migration qui cree `outcome_sections`, et APRES
-- le resserrage de la policy de `course_sections`.
--
-- LES UUID SONT RESOLUS A L APPLICATION, a partir du code de l acquis
-- et de (chapitre, numero, kind). Rien d illisible n est ecrit a la
-- main, et rien de lisible n est stocke : la table ne recoit que des
-- uuid. Les numeros de section sont un support de relecture humaine ;
-- ils changent quand le decoupage est corrige.
--
-- LE GARDE-FOU ANNULE TOUT si une paire ne se resout pas OU si une
-- cible correspond a plusieurs sections. Les deux comptent :
-- (chapitre, numero, kind) n est PAS l identite d une section — un
-- chapitre decoupe en parties peut faire revenir un meme numero dans
-- deux parties. Aucun chapitre de ce genre n est vise ici, mais un
-- garde qui ne verifie que l existence laisserait passer exactement la
-- panne silencieuse qu il est cense arreter : la table peuplee de deux
-- liens la ou un seul etait voulu.
--
-- LES VOLUMES SE LISENT EN BASE. Aucun compte n est grave ici : le
-- decoupage a ete corrige plusieurs fois dans la seule journee du 08/09.
-- La requete de controle en fin de fichier les rend.
-- =====================================================================

begin;

create temporary table _semis (
  code text, ch int, num text, k text, pos int
) on commit drop;

insert into _semis (code, ch, num, k, pos) values
-- ---- Chapitre 15 — item 231, Electrocardiogramme -------------------
  ('ECN-231-01', 15, 'I.A.1',   'section', 1),  -- electrophysiologie
  ('ECN-231-01', 15, 'I.A.2',   'section', 2),  -- electrogenese
  ('ECN-231-01', 15, 'I.A.3',   'section', 3),  -- derivations, axe
  ('ECN-231-01', 15, 'I.A.4',   'section', 4),  -- valeurs numeriques
  ('ECN-231-03', 15, 'I.E.1',   'section', 1),
  ('ECN-231-04', 15, 'I.E.3',   'section', 1),
  ('ECN-231-05', 15, 'I.E.2',   'section', 1),
  ('ECN-231-06', 15, 'I.B.1',   'section', 1),
  ('ECN-231-06', 15, 'I.B.2',   'section', 2),
  ('ECN-231-06', 15, 'I.B.3',   'section', 3),
  ('ECN-231-07', 15, 'I.B.1',   'section', 1),
  ('ECN-231-08', 15, 'I.B.4',   'section', 1),
  ('ECN-231-09', 15, 'I.B.4',   'section', 1),
  ('ECN-231-10', 15, 'I.B.5',   'section', 1),
  ('ECN-231-11', 15, 'I.B.5',   'section', 1),
  ('ECN-231-12', 15, 'I.C.1',   'section', 1),
  ('ECN-231-12', 15, 'I.D.4',   'section', 2),  -- algorithme decisionnel
  ('ECN-231-13', 15, 'I.C.2',   'section', 1),
  ('ECN-231-14', 15, 'I.C.3',   'section', 1),
  ('ECN-231-15', 15, 'I.C.5',   'section', 1),
  ('ECN-231-16', 15, 'I.C',     'encadre', 1),  -- encadre « Manoeuvres vagales »
  ('ECN-231-17', 15, 'I.C.6',   'section', 1),
  ('ECN-231-18', 15, 'I.D.1',   'section', 1),
  ('ECN-231-19', 15, 'I.D.2',   'section', 1),
  ('ECN-231-20', 15, 'I.D.3',   'section', 1),
  ('ECN-231-21', 15, 'I.F.1',   'section', 1),
  ('ECN-231-22', 15, 'I.F.1',   'section', 1),  -- QT long : dyskaliemies
  ('ECN-231-22', 15, 'I.D.3',   'section', 2),  -- et torsades de pointes
  ('ECN-231-23', 15, 'I.F.2',   'section', 1),
  ('ECN-231-24', 15, 'I.F.4',   'section', 1),
  ('ECN-231-25', 15, 'I.F.3',   'section', 1),  -- WPW -> Preexcitation
  ('ECN-231-26', 15, 'I.F.5',   'section', 1),
  ('ECN-231-27', 15, 'II.A',    'section', 1),
  ('ECN-231-27', 15, 'II.B',    'section', 2),
  ('ECN-231-29', 15, 'II.C',    'section', 1),  -- methode Holter
-- ---- « Identifier une urgence » ------------------------------------
  ('ECN-224-11',  4, 'VII.A',   'section', 1),
  ('ECN-339-09',  5, 'IV.E',    'section', 1),  -- appel du 15
  ('ECN-230-02',  6, 'I.B',     'section', 1),
  ('ECN-230-03',  6, 'II',      'section', 1),
  ('ECN-225-09',  7, 'III',     'section', 1),
  ('ECN-225-15',  7, 'IV.A',    'section', 1),
  ('ECN-152-14',  9, 'VIII.A',  'section', 1),
  ('ECN-153-04', 10, 'III.B.2', 'section', 1),
  ('ECN-342-10', 12, 'VI',      'section', 1),
  ('ECN-342-14', 12, 'VI',      'section', 1),
  ('ECN-232-12', 13, 'VI',      'section', 1),
  ('ECN-232-15', 13, 'VI.A',    'section', 1),
  ('ECN-236-05', 14, 'V.A',     'section', 1),
  ('ECN-237-02', 16, 'II.B',    'section', 1),
  ('ECN-234-17', 18, 'IV.A',    'section', 1),  -- diagnostic de l OAP
  ('ECN-234-22', 18, 'IV.A.3',  'section', 1),
  ('ECN-234-22', 18, 'VII.C',   'section', 2),
  ('ECN-226-05', 19, 'VII.D',   'section', 1),  -- EP a haut risque
  ('ECN-235-03', 20, 'II.A',    'section', 1),
  ('ECN-235-15', 20, 'II.A',    'section', 1),
  ('ECN-235-15', 20, 'III.B',   'section', 2);

-- Garde-fou : existence ET unicite de la cible. Toute anomalie annule
-- l ensemble, avec le detail a l ecran.
do $$
declare n_attendu int; n_mauvais int; details text;
begin
  select count(*) into n_attendu from _semis;

  select count(*),
         string_agg(s.code || ' -> ch' || s.ch || ' ' || s.num
                    || ' (' || c.n || ' cible(s))', ', ')
    into n_mauvais, details
  from _semis s
  cross join lateral (
    select count(*) as n
    from course_sections cs
    where cs.chapitre = s.ch and cs.numero = s.num and cs.kind = s.k
  ) c
  where c.n <> 1
     or not exists (
       select 1 from outcomes o
       where o.code = s.code and o.archived_at is null
     );

  if n_mauvais > 0 then
    raise exception 'Semis annule : % paire(s) non resolue(s) ou ambigue(s) sur % : %',
      n_mauvais, n_attendu, details;
  end if;
end $$;

insert into public.outcome_sections (outcome_id, section_id, position, source)
select o.id, cs.id, s.pos, 'arbitrage-cnec-2026'
from _semis s
join outcomes o
  on o.code = s.code and o.archived_at is null
join course_sections cs
  on cs.chapitre = s.ch and cs.numero = s.num and cs.kind = s.k
on conflict (outcome_id, section_id) do nothing;

commit;

-- Controle apres application — lisez les volumes, ne les supposez pas :
--
--   select count(*) as paires, count(distinct outcome_id) as connaissances
--   from public.outcome_sections;
--
-- Retour arriere :
--
--   delete from public.outcome_sections where source = 'arbitrage-cnec-2026';
