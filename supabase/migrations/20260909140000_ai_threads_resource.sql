-- OUVRIR UN FIL D ASSISTANT SUR UN CHAPITRE, ET PAS SEULEMENT SUR UN ACQUIS.
--
-- CE QUI MANQUAIT (demande de Stef, 09/09) : « je mettrais, quand il est
-- active, le module IA compagnon entre le bouton Masquer le texte du chapitre
-- et le texte. IA compagnon s appliquerait a TOUT LE TEXTE. »
--
-- Un fil ne savait designer qu un acquis (`ai_threads.outcome_id`). Sans point
-- d ancrage sur le SUPPORT, la fonction edge n avait aucun moyen de savoir de
-- quel chapitre on parle : elle serait retombee sur une recherche dans tout le
-- programme, c est-a-dire dans les vingt-trois chapitres — l inverse de ce qui
-- est demande, et sans que rien a l ecran ne le laisse voir.
--
-- UNE NOUVELLE FONCTION, ET NON UN PARAMETRE DE PLUS SUR `start_ai_thread`.
-- Ajouter `p_resource_id default null` a la fonction existante creerait une
-- SURCHARGE : deux fonctions de meme nom, et PostgREST ne saurait plus laquelle
-- appeler. La remplacer supposerait un `drop function` — que le classificateur
-- du navigateur refuse d executer, et qui casserait tout appel en vol pendant
-- la migration. Un nom qui dit ce qu il fait coute moins cher que les deux.

alter table public.ai_threads
  add column resource_id uuid references public.learning_resources (id) on delete cascade;

-- LES TROIS MEMES GARDES QUE `start_ai_thread`, PLUS UNE.
--
--   1. le fil est ouvert sur SA PROPRE inscription ;
--   2. l IA est ouverte sur le programme — l absence de reglage vaut refus ;
--   3. le support appartient au programme de l inscription ;
--   4. et il est LISIBLE par l appelant (`can_read_resource`).
--
-- LE QUATRIEME N EST PAS REDONDANT AVEC LE TROISIEME. Un chapitre peut
-- appartenir au bon programme sans etre publie : ouvrir un fil dessus
-- donnerait a l etudiant un assistant qui cite un texte qu il n a pas le droit
-- de lire — la meme faille que celle evitee de justesse le 08/09 sur
-- `read_chapter_sections`, par le meme raisonnement.
create function public.start_ai_thread_for_resource(
  p_enrollment_id uuid,
  p_resource_id uuid,
  p_title text default ''
)
returns public.ai_threads
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.ai_threads;
begin
  if not public.owns_enrollment(p_enrollment_id) then
    raise exception 'Cette inscription n''est pas la votre.';
  end if;

  select e.program_id into v_program_id
  from public.enrollments e where e.id = p_enrollment_id;

  if not exists (
    select 1 from public.program_ai_settings s
    where s.program_id = v_program_id and s.enabled
  ) then
    raise exception 'Le compagnon IA n''est pas ouvert sur ce programme.';
  end if;

  if not exists (
    select 1 from public.learning_resources r
    where r.id = p_resource_id and r.program_id = v_program_id
  ) then
    raise exception 'Ce support n''appartient pas a ce programme.';
  end if;

  if not public.can_read_resource(p_resource_id) then
    raise exception 'Ce support ne vous est pas accessible.';
  end if;

  -- `scope` reste `knowledge` : les deux corpus du modele sont « les savoirs »
  -- et « les competences », et un chapitre du referentiel est du premier.
  -- `outcome_id` reste nul — c est precisement ce qui distingue un fil de
  -- chapitre d un fil d acquis, et ce que la fonction edge lira pour choisir
  -- entre `read_chapter_sections` et `read_outcome_sections`.
  insert into public.ai_threads (enrollment_id, program_id, scope, title, resource_id)
  values (p_enrollment_id, v_program_id, 'knowledge', left(coalesce(p_title, ''), 200), p_resource_id)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.start_ai_thread_for_resource(uuid, uuid, text) from public, anon;
grant execute on function public.start_ai_thread_for_resource(uuid, uuid, text) to authenticated;
