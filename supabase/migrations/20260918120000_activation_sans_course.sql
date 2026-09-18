-- 18/09 -- L'ACTIVATION NE DEPEND PLUS DE L'ORDRE DES OPERATIONS
--
-- LE CONSTAT (mesure en base le 18/09, premiere invitation jamais menee a son
-- terme) : le compte invite a ete cree a 11:32:54.226, la fiche du vivier est
-- passee a `invited` a 11:32:55.208. `invite-person` cree le compte AVANT de
-- marquer la fiche ; la creation du compte cree le profil ; le declencheur
-- `on_profile_created_link_people` cherche alors une fiche `invited`... qui ne
-- l'est pas encore. Resultat : connexion reussie, 0 inscription, 0 role.
-- AUCUN etudiant invite n'obtenait l'acces a son programme.
--
-- ET L'AUTRE FACE : un compte qui existe deja (un etudiant du DFASM ajoute au
-- DIU) ne recree jamais de profil, donc le declencheur ne se leve jamais.
-- Sa fiche restait `pending` pour toujours. Et meme leve, il aurait echoue :
-- `activated_profile_id` etait UNIQUE sur toute la table, alors qu'une meme
-- personne a une fiche par programme.
--
-- LE CORRECTIF, en trois pieces :
--   1. le corps de l'activation passe dans une fonction unique,
--      `activate_people_row`, appelee des deux cotes ;
--   2. cote PROFIL : le declencheur accepte `pending` ET `invited` -- la
--      course disparait, l'ordre des ecritures ne compte plus ;
--   3. cote VIVIER : nouveau declencheur -- une fiche creee (ou remise en
--      attente) pour une adresse qui a DEJA un compte est activee aussitot.
-- L'unicite passe a (programme, profil).
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : rattraper les fiches deja bloquees.
-- Ce rattrapage est un fichier a part, precede d'une liste en lecture seule
-- que Stef valide avant execution.
--
-- REJOUABLE.

/* 1. Unicite par programme ---------------------------------------------- */

-- Par son NOM ne suffit pas : la table a ete reconstruite le 30/08 a partir
-- de la base, et rien ne garantit que la contrainte y porte le nom par
-- defaut. On retire donc toute contrainte UNIQUE portant sur cette seule
-- colonne, quel que soit son nom.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.people'::regclass
      and con.contype = 'u'
      and con.conkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.people'::regclass and attname = 'activated_profile_id'
      )]::smallint[]
  loop
    execute format('alter table public.people drop constraint %I', c.conname);
  end loop;
end $$;

create unique index if not exists people_program_activated_profile_unique
  on public.people (program_id, activated_profile_id)
  where activated_profile_id is not null;

/* 2. Le corps de l'activation, une seule fois ---------------------------- */

create or replace function public.activate_people_row(p_people_id uuid, p_profile_id uuid)
returns void
language plpgsql security definer
set search_path to 'public', 'auth', 'pg_temp' as $function$
declare
  matched record;
begin
  select id, program_id, intended_cohort_id, intended_role,
         intended_placement_id, created_by
  into matched
  from public.people
  where id = p_people_id
    and status in ('pending', 'invited')
    and activated_profile_id is null;

  if not found then
    return;
  end if;

  -- `invited_at` est exige des qu'une fiche est `invited` OU `activated`
  -- (`people_status_invited_coherent`). Une fiche activee sans invitation
  -- (compte deja existant) prend donc la date de son activation.
  update public.people
  set status = 'activated',
      activated_profile_id = p_profile_id,
      invited_at = coalesce(invited_at, now())
  where id = matched.id;

  -- VOIE APPRENANT -- identique au 10/09.
  if matched.intended_cohort_id is not null
     and coalesce(matched.intended_role, 'learner') = 'learner' then
    insert into public.enrollments (person_id, program_id, cohort_id, status, created_at, updated_at)
    values (p_profile_id, matched.program_id, matched.intended_cohort_id, 'active', now(), now())
    on conflict do nothing;

    insert into public.role_assignments (
      person_id, role, scope_kind, scope_id, program_id, granted_by
    )
    values (
      p_profile_id, 'learner', 'cohort', matched.intended_cohort_id, matched.program_id, matched.created_by
    )
    on conflict do nothing;
  end if;

  -- VOIE TERRAIN -- identique au 10/09 (encadrant et responsable de stage,
  -- continuum : l'encadrant entre dans tous les groupes du terrain).
  if matched.intended_role in ('placement_supervisor', 'placement_manager')
     and matched.intended_placement_id is not null then
    insert into public.role_assignments (
      person_id, role, scope_kind, scope_id, program_id, granted_by
    )
    values (
      p_profile_id, matched.intended_role, 'placement',
      matched.intended_placement_id, matched.program_id, matched.created_by
    )
    on conflict do nothing;

    insert into public.supervision_group_supervisors (group_id, person_id)
    select g.id, p_profile_id
    from public.supervision_groups g
    where g.placement_id = matched.intended_placement_id
      and matched.intended_role = 'placement_supervisor'
    on conflict do nothing;
  end if;
end;
$function$;

revoke all on function public.activate_people_row(uuid, uuid) from public, anon, authenticated;

/* 3. Cote PROFIL : pending OU invited ------------------------------------ */

create or replace function public.handle_people_activation()
returns trigger
language plpgsql security definer
set search_path to 'public', 'auth', 'pg_temp' as $function$
declare
  activated_email text;
  row_id uuid;
begin
  select lower(btrim(email)) into activated_email
  from auth.users
  where id = new.id;

  if activated_email is null then
    return new;
  end if;

  for row_id in
    select id from public.people
    where login_email = activated_email
      and status in ('pending', 'invited')
      and activated_profile_id is null
  loop
    perform public.activate_people_row(row_id, new.id);
  end loop;

  return new;
end;
$function$;

/* 4. Cote VIVIER : le compte existe deja --------------------------------- */

create or replace function public.handle_people_existing_account()
returns trigger
language plpgsql security definer
set search_path to 'public', 'auth', 'pg_temp' as $function$
declare
  existing_profile uuid;
begin
  if new.status not in ('pending', 'invited') or new.activated_profile_id is not null then
    return new;
  end if;

  select p.id into existing_profile
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(btrim(u.email)) = new.login_email
  limit 1;

  if existing_profile is not null then
    perform public.activate_people_row(new.id, existing_profile);
  end if;

  return new;
end;
$function$;

drop trigger if exists people_link_existing_account on public.people;
create trigger people_link_existing_account
after insert or update of status, login_email, intended_cohort_id on public.people
for each row execute function public.handle_people_existing_account();

/* 5. Une fiche activee ne redescend pas ---------------------------------- */
-- `invite-person` marque la fiche `invited` APRES avoir cree le compte. Avec
-- la piece 3, la fiche est deja `activated` a ce moment-la : l'ecriture
-- violerait `people_status_activation_coherent` et la fonction rendrait
-- « e-mail envoye, mais statut non mis a jour ». On garde `activated` et on
-- trace quand meme la date d'invitation.

create or replace function public.people_keep_activated()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp' as $function$
begin
  if old.status = 'activated' and new.status = 'invited' then
    new.status := 'activated';
    new.activated_profile_id := old.activated_profile_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists people_keep_activated on public.people;
create trigger people_keep_activated
before update of status on public.people
for each row execute function public.people_keep_activated();
