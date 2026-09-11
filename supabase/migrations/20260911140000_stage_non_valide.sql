/*
 * LA TROISIEME DECISION : « stage non valide » (11/09).
 *
 * POURQUOI. L'ecran du responsable de stage distingue cinq etats, dont deux
 * que la base confondait : « en attente » (le carnet repart chez l'etudiant,
 * il peut completer) et « non valide » (le stage est refuse). Les deux
 * s'ecrivaient `needs_revision` : l'etudiant lisait « a corriger » dans les
 * deux cas, et le tableau ne pouvait pas afficher l'etat qu'il annoncait.
 *
 * CE QUE CETTE MIGRATION POSE :
 *   1. `not_validated` accepte par la contrainte de `stage_log_validations` ;
 *   2. la meme valeur acceptee par `validate_stage_log_block` ;
 *   3. LE PRONONCE SUR TOUTE LA PERIODE RESERVE AU RESPONSABLE DE STAGE ou a
 *      l'administration du programme — la regle posee par Stef le 11/09
 *      (« les encadrants peuvent valider la presence et confirmer les
 *      competences, mais PAS la validation du passeport ou du programme »),
 *      jusqu'ici tenue par le seul ecran.
 *
 * ⚠️ LA REGLE 3 NE TOUCHE PAS AU GESTE DE L'ENCADRANT. Il valide des BLOCS —
 * une semaine, deux — et cela continue. Ce qui lui est refuse est le bloc qui
 * couvre le stage ENTIER, c'est-a-dire le prononce. La distinction se lit sur
 * les bornes, pas sur une intention declaree.
 *
 * ⚠️ AUCUNE LIGNE EXISTANTE N'EST REECRITE : `needs_revision` garde son sens,
 * et les validations deja prononcees restent telles quelles.
 */

alter table public.stage_log_validations
  drop constraint if exists stage_log_validations_decision_check;

alter table public.stage_log_validations
  add constraint stage_log_validations_decision_check
  check (decision in ('validated', 'needs_revision', 'not_validated'));

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
  v_prononce boolean;
  v_responsable boolean;
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
