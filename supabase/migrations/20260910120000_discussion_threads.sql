-- FILS DE DISCUSSION — une conversation RATTACHEE A UNE CHOSE.
--
-- Demande de Stef du 10/09 (ses points 3, 4 et 5, qui ne sont qu'un seul
-- objet manquant) : l'etudiant commente une competence ou une journee de
-- carnet, l'encadrant repond, et l'echange devient un chat ouvert visible des
-- deux cotes.
--
-- POURQUOI UNE TABLE NEUVE, ALORS QUE DEUX EXISTAIENT DEJA.
--   * `communication_campaigns` est de la DIFFUSION : audience, sujet, corps,
--     plafond de destinataires, une ligne de remise par personne. Aucun auteur
--     par message, aucun fil, aucun destinataire de reponse. Repondre a une
--     campagne n'a litteralement aucun endroit ou atterrir.
--   * `ai_threads` a la bonne forme -- un fil ancre sur `outcome_id` ou
--     `resource_id` -- mais son interlocuteur est un modele, pas une personne,
--     et sa comptabilite est celle des credits.
-- Ce que ces deux tables ne savent pas faire, c'est une conversation ENTRE
-- DEUX PERSONNES A PROPOS D'UN TIERS OBJET. D'ou celle-ci.
--
-- LES DEUX DECISIONS DE STEF, du 10/09 :
--   Q1 -- QUI OUVRE UN FIL : l'etudiant ET l'encadrant. Un encadrant peut donc
--        interpeller de sa propre initiative, il n'attend pas d'etre sollicite.
--   Q2 -- QUI VOIT : le GROUPE d'encadrants, pas seulement celui qui repond.
--        C'est exactement ce que `supervises_enrollment()` dit deja, et c'est
--        la fonction qui gouverne les carnets depuis le 31/08 -- donc l'ecran
--        et la RLS ne pourront pas diverger.
--
-- ⚠️ CONSEQUENCE ASSUMEE DE Q2 : `supervises_enrollment()` rend `true` pour
-- `can_administer_program` aussi. Un administrateur de programme lira donc les
-- fils. C'est deja le cas des CARNETS, qui contiennent le recit quotidien de
-- l'etudiant : appliquer une regle plus stricte ici aurait ete incoherent, et
-- surtout invisible a la lecture. Si Stef veut un jour soustraire les fils a
-- l'administration, c'est une policy a ecrire, pas une ligne a changer.

/* ================================================================== */
/* 1. Le fil                                                          */
/* ================================================================== */

-- ANCRAGE POLYMORPHE, mais borne par une contrainte : un fil pend a un ACQUIS
-- ou a une JOURNEE de carnet, jamais aux deux, jamais a rien. Un fil « libre »
-- serait une messagerie de plus, et c'est precisement ce dont on ne veut pas :
-- le sujet de la conversation, c'est l'objet auquel elle est accrochee.
create table public.discussion_threads (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  outcome_id uuid references public.outcomes (id) on delete cascade,
  stage_log_entry_id uuid references public.stage_log_entries (id) on delete cascade,
  opened_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  -- Denormalise A DESSEIN : trier « Mes messages » par activite recente sans
  -- agreger les messages a chaque lecture. Tenu par un declencheur, jamais par
  -- l'application -- une colonne que seul le client met a jour finit fausse.
  last_message_at timestamptz not null default now(),
  constraint discussion_threads_un_seul_ancrage check (
    (outcome_id is not null and stage_log_entry_id is null)
    or (outcome_id is null and stage_log_entry_id is not null)
  )
);

-- UN SEUL FIL PAR OBJET ET PAR ETUDIANT. Deux fils sur la meme competence
-- couperaient la conversation en deux sans que personne l'ait demande. Index
-- PARTIELS : `unique (enrollment_id, outcome_id)` ne suffirait pas, PostgreSQL
-- considerant deux NULL comme distincts.
create unique index discussion_threads_par_acquis_uniq
  on public.discussion_threads (enrollment_id, outcome_id)
  where outcome_id is not null;
create unique index discussion_threads_par_journee_uniq
  on public.discussion_threads (enrollment_id, stage_log_entry_id)
  where stage_log_entry_id is not null;

create index discussion_threads_enrollment_idx
  on public.discussion_threads (enrollment_id, last_message_at desc);
create index discussion_threads_program_idx
  on public.discussion_threads (program_id, last_message_at desc);

/* ================================================================== */
/* 2. Les messages                                                    */
/* ================================================================== */

create table public.discussion_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.discussion_threads (id) on delete cascade,
  author_person_id uuid not null references public.profiles (id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now()
);

create index discussion_messages_thread_idx
  on public.discussion_messages (thread_id, created_at);

/* ================================================================== */
/* 3. La lecture, par personne                                        */
/* ================================================================== */

-- PAS DE COLONNE `read_at` SUR LE MESSAGE. Q2 dit que le fil est visible par
-- TOUT le groupe d'encadrants : « lu » n'est donc pas une propriete du
-- message, c'est une relation entre une personne et un fil. Une colonne
-- unique aurait fait qu'un encadrant qui ouvre le fil l'eteigne pour ses
-- collegues -- l'alerte disparaitrait pour des gens qui n'ont rien lu.
create table public.discussion_thread_reads (
  thread_id uuid not null references public.discussion_threads (id) on delete cascade,
  person_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (thread_id, person_id)
);

/* ================================================================== */
/* 4. Qui a le droit                                                  */
/* ================================================================== */

-- La forme est copiee sur `stage_logs_select` (31/08), volontairement : le
-- titulaire de l'inscription, ou qui l'encadre.
create function public.can_read_discussion(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment_id and e.person_id = auth.uid()
  )
  or public.supervises_enrollment(p_enrollment_id);
$$;

revoke all on function public.can_read_discussion(uuid) from public, anon;
grant execute on function public.can_read_discussion(uuid) to authenticated;

alter table public.discussion_threads enable row level security;
alter table public.discussion_messages enable row level security;
alter table public.discussion_thread_reads enable row level security;

revoke all on public.discussion_threads from public, anon, authenticated;
revoke all on public.discussion_messages from public, anon, authenticated;
revoke all on public.discussion_thread_reads from public, anon, authenticated;

-- Lecture seule cote table : toute ECRITURE passe par une fonction, qui verifie
-- le droit et tient `last_message_at`. C'est la regle du depot depuis le 31/08.
grant select on public.discussion_threads to authenticated;
grant select on public.discussion_messages to authenticated;
grant select on public.discussion_thread_reads to authenticated;

create policy discussion_threads_select on public.discussion_threads
for select to authenticated
using (public.can_read_discussion(enrollment_id));

create policy discussion_messages_select on public.discussion_messages
for select to authenticated
using (
  exists (
    select 1 from public.discussion_threads t
    where t.id = discussion_messages.thread_id
      and public.can_read_discussion(t.enrollment_id)
  )
);

-- CHACUN NE VOIT QUE SES PROPRES ACCUSES DE LECTURE. Les exposer largement
-- transformerait un simple indicateur en « votre encadrant a vu votre message
-- a 23 h 14 » -- une information que personne n'a demande a publier.
create policy discussion_thread_reads_select on public.discussion_thread_reads
for select to authenticated
using (person_id = auth.uid());

/* ================================================================== */
/* 5. Ouvrir un fil, ou ecrire dedans                                 */
/* ================================================================== */

-- UNE SEULE PORTE POUR LES DEUX GESTES. Ouvrir un fil et y repondre sont le
-- meme geste vu a deux moments : on poste un message a propos d'un objet. Deux
-- fonctions auraient oblige l'ecran a savoir si le fil existe deja -- une
-- question a laquelle il ne peut pas repondre sans une lecture de plus, et une
-- course entre deux onglets ouverts.
create function public.post_discussion_message(
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

  if (p_outcome_id is null) = (p_stage_log_entry_id is null) then
    raise exception 'Un fil pend a un acquis OU a une journee de carnet.';
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

revoke all on function public.post_discussion_message(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.post_discussion_message(uuid, uuid, uuid, text)
  to authenticated;

/* ================================================================== */
/* 6. Marquer lu                                                      */
/* ================================================================== */

create function public.mark_discussion_thread_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment_id uuid;
begin
  select t.enrollment_id into v_enrollment_id
  from public.discussion_threads t where t.id = p_thread_id;

  if v_enrollment_id is null then
    raise exception 'Fil introuvable.';
  end if;
  if not public.can_read_discussion(v_enrollment_id) then
    raise exception 'Droits insuffisants sur ce fil.';
  end if;

  insert into public.discussion_thread_reads (thread_id, person_id, read_at)
  values (p_thread_id, auth.uid(), now())
  on conflict (thread_id, person_id) do update set read_at = now();
end;
$$;

revoke all on function public.mark_discussion_thread_read(uuid) from public, anon;
grant execute on function public.mark_discussion_thread_read(uuid) to authenticated;
