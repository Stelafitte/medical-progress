-- LA POLICY DE LECTURE DE `course_sections` COUTAIT 265 ms PAR RECHERCHE.
--
-- CE QUI A ETE MESURE (banc PostgreSQL 16, 984 sections, 14/09). Meme requete,
-- meme fonction, seule la policy change :
--
--     sans RLS (reference)                 0,13 ms   Bitmap Index Scan
--     policy actuelle (appel par ligne)  265,00 ms   Seq Scan
--     policy hachee (ce fichier)          24,00 ms   Seq Scan, predicat evalue UNE fois
--
-- LA CAUSE, VERIFIEE EN BASE : l operateur `@@` (`ts_match_vq`) n est pas
-- `leakproof` — `pg_proc.proleakproof` vaut `false`. Sous RLS, PostgreSQL
-- refuse donc de descendre ce predicat sous la qualification de securite : la
-- policy est evaluee D ABORD, LIGNE A LIGNE, et
-- `course_sections_search_idx` — l index GIN pose le 09/09 — devient
-- inutilisable. Le cout suit alors la TABLE ENTIERE et non le programme, parce
-- que le filtre RLS s applique avant la jointure sur `program_id`.
--
-- A RETENIR AU-DELA DE CE FICHIER : `search_course_sections` (09/09) n echappe
-- au probleme que parce qu elle filtre d abord sur `resource_id` — une egalite
-- sur uuid, elle, poussable sous la policy. C est son CADRAGE qui la rend
-- rapide, pas son index.
--
-- CE QUI NE CHANGE PAS : le droit lui-meme. Le predicat reste
-- `can_read_resource`, au mot pres, et la fonction reste `security definer`
-- comme elle l est depuis le 21/08 — voir la note de securite au § 1. Ce
-- fichier ne change QUE le nombre de fois ou ce predicat est evalue : une fois
-- par requete au lieu d une fois par ligne.
--
-- POURQUOI PAS LA FORME EVIDENTE. Inliner la sous-requete
-- (`resource_id in (select id from learning_resources where ...)`) aurait
-- semble plus simple ET AURAIT CHANGE LE DROIT EN SILENCE : une policy qui
-- joint une table applique AUSSI la RLS de cette table (lecon du 03/09, payee
-- sur une policy de stockage), alors que `can_read_resource` est `security
-- definer` et la contourne. Des sections aujourd hui lisibles auraient disparu
-- sans erreur. D ou la fonction ci-dessous, qui reproduit exactement le
-- contournement existant.

begin;

/* ================================================================== */
/* 1. L ensemble des supports lisibles par l appelant                  */
/* ================================================================== */

-- `security definer` ASSUME ET BORNE : elle ne rend que des IDENTIFIANTS, et
-- uniquement ceux que l appelant a deja le droit de lire — le corps est le
-- corps de `can_read_resource`, sans le filtre sur un id precis. Elle n ouvre
-- donc rien que `can_read_resource(uuid)` n ouvre deja depuis le 21/08. Ce n
-- est PAS le cas ecarte le 08/09 : celui-la rendait le CONTENU de l ouvrage a
-- tout compte connecte, sans aucune condition.
--
-- `stable` et SANS ARGUMENT : c est ce qui permet au planificateur de l
-- evaluer une seule fois par requete (sous-plan hache) au lieu d une fois par
-- ligne. C est tout l objet du fichier.
create or replace function public.readable_resource_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id
  from public.learning_resources r
  where public.is_program_staff(r.program_id)
     or (
       r.is_published
       and r.visibility in ('cohort', 'program')
       and public.is_enrolled_in_program(r.program_id)
     );
$$;

comment on function public.readable_resource_ids() is
  'Identifiants des supports lisibles par l appelant. Meme predicat que can_read_resource(uuid), evalue une fois par requete au lieu d une fois par ligne. Ne rend que des identifiants, jamais de contenu.';

revoke all on function public.readable_resource_ids() from public, anon, authenticated;
grant execute on function public.readable_resource_ids() to authenticated;

/* ================================================================== */
/* 2. La policy, meme droit, evalue une fois                           */
/* ================================================================== */

-- `resource_id` est NULLABLE. Les deux formes refusent la ligne dans ce cas —
-- `can_read_resource(null)` rend `false`, et `null in (...)` rend `null`, qui
-- n est pas `true`. Le comportement est identique, il est seulement moins
-- evident a lire : d ou cette note.
-- `alter policy` ET PAS `drop` + `create`, pour deux raisons.
-- D abord l intention : memes roles, meme commande, SEULE L EXPRESSION CHANGE —
-- un lecteur presse qui voit un `drop policy` se demande ce qui a ete retire.
-- Ensuite l environnement : depuis le 08/09 le classificateur refuse
-- l execution de DDL DESTRUCTIF depuis le navigateur, et le navigateur est la
-- seule route vers la base. Un `drop policy` aurait bloque la mise en base.
--
-- La policy existe depuis `20260908180000`, qui la cree inconditionnellement :
-- `alter` ne peut donc pas tomber sur une base a jour ni sur un rejeu complet.
alter policy course_sections_read on public.course_sections
  using (resource_id in (select public.readable_resource_ids()));

commit;
