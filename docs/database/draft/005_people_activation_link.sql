-- Campus Santé Augmenté — rattachement automatique people -> profiles
--
-- ****************************************************************
-- BROUILLON — NON APPLIQUÉ. Ne pas exécuter sur un environnement
-- Supabase sans validation explicite. Dépend de 004_people_pre_account.sql
-- (lui-même non appliqué). Voir décision D94 dans
-- docs/database/draft/decision_log.md pour le raisonnement complet.
-- ****************************************************************
--
-- Ce que fait ce brouillon :
-- Quand une personne invitée via `people` se connecte réellement pour la
-- première fois, le déclencheur existant `handle_new_auth_user` (migration
-- 20260821090000) crée sa ligne `profiles`, INCHANGÉ. Ce fichier ajoute un
-- second déclencheur, après coup, sur `profiles` (pas sur `auth.users`, et
-- pas de modification de `handle_new_auth_user`) qui :
--   1. retrouve, via l'e-mail réel de auth.users, toute ligne `people` en
--      statut 'invited' pour ce même e-mail (une personne peut avoir été
--      invitée dans plusieurs programmes avec le même e-mail : toutes les
--      lignes correspondantes sont traitées, pas seulement la première) ;
--   2. marque chacune 'activated' et renseigne activated_profile_id ;
--   3. si une cohorte cible (intended_cohort_id) avait été fixée à la
--      création, crée l'inscription (enrollments) et le rôle apprenant
--      (role_assignments) correspondants — c'est ce qui fait qu'un import
--      ou ajout individuel se traduit, à la première connexion réelle, par
--      un apprenant effectivement inscrit dans son groupe, sans étape
--      manuelle supplémentaire pour le personnel du programme.
--
-- Ce que ce brouillon NE fait PAS :
-- il ne touche à aucune policy RLS, à aucune fonction de sécurité existante
-- (is_platform_admin, can_administer_program, is_program_staff,
-- is_enrolled_in_program, can_read_profile), et ne modifie pas
-- handle_new_auth_user. Il n'envoie aucun e-mail — l'envoi de l'invitation
-- initiale (avant cette étape) est un composant séparé, non couvert ici
-- (voir la note en fin de 004_people_pre_account.sql).

create function public.handle_people_activation()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  activated_email text;
  matched record;
begin
  select lower(btrim(email)) into activated_email
  from auth.users
  where id = new.id;

  if activated_email is null then
    return new;
  end if;

  for matched in
    select id, program_id, intended_cohort_id, origin, created_by
    from public.people
    where login_email = activated_email
      and status = 'invited'
      and activated_profile_id is null
  loop
    update public.people
    set status = 'activated',
        activated_profile_id = new.id
    where id = matched.id;

    if matched.intended_cohort_id is not null then
      insert into public.enrollments (person_id, program_id, cohort_id, status, created_at, updated_at)
      values (new.id, matched.program_id, matched.intended_cohort_id, 'active', now(), now())
      on conflict do nothing;

      insert into public.role_assignments (
        person_id, role, scope_kind, scope_id, program_id, granted_by
      )
      values (
        new.id, 'learner', 'cohort', matched.intended_cohort_id, matched.program_id, matched.created_by
      )
      on conflict do nothing;
    end if;
  end loop;

  return new;
end;
$$;

create trigger on_profile_created_link_people
after insert on public.profiles
for each row execute function public.handle_people_activation();

-- Remarque de conception, à trancher avant application :
-- `enrollments`/`role_assignments` n'ont pas de contrainte unique visible
-- dans la migration 20260821090000 qui empêcherait un doublon si ce
-- déclencheur s'exécutait deux fois pour la même personne/cohorte (peu
-- probable en pratique — profiles.id est la clé du déclencheur et une
-- ligne profiles n'est créée qu'une fois par utilisateur — mais à vérifier
-- explicitement avant application, `on conflict do nothing` ci-dessus
-- suppose une contrainte unique qui n'existe peut-être pas encore).
