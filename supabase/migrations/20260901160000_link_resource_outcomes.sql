-- Rattacher un support a des acquis DEJA existants, sans le recreer.
--
-- CE QUI MANQUAIT. `create_learning_resource` sait poser des liens, mais
-- seulement a la creation, et seulement vers des acquis qu'on vient de creer.
-- Rejouer un corpus sur un programme dont le referentiel existe deja n'avait
-- donc aucun moyen de dire « ce chapitre traite de ces 15 connaissances-la » :
-- il fallait soit recreer des acquis en double, soit ne rien rattacher.
--
-- C'est le cas concret du 01/09 : les 313 connaissances de la SFC sont en base,
-- et les 22 chapitres du meme site doivent s'y accrocher. Le rapprochement est
-- mecanique (le numero d'item est dans le nom du fichier ET dans le code), il
-- n'a pas a coûter un appel d'IA ni un doublon.
--
-- IDEMPOTENTE PAR CONSTRUCTION. `primary key (resource_id, outcome_id)` +
-- `on conflict do nothing` : rejouer le meme fichier ne cree rien de plus et
-- n'echoue pas. La fonction rend le NOMBRE de liens reellement ajoutes, pour
-- que l'ecran puisse dire « 15 rattachements, dont 0 nouveau » plutot que de
-- laisser croire a un travail qui n'a pas eu lieu.
--
-- ELLE AJOUTE, ELLE NE RETIRE JAMAIS. Choix de Stef le 01/09 : le chapitre 221
-- porte deja 16 liens vers les anciens codes du college ; les ECN-221 s'y
-- ajoutent. Les deux referentiels decrivent la meme matiere sous deux
-- decoupages, et retirer les anciens priverait les 14 connaissances
-- historiques de leur seul support. Une fonction qui remplacerait le lot
-- entier serait une autre fonction, avec un autre nom.
--
-- PAS D'AUDIT ICI, volontairement : `create_learning_resource` n'en pose pas
-- non plus, et un evenement par lien noierait le journal. Le lien est visible
-- dans l'ecran du support, il ne se perd pas.

create function public.link_resource_outcomes(
  p_resource_id uuid,
  p_outcome_ids uuid[]
) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_foreign integer;
  v_added integer;
begin
  select program_id into v_program_id
  from public.learning_resources where id = p_resource_id;

  if v_program_id is null then
    raise exception 'Support introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  if p_outcome_ids is null or array_length(p_outcome_ids, 1) is null then
    return 0;
  end if;

  -- Un support ne rattache que des acquis de SON programme. La table porte un
  -- `program_id` : un acquis etranger y ecrirait une ligne incoherente que rien
  -- ne viendrait contredire ensuite.
  select count(*) into v_foreign
  from public.outcomes o
  where o.id = any (p_outcome_ids)
    and o.program_id is distinct from v_program_id;

  if v_foreign > 0 then
    raise exception 'Un support ne peut être rattaché qu''à des acquis de son propre programme.';
  end if;

  with insere as (
    insert into public.learning_resource_outcomes (resource_id, outcome_id, program_id)
    select p_resource_id, o.id, v_program_id
    from public.outcomes o
    where o.id = any (p_outcome_ids)
    on conflict (resource_id, outcome_id) do nothing
    returning 1
  )
  select count(*) into v_added from insere;

  return v_added;
end;
$$;

revoke all on function public.link_resource_outcomes(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.link_resource_outcomes(uuid, uuid[]) to authenticated;
