-- LE SIGNAL CONTRE LE BRUIT (25/09) + LES COURS REELLEMENT OUVERTS.
--
-- 1. `supervision_alerts` : la branche « competence insuffisamment exposee »
--    rendait une ligne par acquis. Mesure du 25/09 sur la centurie A : 54 a 55
--    « signaux » par etudiant, tous identiques, pour 18 etudiants sur 18. Une
--    colonne d'alerte que personne ne peut plus lire ne protege personne. La
--    branche est desormais AGREGEE : une ligne par inscription, qui dit combien
--    et depuis quand. Les quatre autres branches ne bougent pas.
--
-- 2. `course_opens_by_learner` : la plateforme enregistre depuis le 17/09
--    chaque ouverture de cours (`audit_events.event_type = 'course_opened'`,
--    migration 20260917100000) mais SEUL l'ecran des couts s'en servait. La
--    question de Stef du 25/09 -- « ce tableau permet-il de voir ce que les
--    etudiants ont reellement fait ? » -- n'avait donc pas de reponse : le
--    suivi ne montrait que le declaratif. Cette fonction rend, par inscription
--    d'une promotion, le nombre d'ouvertures, le nombre de cours DISTINCTS et
--    la derniere. Agregee, jamais le detail de ce qu'un etudiant a lu quand :
--    un suivi pedagogique n'est pas une surveillance de lecture.

create or replace function public.supervision_alerts(
  p_program_id uuid,
  p_jours_sans_saisie integer default 14,
  p_jours_faible_activite integer default 21,
  p_jours_validation integer default 10
)
returns table (
  alert_id text,
  kind text,
  severity text,
  program_id uuid,
  enrollment_id uuid,
  message text,
  due_on timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_program_staff(p_program_id) then
    raise exception 'Alertes réservées à l''équipe du programme.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  /* Les inscriptions à surveiller : actives, et dont le parcours n'est pas
     suspendu ou gelé. Alerter sur une promotion qu'on a soi-même mise en
     pause n'a aucun sens — c'est exactement le bruit qui fait cesser de lire
     les alertes. */
  with inscrits as (
    select e.id, e.program_id, e.cohort_id, c.starts_on
    from public.enrollments e
    join public.cohorts c on c.id = e.cohort_id
    where e.program_id = p_program_id
      and e.status = 'active'
      and not exists (
        select 1 from public.cohort_interruptions ci
        where ci.cohort_id = e.cohort_id
          and ci.ended_on is null
          and ci.mode in ('suspended', 'frozen')
      )
  ),

  /* 1. ABSENCE DE SAISIE : un carnet ouvert, une période en cours, et rien
        d'écrit depuis p_jours_sans_saisie jours. */
  sans_saisie as (
    select i.id as enrollment_id,
           max(le.occurred_on) as derniere
    from inscrits i
    join public.stage_logs sl
      on sl.enrollment_id = i.id
     and sl.status in ('draft', 'needs_revision')
     and current_date between sl.period_starts_on and sl.period_ends_on
    left join public.stage_log_entries le on le.stage_log_id = sl.id
    group by i.id
    having coalesce(max(le.occurred_on), current_date - 3650)
             < current_date - p_jours_sans_saisie
  ),

  /* 2. FAIBLE ACTIVITÉ : aucun geste d'aucune nature. Volontairement plus
        large et plus lente que l'absence de saisie. */
  derniers_gestes as (
    select i.id as enrollment_id,
           /* Aucun `epoch` ici : un parcours sans geste n'a pas « 20 000 jours
              d'inactivité », il n'a rien commencé. Le repère est alors le début
              de promotion, et le message le dit autrement. */
           greatest(
             (select max(qa.answered_at) from public.question_attempts qa
              where qa.enrollment_id = i.id),
             (select max(osr.declared_at) from public.outcome_self_reports osr
              where osr.enrollment_id = i.id),
             (select max(le.created_at)
              from public.stage_log_entries le
              join public.stage_logs sl on sl.id = le.stage_log_id
              where sl.enrollment_id = i.id)
           ) as dernier,
           i.starts_on
    from inscrits i
  ),
  faible_activite as (
    select d.enrollment_id, d.dernier
    from derniers_gestes d
    where coalesce(d.dernier, d.starts_on::timestamptz)
            < now() - make_interval(days => p_jours_faible_activite)
      /* Une promotion qui n'a pas encore commencé n'est pas inactive. */
      and d.starts_on is not null
      and d.starts_on <= current_date
  ),

  /* 3. QUOTA NON ATTEINT : le modèle de carnet porte {key, label, quota} ;
        on compare au compte déclaré. On n'alerte qu'après la fin de la
        période : avant, un quota non atteint est simplement un stage en
        cours. */
  quotas as (
    select i.id as enrollment_id,
           o.value ->> 'label' as objectif,
           (o.value ->> 'quota')::integer as attendu,
           coalesce(r.declared_count, 0) as declare,
           sl.period_ends_on
    from inscrits i
    join public.stage_logs sl on sl.enrollment_id = i.id
    join public.stage_log_templates t on t.id = sl.template_id
    cross join lateral jsonb_array_elements(coalesce(t.objectives, '[]'::jsonb)) as o(value)
    left join public.stage_logbook_reports r
      on r.enrollment_id = i.id
     and r.template_id = t.id
     and r.objective_key = (o.value ->> 'key')
    where sl.period_ends_on < current_date
      and (o.value ->> 'quota') ~ '^[0-9]+$'
      and (o.value ->> 'quota')::integer > 0
      and coalesce(r.declared_count, 0) < (o.value ->> 'quota')::integer
  ),

  /* 4. COMPÉTENCE INSUFFISAMMENT EXPOSÉE : une compétence rattachée à un
        jalon dont la semaine est passée, sans aucune auto-déclaration. */
  non_exposees as (
    select i.id as enrollment_id,
           o.label as competence,
           i.starts_on + (m.week_offset * 7) as echeance
    from inscrits i
    join public.plan_milestones m on m.cohort_id = i.cohort_id
    join public.plan_milestone_outcomes mo on mo.milestone_id = m.id
    join public.outcomes o on o.id = mo.outcome_id
    where i.starts_on is not null
      and i.starts_on + (m.week_offset * 7) < current_date
      and not exists (
        select 1 from public.outcome_self_reports osr
        where osr.enrollment_id = i.id
          and osr.outcome_id = mo.outcome_id
      )
  ),

  /* 5. VALIDATION EN RETARD : ce qui attend l'ÉQUIPE, pas l'étudiant. Deux
        sources : un carnet transmis qui n'a pas été repris, et une
        auto-déclaration jamais confirmée. */
  validations_carnet as (
    select i.id as enrollment_id, sl.updated_at as depuis
    from inscrits i
    join public.stage_logs sl on sl.enrollment_id = i.id
    where sl.status = 'submitted'
      and sl.updated_at < now() - make_interval(days => p_jours_validation)
  ),
  validations_competence as (
    select i.id as enrollment_id, min(osr.declared_at) as depuis
    from inscrits i
    join public.outcome_self_reports osr on osr.enrollment_id = i.id
    where osr.validated_at is null
      and osr.declared_at < now() - make_interval(days => p_jours_validation)
    group by i.id
  )

  select 'no_entry:' || s.enrollment_id::text,
         'no_entry', 'warning', p_program_id, s.enrollment_id,
         case when s.derniere is null
              then 'Carnet ouvert, aucune saisie depuis l''ouverture.'
              else 'Aucune saisie depuis le ' || to_char(s.derniere, 'DD/MM/YYYY') || '.'
         end,
         null::timestamptz
  from sans_saisie s

  union all
  select 'low_activity:' || f.enrollment_id::text,
         'low_activity', 'warning', p_program_id, f.enrollment_id,
         case when f.dernier is null
              then 'Aucune activité depuis le début de la promotion.'
              else 'Aucune activité depuis le ' || to_char(f.dernier, 'DD/MM/YYYY') || '.'
         end,
         null::timestamptz
  from faible_activite f

  union all
  select 'missing_quota:' || q.enrollment_id::text || ':' || q.objectif,
         'missing_quota', 'warning', p_program_id, q.enrollment_id,
         q.objectif || ' : ' || q.declare::text || ' sur ' || q.attendu::text || ' attendus.',
         q.period_ends_on::timestamptz
  from quotas q

  /* 25/09 -- UN SIGNAL, PAS CINQUANTE-CINQ. Cette branche rendait UNE LIGNE
     PAR ACQUIS : un etudiant jamais connecte declenchait 55 alertes qui
     disaient toutes la meme chose, et les vraies -- carnet transmis non
     repris, auto-declaration en attente -- disparaissaient dans le tas.
     Stef, le 25/09 : « 54-55 signaux, ca ne se lit plus ». On rend donc une
     seule ligne par inscription, qui PORTE LE COMPTE et la plus ancienne
     echeance ; le detail reste lisible acquis par acquis dans le suivi. */
  union all
  select 'underexposed_competence:' || n.enrollment_id::text,
         'underexposed_competence', 'info', p_program_id, n.enrollment_id,
         count(*)::text || ' acquis sans trace, jalon depasse (le plus ancien : '
           || to_char(min(n.echeance), 'DD/MM/YYYY') || ').',
         min(n.echeance)::timestamptz
  from non_exposees n
  group by n.enrollment_id

  union all
  select 'late_validation:carnet:' || v.enrollment_id::text,
         'late_validation', 'critical', p_program_id, v.enrollment_id,
         'Carnet transmis le ' || to_char(v.depuis, 'DD/MM/YYYY') || ', toujours pas repris.',
         v.depuis
  from validations_carnet v

  union all
  select 'late_validation:competence:' || w.enrollment_id::text,
         'late_validation', 'critical', p_program_id, w.enrollment_id,
         'Auto-déclaration en attente depuis le ' || to_char(w.depuis, 'DD/MM/YYYY') || '.',
         w.depuis
  from validations_competence w;
end;
$$;

comment on function public.supervision_alerts(uuid, integer, integer, integer) is
  'Alertes d''encadrement CALCULEES a la lecture. Aucune table : une alerte qui se stocke vieillit et ment. La branche acquis-sans-trace est agregee par inscription depuis le 25/09.';

/* ================================================================== */
/* Les cours reellement ouverts, par inscription                      */
/* ================================================================== */

create or replace function public.course_opens_by_learner(p_cohort_id uuid)
returns table (
  enrollment_id uuid,
  opens bigint,
  distinct_courses bigint,
  last_opened_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
begin
  select c.program_id into v_program_id from public.cohorts c where c.id = p_cohort_id;
  if v_program_id is null then
    raise exception 'Promotion introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.is_program_staff(v_program_id) then
    raise exception 'Lecture reservee a l''equipe du programme.'
      using errcode = 'insufficient_privilege';
  end if;

  /* La jointure passe par la PERSONNE : `audit_events` porte l'auteur, pas
     l'inscription. Un etudiant inscrit a deux programmes n'apporte donc ici
     que les ouvertures faites DANS ce programme -- d'ou le filtre sur
     `e.program_id`. */
  return query
  select en.id,
         count(a.id)::bigint,
         count(distinct a.entity_id)::bigint,
         max(a.occurred_at)
  from public.enrollments en
  left join public.audit_events a
    on a.actor_person_id = en.person_id
   and a.program_id = en.program_id
   and a.event_type = 'course_opened'
  where en.cohort_id = p_cohort_id
  group by en.id;
end;
$$;

comment on function public.course_opens_by_learner(uuid) is
  'Cours ouverts par inscription d une promotion : combien, combien de cours distincts, le dernier. Agrege volontairement (jamais le detail de lecture). Voir la migration 20260925090000.';

revoke all on function public.course_opens_by_learner(uuid) from public, anon;
grant execute on function public.course_opens_by_learner(uuid) to authenticated;
