-- MES RESULTATS PAR ITEM (15/09, soir).
--
-- Stef : « dans les Statistiques de l'etudiant doivent apparaitre tous les
-- resultats des evaluations ». L'etudiant avait ses agregats globaux
-- (my_question_results) ; il lui manque la lecture par item — ou il pèche —
-- que l'equipe a deja pour la promotion (question_results_by_theme). Meme
-- forme, restreinte a SON inscription : personne d'autre ne peut la lire.
create or replace function public.my_question_results_by_theme(p_enrollment_id uuid)
returns table (
  theme_id uuid, theme_label text, attempts bigint, distinct_questions bigint,
  avg_score numeric, last_answered_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.theme_id, coalesce(t.label, 'Sans thème'),
         count(a.id), count(distinct a.question_id), round(avg(a.score), 2), max(a.answered_at)
    from public.question_attempts a
    join public.enrollments e on e.id = a.enrollment_id
    join public.question_items q on q.id = a.question_id
    join public.outcomes o on o.id = q.outcome_id
    left join public.outcome_themes t on t.id = o.theme_id
   where a.enrollment_id = p_enrollment_id
     and e.person_id = auth.uid()
   group by o.theme_id, t.label, t.position
   order by t.position nulls last;
$$;
revoke all on function public.my_question_results_by_theme(uuid) from public, anon;
grant execute on function public.my_question_results_by_theme(uuid) to authenticated;
