-- RESULTATS ET SIGNALEMENTS DES QCM, COTE EQUIPE (15/09, suite).
--
-- Deux tables existaient sans ecran : question_attempts (chaque reponse d'un
-- etudiant, avec son score EDN) et question_reports (chaque signalement).
-- Cette migration pose les lectures agregees dont l'equipe a besoin, et
-- applique la decision de Stef sur les signalements : « ils remontent a toute
-- l'equipe d'encadrement, responsables de stage et administrateurs compris,
-- et sont traites par l'un d'eux ». resolve_question_report exigeait
-- can_administer_program ; c'est is_program_staff desormais. Publier ou
-- retirer une QUESTION (set_question_status) reste un geste d'administrateur.

-- 1. Les signalements, avec ce qu'il faut pour les lire d'un coup ---------
create or replace function public.list_question_reports(p_program_id uuid)
returns table (
  id uuid, question_id uuid, external_ref text, stem text, question_status text,
  reason text, message text, status text, reported_by_name text, created_at timestamptz,
  handled_by_name text, handled_at timestamptz, resolution text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.question_id, q.external_ref, q.stem, q.status,
         r.reason, r.message, r.status, rp.full_name, r.created_at,
         hp.full_name, r.handled_at, r.resolution
    from public.question_reports r
    join public.question_items q on q.id = r.question_id
    left join public.profiles rp on rp.id = r.reported_by
    left join public.profiles hp on hp.id = r.handled_by
   where r.program_id = p_program_id
     and public.is_program_staff(p_program_id)
   order by case r.status when 'nouveau' then 0 when 'en_revue' then 1 else 2 end, r.created_at desc;
$$;
revoke all on function public.list_question_reports(uuid) from public, anon;
grant execute on function public.list_question_reports(uuid) to authenticated;

-- Traiter un signalement : toute l'equipe.
create or replace function public.resolve_question_report(
  p_report_id uuid,
  p_status text,
  p_resolution text default null
)
returns public.question_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_r public.question_reports;
begin
  if p_status not in ('en_revue', 'corrige', 'confirme', 'rejete') then
    raise exception 'Statut de signalement inconnu : %', p_status;
  end if;
  select * into v_r from public.question_reports where id = p_report_id;
  if v_r.id is null then
    raise exception 'Signalement introuvable.';
  end if;
  if not public.is_program_staff(v_r.program_id) then
    raise exception 'Droits insuffisants pour traiter un signalement.';
  end if;
  update public.question_reports
     set status = p_status,
         resolution = nullif(btrim(coalesce(p_resolution, '')), ''),
         handled_by = auth.uid(),
         handled_at = now()
   where id = p_report_id
   returning * into v_r;
  return v_r;
end;
$$;
revoke all on function public.resolve_question_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_question_report(uuid, text, text) to authenticated;

-- 2. Les resultats d'une promotion, par etudiant ---------------------------
create or replace function public.question_results_by_learner(p_cohort_id uuid)
returns table (
  enrollment_id uuid, person_id uuid, full_name text,
  attempts bigint, distinct_questions bigint, avg_score numeric, last_answered_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.person_id, p.full_name,
         count(a.id), count(distinct a.question_id),
         round(avg(a.score), 2), max(a.answered_at)
    from public.enrollments e
    join public.profiles p on p.id = e.person_id
    left join public.question_attempts a on a.enrollment_id = e.id
   where e.cohort_id = p_cohort_id
     and e.status = 'active'
     and public.is_program_staff(e.program_id)
   group by e.id, e.person_id, p.full_name
   order by p.full_name;
$$;
revoke all on function public.question_results_by_learner(uuid) from public, anon;
grant execute on function public.question_results_by_learner(uuid) to authenticated;

-- 3. Les resultats d'une promotion, par theme : ou la promotion peche -------
create or replace function public.question_results_by_theme(p_cohort_id uuid)
returns table (theme_id uuid, theme_label text, attempts bigint, avg_score numeric, learners bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.theme_id, coalesce(t.label, 'Sans thème'),
         count(a.id), round(avg(a.score), 2), count(distinct a.enrollment_id)
    from public.question_attempts a
    join public.enrollments e on e.id = a.enrollment_id
    join public.question_items q on q.id = a.question_id
    join public.outcomes o on o.id = q.outcome_id
    left join public.outcome_themes t on t.id = o.theme_id
   where e.cohort_id = p_cohort_id
     and public.is_program_staff(e.program_id)
   group by o.theme_id, t.label, t.position
   order by t.position nulls last;
$$;
revoke all on function public.question_results_by_theme(uuid) from public, anon;
grant execute on function public.question_results_by_theme(uuid) to authenticated;

-- 4. Ce que l'etudiant voit de lui-meme : ses propres agregats -------------
create or replace function public.my_question_results(p_enrollment_id uuid)
returns table (attempts bigint, distinct_questions bigint, avg_score numeric, last_answered_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(a.id), count(distinct a.question_id), round(avg(a.score), 2), max(a.answered_at)
    from public.question_attempts a
    join public.enrollments e on e.id = a.enrollment_id
   where a.enrollment_id = p_enrollment_id
     and e.person_id = auth.uid();
$$;
revoke all on function public.my_question_results(uuid) from public, anon;
grant execute on function public.my_question_results(uuid) to authenticated;
