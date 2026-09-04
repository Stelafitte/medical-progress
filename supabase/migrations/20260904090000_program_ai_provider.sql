/* ==================================================================
   ETAPE 0 DU COMPAGNON IA — le fournisseur et sa cle, choisis cote Admin.

   Decision de Stef, 04/09 : le fournisseur ne doit pas etre en dur ; on
   propose les TROIS (OpenAI, Anthropic, Mistral) et « on doit pouvoir changer
   quand on veut entre l'un ou l'autre ».

   CONSEQUENCE DIRECTE : UNE CLE PAR FOURNISSEUR, conservee. Une seule cle
   « active » aurait fait de chaque bascule une ressaisie — « changer quand on
   veut » serait devenu « retaper sa cle a chaque fois ». On garde donc les
   trois cles et on deplace un pointeur.

   LA CLE NE DOIT JAMAIS ATTEINDRE LE NAVIGATEUR, ni a l'ecriture ni a la
   relecture. Elle vit dans `vault.secrets` ; la table ci-dessous ne garde que
   l'IDENTIFIANT du secret et une empreinte affichable. Meme l'administrateur
   qui vient de la saisir ne peut pas la relire.

   POURQUOI UNE TABLE A PART, et non des colonnes sur `program_ai_settings` :
   la policy de cette derniere laisse l'APPRENANT lire la ligne entiere — c'est
   voulu, « un quota qu'on ne peut pas lire est un quota qu'on subit ». Or la
   RLS de Postgres est par LIGNE, pas par colonne : poser le fournisseur et
   l'identifiant du secret sur cette table les aurait donnes a tout etudiant
   inscrit. Une table separee est la seule maniere de restreindre.
   ================================================================== */

create type public.ai_provider as enum ('openai', 'anthropic', 'mistral');

create table public.program_ai_credentials (
  program_id uuid not null references public.programs (id) on delete cascade,
  provider public.ai_provider not null,
  -- Champ LIBRE et non une liste : les noms de modeles changent tous les
  -- trimestres. Une liste figee en base serait perimee avant la fin de l'annee.
  model text not null check (length(btrim(model)) between 1 and 120),
  -- L'identifiant du secret dans le coffre. JAMAIS la cle.
  secret_id uuid not null,
  -- Tout ce que l'ecran a le droit de montrer.
  key_hint text not null check (length(key_hint) between 1 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (program_id, provider)
);

alter table public.program_ai_credentials enable row level security;
-- AUCUN grant, AUCUNE policy : personne ne lit ni n'ecrit cette table
-- directement. Tout passe par les fonctions ci-dessous, qui verifient les
-- droits et ne rendent jamais la cle.
revoke all on public.program_ai_credentials from public, anon, authenticated;

-- Le fournisseur ACTIF, lui, peut rester sur la table lisible par l'apprenant :
-- savoir quel moteur repond n'est pas un secret, et c'est meme une information
-- honnete a donner a qui pose une question a une IA.
alter table public.program_ai_settings
  add column active_provider public.ai_provider;

/* ------------------------------------------------------------------
   LE GARDE-FOU : on n'ouvre pas l'IA sur un programme sans moteur.
   Une contrainte `check` ne peut pas regarder une autre table ; il faut
   un declencheur. Sans lui, `enabled = true` sans cle donne a l'etudiant
   une erreur brute au premier message.
   ------------------------------------------------------------------ */

create function public.program_ai_settings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.enabled then
    if new.active_provider is null then
      raise exception 'IA non ouverte : aucun fournisseur actif choisi pour ce programme.';
    end if;
    if not exists (
      select 1 from public.program_ai_credentials c
      where c.program_id = new.program_id and c.provider = new.active_provider
    ) then
      raise exception 'IA non ouverte : aucune cle enregistree pour le fournisseur %.', new.active_provider;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger program_ai_settings_guard_trg
before insert or update on public.program_ai_settings
for each row execute function public.program_ai_settings_guard();

/* ------------------------------------------------------------------
   ECRIRE : saisir ou remplacer la cle d'un fournisseur.
   ------------------------------------------------------------------ */

create function public.set_program_ai_credential(
  p_program_id uuid,
  p_provider public.ai_provider,
  p_model text,
  p_api_key text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing uuid;
  v_secret_id uuid;
  v_hint text;
  v_name text;
begin
  if not public.is_program_staff(p_program_id) then
    raise exception 'Droits insuffisants sur ce programme.';
  end if;
  if p_api_key is null or length(btrim(p_api_key)) < 8 then
    raise exception 'Cle API absente ou trop courte.';
  end if;
  if p_model is null or length(btrim(p_model)) = 0 then
    raise exception 'Modele absent.';
  end if;

  v_hint := right(btrim(p_api_key), 4);
  v_name := 'program_ai:' || p_program_id::text || ':' || p_provider::text;

  select c.secret_id into v_existing
  from public.program_ai_credentials c
  where c.program_id = p_program_id and c.provider = p_provider;

  if v_existing is null then
    v_secret_id := vault.create_secret(btrim(p_api_key), v_name, 'Cle API du fournisseur IA d un programme');
  else
    perform vault.update_secret(v_existing, btrim(p_api_key));
    v_secret_id := v_existing;
  end if;

  insert into public.program_ai_credentials (program_id, provider, model, secret_id, key_hint)
  values (p_program_id, p_provider, btrim(p_model), v_secret_id, v_hint)
  on conflict (program_id, provider) do update
    set model = excluded.model,
        secret_id = excluded.secret_id,
        key_hint = excluded.key_hint,
        updated_at = now();
end;
$$;

/* ------------------------------------------------------------------
   LIRE : ce que l'ecran d'administration a le droit de savoir.
   Ni la cle, ni l'identifiant du secret.
   ------------------------------------------------------------------ */

create function public.list_program_ai_credentials(p_program_id uuid)
returns table (
  provider public.ai_provider,
  model text,
  key_hint text,
  updated_at timestamptz,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_program_staff(p_program_id) then
    raise exception 'Droits insuffisants sur ce programme.';
  end if;
  return query
    select c.provider, c.model, c.key_hint, c.updated_at,
           coalesce(s.active_provider = c.provider, false)
    from public.program_ai_credentials c
    left join public.program_ai_settings s on s.program_id = c.program_id
    where c.program_id = p_program_id
    order by c.provider;
end;
$$;

/* ------------------------------------------------------------------
   BASCULER d'un fournisseur a l'autre. Le geste que Stef a demande.
   ------------------------------------------------------------------ */

create function public.set_program_ai_active_provider(
  p_program_id uuid,
  p_provider public.ai_provider
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_program_staff(p_program_id) then
    raise exception 'Droits insuffisants sur ce programme.';
  end if;
  if not exists (
    select 1 from public.program_ai_credentials
    where program_id = p_program_id and provider = p_provider
  ) then
    raise exception 'Aucune cle enregistree pour ce fournisseur.';
  end if;
  insert into public.program_ai_settings (program_id, active_provider)
  values (p_program_id, p_provider)
  on conflict (program_id) do update set active_provider = excluded.active_provider;
end;
$$;

/* ------------------------------------------------------------------
   RESOUDRE LA CLE — reserve au SERVEUR.
   C'est la seule porte par laquelle la cle sort du coffre, et elle n'est
   ouverte qu'a `service_role`, c'est-a-dire a l'Edge Function. Un client
   authentifie ne peut pas l'appeler.
   ------------------------------------------------------------------ */

create function public.resolve_program_ai_key(p_program_id uuid)
returns table (provider public.ai_provider, model text, api_key text)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  return query
    select c.provider, c.model, v.secret
    from public.program_ai_settings s
    join public.program_ai_credentials c
      on c.program_id = s.program_id and c.provider = s.active_provider
    join vault.secrets v on v.id = c.secret_id
    where s.program_id = p_program_id and s.enabled;
end;
$$;

revoke all on function public.program_ai_settings_guard() from public, anon, authenticated;
revoke all on function public.set_program_ai_credential(uuid, public.ai_provider, text, text) from public, anon;
revoke all on function public.list_program_ai_credentials(uuid) from public, anon;
revoke all on function public.set_program_ai_active_provider(uuid, public.ai_provider) from public, anon;
revoke all on function public.resolve_program_ai_key(uuid) from public, anon, authenticated;

grant execute on function public.set_program_ai_credential(uuid, public.ai_provider, text, text) to authenticated;
grant execute on function public.list_program_ai_credentials(uuid) to authenticated;
grant execute on function public.set_program_ai_active_provider(uuid, public.ai_provider) to authenticated;
grant execute on function public.resolve_program_ai_key(uuid) to service_role;
