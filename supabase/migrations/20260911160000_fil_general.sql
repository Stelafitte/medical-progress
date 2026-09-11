/*
 * LE FIL SANS ANCRAGE : ecrire a un etudiant A PROPOS DE SON STAGE (11/09).
 *
 * CE QUI BLOQUAIT. `discussion_threads` exigeait qu'un fil pende a un acquis
 * OU a une journee de carnet -- jamais a rien. La regle etait juste pour les
 * echanges nes d'un contenu : « on ne parle pas de rien, on parle d'une
 * competence ou d'une journee ». Elle devient fausse des qu'on ecrit depuis le
 * bilan de stage : le message porte sur le stage entier, et surtout,
 * l'etudiant qu'on veut le plus joindre est celui qui N'A DECLARE AUCUNE
 * JOURNEE -- il n'offre donc aucun ancrage.
 *
 * CE QUE CETTE MIGRATION POSE :
 *   1. l'ancrage devient AU PLUS UN, au lieu d'EXACTEMENT UN : les deux nuls
 *      sont desormais valides et signifient « fil general de l'inscription » ;
 *   2. un troisieme index unique PARTIEL garantit qu'il n'y en a qu'UN par
 *      inscription -- sans lui, deux onglets ouverts creeraient deux fils
 *      generaux, et les deux moities de la conversation ne se verraient pas ;
 *   3. la fonction refuse toujours les DEUX ancrages a la fois, avec un
 *      message qui dit ce qui est refuse.
 *
 * ⚠️ CE N'EST PAS UNE MESSAGERIE. Un fil general par inscription, pas un par
 * sujet : il n'y a pas de ligne d'objet a saisir, donc rien qui permette de
 * distinguer deux fils generaux l'un de l'autre. La contrainte d'unicite EST
 * cette decision, ecrite dans la base plutot que dans l'ecran.
 *
 * ⚠️ AUCUN FIL EXISTANT N'EST TOUCHE : la contrainte est ELARGIE, jamais
 * resserree, donc toutes les lignes en place restent valides.
 */

alter table public.discussion_threads
  drop constraint if exists discussion_threads_un_seul_ancrage;

alter table public.discussion_threads
  add constraint discussion_threads_un_seul_ancrage
  check (not (outcome_id is not null and stage_log_entry_id is not null));

create unique index if not exists discussion_threads_general_uniq
  on public.discussion_threads (enrollment_id)
  where outcome_id is null and stage_log_entry_id is null;

create or replace function public.post_discussion_message(
  p_enrollment_id uuid,
  p_outcome_id uuid,
  p_stage_log_entry_id uuid,
  p_body text
) returns public.discussion_threads
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_thread public.discussion_threads;
  v_program_id uuid;
begin
  if not public.can_read_discussion(p_enrollment_id) then
    raise exception 'Droits insuffisants sur cette inscription.';
  end if;

  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Un message vide ne s''envoie pas.';
  end if;

  -- AU PLUS UN ANCRAGE. Les deux a la fois resteraient indecidables : le fil
  -- serait range sous une competence ET sous une journee, et deux ecrans
  -- differents en donneraient deux sujets differents.
  if p_outcome_id is not null and p_stage_log_entry_id is not null then
    raise exception 'Un fil pend a un acquis OU a une journee de carnet, pas aux deux.';
  end if;

  select e.program_id into v_program_id
  from public.enrollments e where e.id = p_enrollment_id;

  -- CHERCHER PUIS INSERER, ET NON `on conflict` : le piege du 09/09. Un
  -- `insert … on conflict` declenche les controles AVANT de detecter le
  -- conflit. Le rattrapage `unique_violation` couvre la course entre deux
  -- onglets, qui est le seul cas ou la ligne apparait entre les deux ordres.
  select * into v_thread from public.discussion_threads t
  where t.enrollment_id = p_enrollment_id
    and t.outcome_id is not distinct from p_outcome_id
    and t.stage_log_entry_id is not distinct from p_stage_log_entry_id;

  if v_thread.id is null then
    begin
      insert into public.discussion_threads
        (program_id, enrollment_id, outcome_id, stage_log_entry_id, opened_by)
      values (v_program_id, p_enrollment_id, p_outcome_id, p_stage_log_entry_id, auth.uid())
      returning * into v_thread;
    exception when unique_violation then
      select * into v_thread from public.discussion_threads t
      where t.enrollment_id = p_enrollment_id
        and t.outcome_id is not distinct from p_outcome_id
        and t.stage_log_entry_id is not distinct from p_stage_log_entry_id;
    end;
  end if;

  insert into public.discussion_messages (thread_id, author_person_id, body)
  values (v_thread.id, auth.uid(), btrim(p_body));

  update public.discussion_threads
     set last_message_at = now()
   where id = v_thread.id
  returning * into v_thread;

  -- L'AUTEUR A LU SON PROPRE MESSAGE. Sans cela, il verrait son fil signale
  -- comme non lu par ce qu'il vient d'ecrire.
  insert into public.discussion_thread_reads (thread_id, person_id, read_at)
  values (v_thread.id, auth.uid(), now())
  on conflict (thread_id, person_id) do update set read_at = now();

  return v_thread;
end;
$$;
