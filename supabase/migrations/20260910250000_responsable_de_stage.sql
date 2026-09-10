-- LE RESPONSABLE DE STAGE FAIT TOUT CE QUE FAIT UN ENCADRANT, ET PLUS.
--
-- DECISION DE STEF, 10/09 au soir : « Un responsable de stage doit avoir les
-- memes fonctionnalites qu un encadrant. Mais en plus il peut valider le stage
-- et envoyer des messages via l outil de communication interne. »
--
-- Le role `placement_manager` a ete cree le meme jour (migration
-- 20260910220000) et laisse DELIBEREMENT hors de `is_program_staff`, faute de
-- savoir alors ce qu il devait voir. On le sait maintenant.
--
-- UNE SEULE PORTE OUVRE LES DEUX BESOINS. `is_program_staff` garde les lectures
-- de presque tout le depot ET les trois fonctions de communication interne
-- (`program_directory`, `create_communication_campaign`,
-- `confirm_communication_campaign`). Y ajouter le role donne d un meme geste
-- l espace d encadrement et l envoi de messages.
--
-- ⚠️ ET LA CLOTURE DU STAGE RESTE OUVERTE A TOUS (decision de Stef) : on
-- n ajoute aucune restriction a `validate_stage_log_block`. L encadrant garde
-- le droit de clore un stage, le responsable l a en plus du reste.

/* ================================================================== */
/* 1. La porte de lecture                                              */
/* ================================================================== */

create or replace function public.is_program_staff(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.can_administer_program(p_program_id) or exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid()
      and ra.program_id = p_program_id
      and ra.role in ('teacher', 'placement_supervisor', 'placement_manager')
      and ra.revoked_at is null
  );
$$;

/* ================================================================== */
/* 2. Le perimetre : un terrain, pas des groupes                       */
/* ================================================================== */

-- L ENCADRANT SUIT DES GROUPES, LE RESPONSABLE REPOND D UN TERRAIN. C est la
-- difference de nature entre les deux, et elle se lit ici : le premier passe
-- par `supervision_group_supervisors`, le second par son role, dont la portee
-- EST le terrain. Le rattacher aux groupes aurait marche aussi, et aurait cree
-- deux chemins vers le meme droit -- donc un jour deux verites.
create or replace function public.supervises_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment_id
      and public.can_administer_program(e.program_id)
  )
  or exists (
    select 1
    from public.supervision_group_supervisors s
    join public.supervision_group_members m on m.group_id = s.group_id
    where s.person_id = auth.uid()
      and m.enrollment_id = p_enrollment_id
  )
  or exists (
    select 1
    from public.role_assignments ra
    join public.supervision_groups g on g.placement_id = ra.scope_id
    join public.supervision_group_members m on m.group_id = g.id
    where ra.person_id = auth.uid()
      and ra.role = 'placement_manager'
      and ra.scope_kind = 'placement'
      and ra.revoked_at is null
      and m.enrollment_id = p_enrollment_id
  );
$$;

/* ================================================================== */
/* 3. Sa signature doit pouvoir s ecrire                               */
/* ================================================================== */

-- ⚠️ SANS CETTE LIGNE, TOUTE VALIDATION DE SA PART ECHOUE. La contrainte
-- n acceptait que trois roles ; `validate_stage_log_block` aurait pose
-- `placement_manager` et la base aurait refuse la ligne -- une erreur
-- incomprehensible a l ecran, pour un droit qu on croyait accorde.
alter table public.stage_log_validations
  drop constraint if exists stage_log_validations_validator_role_check;

alter table public.stage_log_validations
  add constraint stage_log_validations_validator_role_check
  check (validator_role in
    ('placement_supervisor', 'placement_manager', 'teacher', 'administrator'));

/* ================================================================== */
/* 4. La trace dit qui a valide, et a quel titre                       */
/* ================================================================== */

create or replace function public.validate_stage_log_block(
  p_stage_log_id uuid,
  p_covers_from date,
  p_covers_to date,
  p_decision text,
  p_comment text default ''
) returns public.stage_log_validations
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment_id uuid;
  v_program_id uuid;
  v_from date;
  v_to date;
  v_role public.role_name;
  v_row public.stage_log_validations;
begin
  select l.enrollment_id, l.program_id, l.period_starts_on, l.period_ends_on
    into v_enrollment_id, v_program_id, v_from, v_to
  from public.stage_logs l where l.id = p_stage_log_id;

  if v_enrollment_id is null then
    raise exception 'Carnet introuvable.';
  end if;
  if not public.supervises_enrollment(v_enrollment_id) then
    raise exception 'Vous n''encadrez pas cet etudiant.';
  end if;
  if p_decision not in ('validated', 'needs_revision') then
    raise exception 'Decision invalide : attendu validated ou needs_revision.';
  end if;
  if p_covers_to < p_covers_from then
    raise exception 'La periode validee est a l''envers.';
  end if;
  if p_covers_from < v_from or p_covers_to > v_to then
    raise exception 'La periode validee deborde du stage (% a %).', v_from, v_to;
  end if;

  if public.can_administer_program(v_program_id) then
    v_role := 'administrator';
  elsif exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid() and ra.program_id = v_program_id
      and ra.role = 'teacher' and ra.revoked_at is null
  ) then
    v_role := 'teacher';
  elsif exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid() and ra.program_id = v_program_id
      and ra.role = 'placement_manager' and ra.revoked_at is null
  ) then
    v_role := 'placement_manager';
  else
    v_role := 'placement_supervisor';
  end if;

  insert into public.stage_log_validations
    (stage_log_id, covers_from, covers_to, validator_person_id, validator_role, decision, comment)
  values
    (p_stage_log_id, p_covers_from, p_covers_to, auth.uid(), v_role,
     p_decision, coalesce(p_comment, ''))
  returning * into v_row;

  return v_row;
end;
$$;

/* ================================================================== */
/* 5. L activation reconnait le nouveau role                           */
/* ================================================================== */

create or replace function public.handle_people_activation()
returns trigger
language plpgsql security definer
set search_path to 'public', 'auth', 'pg_temp' as $function$
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
    select id, program_id, intended_cohort_id, intended_role,
           intended_placement_id, origin, created_by
    from public.people
    where login_email = activated_email
      and status = 'invited'
      and activated_profile_id is null
  loop
    update public.people
    set status = 'activated',
        activated_profile_id = new.id
    where id = matched.id;

    -- VOIE APPRENANT -- inchangee. `coalesce` parce que les lignes creees
    -- avant cette migration ne portent pas d intention explicite et etaient,
    -- par construction, des apprenants.
    if matched.intended_cohort_id is not null
       and coalesce(matched.intended_role, 'learner') = 'learner' then
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

    -- VOIE TERRAIN -- l encadrant, et depuis le 10/09 au soir le RESPONSABLE
    -- DE STAGE. Le role est porte par le TERRAIN, jamais par la promotion :
    -- `placement_supervisor_scope` (21/08) l impose pour l un, et le perimetre
    -- du responsable est de toute facon celui du terrain entier.
    --
    -- ⚠️ SANS CE `in (...)`, Marina Dijos -- passee responsable de stage le
    -- 10/09 -- activerait son compte SANS AUCUN ROLE. C est exactement le
    -- blocage repare le matin meme, revenu par une autre porte : un role neuf
    -- que le declencheur d activation ne connait pas.
    if matched.intended_role in ('placement_supervisor', 'placement_manager')
       and matched.intended_placement_id is not null then
      insert into public.role_assignments (
        person_id, role, scope_kind, scope_id, program_id, granted_by
      )
      values (
        new.id, matched.intended_role, 'placement',
        matched.intended_placement_id, matched.program_id, matched.created_by
      )
      on conflict do nothing;

      -- LE CONTINUUM (decision de Stef, 10/09) : tous les CCA et assistants du
      -- service encadrent TOUS les groupes du terrain, sans chercher qui est
      -- affecte au 4O telle semaine. Un encadrant qui change de secteur en
      -- cours de stage ne coupe pas le suivi de ses etudiants, et son
      -- remplacant prend le relais sans geste d administration.
      -- ⚠️ SEUL L ENCADRANT ENTRE DANS LES GROUPES. Le responsable de stage
      -- couvre le terrain entier par `supervises_enrollment` : l inscrire
      -- aussi dans chaque groupe donnerait DEUX chemins vers le meme droit,
      -- qui finiraient par diverger le jour ou l un des deux serait revoque.
      insert into public.supervision_group_supervisors (group_id, person_id)
      select g.id, new.id
      from public.supervision_groups g
      where g.placement_id = matched.intended_placement_id
        and matched.intended_role = 'placement_supervisor'
      on conflict do nothing;
    end if;
  end loop;

  return new;
end;
$function$;
