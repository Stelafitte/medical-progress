-- SYNCHRONISATION DE L EQUIPE D ENCADREMENT DEPUIS UN SERVICE.
--
-- Demande de Stef du 10/09 : recuperer l equipe d encadrement du 4eme Ouest
-- depuis UMCV Echocardio Planner, qui l expose sur un endpoint public protege
-- par jeton.
--
-- ⚠️ CE QUE CETTE SYNCHRONISATION NE FERA JAMAIS : CREER UN COMPTE.
-- MyCampus n a pas de backend a lui, et `auth.users` ne se fabrique pas depuis
-- une fonction applicative. Une synchronisation alimente donc le VIVIER
-- (`people`, statut `pending`) ; l invitation reste un geste humain. Ce n est
-- pas une limite subie : on n envoie pas onze invitations parce qu une API a
-- bouge.
--
-- ⚠️ ET ELLE NE RETIRE PERSONNE TOUTE SEULE. Un encadrant qui quitte le service
-- a valide des carnets et repondu dans des fils. Lui retirer son role parce
-- qu une date a change dans une AUTRE application, c est risquer de couper
-- quelqu un en plein stage. Les retraits sont PROPOSES, jamais appliques
-- (decision de Stef). `role_assignments.revoked_at` existe deja pour le jour ou
-- il coche.
--
-- ⚠️ AUCUNE TABLE DE PROPOSITIONS. L ecart entre l equipe rendue par l endpoint
-- et les encadrants actuels du groupe se RECALCULE a chaque affichage : le
-- persister creerait une file de travail a tenir d accord avec deux etats qui
-- bougent tous les deux. L historique ci-dessous est un JOURNAL, pas une file.
--
-- POURQUOI UNE TABLE DE SOURCES ET NON « 4O -> DFASM-CARDIO » EN DUR. Stef :
-- « si tout fonctionne et que l on etend a tous les services de cardio, alors
-- il y aura d autres equipes d encadrants ». Le modele sait deja le dire : un
-- service EST un terrain de stage (`placements`), et un groupe de supervision
-- est promotion x terrain x encadrants. Une source pointe donc un terrain.
--
-- CE QU ON N IMPORTE PAS : le champ `role` des CCA/Assistant (`AS ECHO`,
-- `ASCHIR 1`...). Decision de Stef : tous les CCA/Assistant entrent dans la
-- boucle d encadrement sans distinguer qui est au 4eme Ouest a l instant t --
-- parce que la rotation (~3 mois) est plus courte que le stage (11 semaines),
-- et qu il faut un continuum pour l etudiant. Ne pas importer ce champ, c est
-- une colonne de moins ET une donnee de moins qui puisse devenir fausse.
--   (Le continuum, lui, est deja acquis : le fil de discussion est visible par
--   TOUT le groupe d encadrants -- decision du 10/09 matin -- donc le CCA qui
--   arrive en cours de stage lit tout l historique sans reprise.)
--
-- LES INTERNES (`encadrant: false`) NE SONT PAS IMPORTES pour l instant, sur
-- decision de Stef. `people` saura les accueillir sans migration.

/* ================================================================== */
/* 1. L origine « synchronisation »                                    */
/* ================================================================== */

-- `people.origin` ne connaissait que la saisie manuelle et l import de fichier.
-- Une troisieme origine permet de RECONNAITRE les lignes venues d une source,
-- donc de ne jamais ecraser une personne saisie a la main.
alter table public.people drop constraint if exists people_origin_check;
alter table public.people
  add constraint people_origin_check
  check (origin in ('individual', 'import', 'sync'));

/* ================================================================== */
/* 2. La source                                                        */
/* ================================================================== */

create table public.encadrement_sources (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  -- UN SERVICE EST UN TERRAIN. C est ce qui rend l extension gratuite : un
  -- deuxieme service = un deuxieme terrain, une deuxieme source, rien a changer.
  placement_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 120),
  -- ⚠️ L ADRESSE DE BASE, SANS LE JETON. L endpoint UMCV porte le jeton DANS
  -- LE CHEMIN (`/api/public/equipe-4o/{TOKEN}`) : ranger l URL complete ici
  -- aurait remis le secret en clair dans une colonne, juste a cote du coffre
  -- cense le proteger. Defaut trouve au banc d essai, pas a la relecture.
  -- La fonction edge recompose `endpoint_url || '/' || jeton`.
  -- `https` impose par la base : une faute de frappe dans un champ
  -- d administration ne doit pas pouvoir faire partir un jeton en clair.
  endpoint_url text not null check (endpoint_url like 'https://%'),
  -- LE JETON N EST PAS ICI. Seul son identifiant dans `vault.secrets` l est,
  -- comme les cles IA depuis le 04/09.
  secret_id uuid not null,
  -- Les quatre derniers caracteres, pour que l ecran puisse dire QUEL jeton est
  -- en place sans jamais le montrer.
  token_hint text not null check (length(token_hint) between 1 and 8),
  active boolean not null default true,
  last_sync_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint encadrement_sources_placement_same_program
    foreign key (placement_id, program_id)
    references public.placements (id, program_id) on delete cascade,
  unique (program_id, label)
);

create index encadrement_sources_program_idx
  on public.encadrement_sources (program_id);

/* ================================================================== */
/* 3. Le journal des synchronisations                                  */
/* ================================================================== */

create table public.encadrement_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.encadrement_sources (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  members_seen integer not null default 0,
  people_added integer not null default 0,
  removals_proposed integer not null default 0,
  unchanged integer not null default 0,
  -- ⚠️ NE JAMAIS Y ECRIRE LA REPONSE BRUTE NI L URL COMPLETE : l URL PORTE LE
  -- JETON (`/api/public/equipe-4o/{TOKEN}`). Un journal d erreur est l endroit
  -- ou les secrets fuient le plus souvent, parce que personne ne le relit.
  error_message text check (error_message is null or length(error_message) <= 2000),
  run_by uuid references public.profiles (id) on delete set null
);

create index encadrement_sync_runs_source_idx
  on public.encadrement_sync_runs (source_id, started_at desc);

/* ================================================================== */
/* 4. Qui a le droit                                                   */
/* ================================================================== */

alter table public.encadrement_sources enable row level security;
alter table public.encadrement_sync_runs enable row level security;
revoke all on public.encadrement_sources from public, anon, authenticated;
revoke all on public.encadrement_sync_runs from public, anon, authenticated;
grant select on public.encadrement_sources to authenticated;
grant select on public.encadrement_sync_runs to authenticated;

-- `can_administer_program` et NON `is_program_staff` : brancher une source de
-- donnees externe sur un programme n est pas un geste d encadrant de stage.
-- Meme raisonnement que le reglage IA du 09/09.
create policy encadrement_sources_select on public.encadrement_sources
for select to authenticated
using (public.can_administer_program(program_id));

create policy encadrement_sync_runs_select on public.encadrement_sync_runs
for select to authenticated
using (
  exists (
    select 1 from public.encadrement_sources s
    where s.id = encadrement_sync_runs.source_id
      and public.can_administer_program(s.program_id)
  )
);

/* ================================================================== */
/* 5. Poser ou remplacer le jeton                                      */
/* ================================================================== */

-- Copie du motif de `set_program_ai_credentials` (04/09) : le clair traverse la
-- fonction, il ne se pose jamais dans une colonne.
create function public.set_encadrement_source(
  p_program_id uuid,
  p_placement_id uuid,
  p_label text,
  p_endpoint_url text,
  p_token text
) returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing_id uuid;
  v_existing_secret uuid;
  v_secret_id uuid;
  v_url text;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Droits insuffisants sur ce programme.';
  end if;
  if p_token is null or length(btrim(p_token)) < 8 then
    raise exception 'Jeton absent ou trop court.';
  end if;
  if p_endpoint_url is null or p_endpoint_url not like 'https://%' then
    raise exception 'L''adresse doit commencer par https://.';
  end if;

  /*
   * ON ACCEPTE L URL COMPLETE ET ON EN RETIRE LE JETON.
   *
   * L ecran laisse coller « l URL complete ou juste le jeton » : la forme la
   * plus naturelle est donc justement celle qui contient le secret. On coupe le
   * dernier segment s il EST le jeton, puis on refuse tout ce qui le contient
   * encore. Se contenter de documenter « mettez l URL de base » aurait produit
   * un jour une ligne avec le jeton dedans, et personne ne l aurait vue.
   */
  v_url := btrim(p_endpoint_url);
  v_url := regexp_replace(v_url, '/+$', '');
  if right(v_url, length(btrim(p_token)) + 1) = '/' || btrim(p_token) then
    v_url := left(v_url, length(v_url) - length(btrim(p_token)) - 1);
  end if;
  if position(btrim(p_token) in v_url) > 0 then
    raise exception 'L''adresse ne doit pas contenir le jeton.';
  end if;

  select s.id, s.secret_id into v_existing_id, v_existing_secret
  from public.encadrement_sources s
  where s.program_id = p_program_id and s.label = btrim(p_label);

  if v_existing_secret is null then
    v_secret_id := vault.create_secret(
      btrim(p_token),
      'encadrement_source:' || p_program_id::text || ':' || btrim(p_label),
      'Jeton d acces a une source d equipe d encadrement'
    );
  else
    perform vault.update_secret(v_existing_secret, btrim(p_token));
    v_secret_id := v_existing_secret;
  end if;

  if v_existing_id is null then
    insert into public.encadrement_sources
      (program_id, placement_id, label, endpoint_url, secret_id, token_hint, created_by)
    values (p_program_id, p_placement_id, btrim(p_label), v_url,
            v_secret_id, right(btrim(p_token), 4), auth.uid())
    returning id into v_existing_id;
  else
    update public.encadrement_sources
       set placement_id = p_placement_id,
           endpoint_url = v_url,
           secret_id = v_secret_id,
           token_hint = right(btrim(p_token), 4),
           updated_at = now()
     where id = v_existing_id;
  end if;

  return v_existing_id;
end;
$$;

revoke all on function public.set_encadrement_source(uuid, uuid, text, text, text)
  from public, anon;
grant execute on function public.set_encadrement_source(uuid, uuid, text, text, text)
  to authenticated;

/* ================================================================== */
/* 6. Lire le jeton — RESERVE A LA FONCTION EDGE                       */
/* ================================================================== */

-- Meme cloisonnement que `resolve_program_ai_key` (04/09) : revoquee a
-- `authenticated` compris. Un administrateur pilote la source, il n a jamais
-- besoin de RELIRE le jeton -- et ce qu on ne peut pas lire ne peut pas fuiter
-- par une capture d ecran.
create function public.resolve_encadrement_source(p_source_id uuid)
returns table (endpoint_url text, token text)
language sql
stable
security definer
set search_path = public, vault
as $$
  select s.endpoint_url, btrim(v.decrypted_secret)
  from public.encadrement_sources s
  join vault.decrypted_secrets v on v.id = s.secret_id
  where s.id = p_source_id and s.active;
$$;

/* ================================================================== */
/* 7. Un jeton ne survit pas a sa source                               */
/* ================================================================== */

-- ⚠️ SANS CECI, SUPPRIMER UNE SOURCE LAISSE SON JETON DANS LE COFFRE, pour
-- toujours et sans rien qui le designe. Un secret orphelin est un secret que
-- plus personne ne fera tourner et que plus personne ne pensera a revoquer.
-- Trouve au banc d essai en comptant les lignes de `vault.secrets`.
create function public.encadrement_source_purge_secret()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $purge$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$purge$;

create trigger encadrement_sources_purge_secret
after delete on public.encadrement_sources
for each row execute function public.encadrement_source_purge_secret();

revoke all on function public.encadrement_source_purge_secret() from public, anon, authenticated;

revoke all on function public.resolve_encadrement_source(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_encadrement_source(uuid) to service_role;
