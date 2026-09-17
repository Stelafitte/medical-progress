-- ============================================================================
-- LE BILAN DE FIN DE STAGE EXISTAIT DÉJÀ. IL LUI MANQUAIT SON APPRÉCIATION.
--
-- Stef, 17/09 : « le bilan de fin de stage se rattache à la période de stage ».
-- En allant l'écrire, j'ai trouvé mieux que ce que j'allais construire :
-- `validate_stage_log_block` connaît depuis le 31/08 la notion de PRONONCÉ —
-- le bloc de validation qui couvre le stage ENTIER, et qui revient au
-- responsable de stage ou à l'administration du programme, jamais à un
-- encadrant de semaine. C'est exactement le bilan de fin de stage : même
-- objet, même périmètre, même autorité.
--
-- Il n'y avait donc ni écran à inventer ni table à créer. Il manquait deux
-- choses, que la migration 20260917140000 a posées sur
-- `stage_log_validations` sans que rien ne les remplisse : l'APPRÉCIATION
-- d'ensemble et les RÉSERVES.
--
-- LA RÈGLE S'ÉCRIT TOUTE SEULE, ET C'EST LE SIGNE QUE LE MODÈLE EST JUSTE :
--   * une appréciation n'a de sens QUE sur un prononcé. « Satisfaisant » sur
--     la semaine 3 d'un stage de douze ne veut rien dire ;
--   * un prononcé qui VALIDE sans appréciation laisse le dossier muet à
--     l'endroit où on le relira dans deux ans — elle est donc exigée ;
--   * des réserves sans appréciation n'ont rien à qualifier — refusées ;
--   * un refus (`not_validated`) se motive déjà par le commentaire : on
--     n'exige pas une appréciation là où « insuffisant » serait une
--     redondance, mais on l'accepte.
--
-- Rien d'autre ne change : mêmes contrôles de période, mêmes rôles, même
-- retour. Les deux nouveaux paramètres ont une valeur par défaut, donc les
-- appels existants continuent de fonctionner à l'identique.
-- ============================================================================

/* La signature change : l'ancienne fonction part avec elle. */
drop function if exists public.validate_stage_log_block(uuid, date, date, text, text);

create or replace function public.validate_stage_log_block(
  p_stage_log_id uuid,
  p_covers_from date,
  p_covers_to date,
  p_decision text,
  p_comment text default '',
  /* Appréciation d'ensemble : réservée au prononcé. */
  p_appraisal text default null,
  p_reservations text default null
)
returns public.stage_log_validations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment_id uuid;
  v_program_id uuid;
  v_from date;
  v_to date;
  v_role public.role_name;
  v_prononce boolean;
  v_responsable boolean;
  v_appraisal text;
  v_reservations text;
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
  if p_decision not in ('validated', 'needs_revision', 'not_validated') then
    raise exception 'Decision invalide : attendu validated, needs_revision ou not_validated.';
  end if;
  if p_covers_to < p_covers_from then
    raise exception 'La periode validee est a l''envers.';
  end if;
  if p_covers_from < v_from or p_covers_to > v_to then
    raise exception 'La periode validee deborde du stage (% a %).', v_from, v_to;
  end if;

  v_responsable := public.can_administer_program(v_program_id) or exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid() and ra.program_id = v_program_id
      and ra.role = 'placement_manager' and ra.revoked_at is null
  );

  -- LE PRONONCE = le bloc qui couvre le stage entier.
  v_prononce := (p_covers_from <= v_from and p_covers_to >= v_to);

  if v_prononce and not v_responsable then
    raise exception
      'Le prononce du stage revient au responsable de stage ou a l''administration du programme. Vous pouvez valider des semaines.';
  end if;

  /* ---------------------------------------------------------------- */
  /* LE BILAN : appréciation et réserves, sur le prononcé seulement.   */
  /* ---------------------------------------------------------------- */
  v_appraisal := nullif(btrim(coalesce(p_appraisal, '')), '');
  v_reservations := nullif(btrim(coalesce(p_reservations, '')), '');

  if v_appraisal is not null and not v_prononce then
    raise exception
      'Une appreciation d''ensemble ne se porte que sur le prononce du stage, pas sur une semaine.'
      using errcode = 'check_violation';
  end if;
  if v_appraisal is not null
     and v_appraisal not in ('insuffisant', 'satisfaisant', 'très satisfaisant') then
    raise exception 'Appreciation inconnue : attendu insuffisant, satisfaisant ou tres satisfaisant.'
      using errcode = 'check_violation';
  end if;
  if v_prononce and p_decision = 'validated' and v_appraisal is null then
    raise exception 'Le prononce du stage porte une appreciation d''ensemble.'
      using errcode = 'check_violation';
  end if;
  if v_reservations is not null and v_appraisal is null then
    raise exception 'Des reserves sans appreciation n''ont rien a qualifier.'
      using errcode = 'check_violation';
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
    (stage_log_id, covers_from, covers_to, validator_person_id, validator_role,
     decision, comment, appraisal, reservations)
  values
    (p_stage_log_id, p_covers_from, p_covers_to, auth.uid(), v_role,
     p_decision, coalesce(p_comment, ''), v_appraisal, v_reservations)
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.validate_stage_log_block(uuid, date, date, text, text, text, text) is
  'Valide un bloc de carnet. Le PRONONCÉ — le bloc qui couvre le stage entier — est le bilan de fin de stage : il porte l''appréciation d''ensemble et les réserves, et revient au responsable de stage ou à l''administration.';

grant execute on function public.validate_stage_log_block(uuid, date, date, text, text, text, text)
  to authenticated;
