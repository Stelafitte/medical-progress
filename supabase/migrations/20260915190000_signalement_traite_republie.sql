-- UN SIGNALEMENT TRAITE REND LA QUESTION A LA CIRCULATION (15/09, soir).
--
-- Mesure en prod : un signalement passe la question en « signalee », donc hors
-- des series (pick_questions ne sert que « publiee »). Le traiter — rejeter,
-- confirmer, corriger — ne la remettait PAS en « publiee » : la banque
-- affichait « 1492 publiees, 1 signalee » apres un rejet. La question restait
-- ecartee pour toujours, sauf geste manuel d'administrateur.
--
-- Regle : la decision de l'equipe porte aussi sur la question.
--   en_revue  -> la question passe « en_revue » (toujours hors series) ;
--   corrige / confirme / rejete -> la question revient « publiee », si elle
--   etait signalee ou en revue (une question retiree ou brouillon ne change pas).
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

  if p_status = 'en_revue' then
    update public.question_items
       set status = 'en_revue'
     where id = v_r.question_id and status in ('signalee', 'publiee');
  else
    -- Rien ne remet en circulation une question qui a un AUTRE signalement ouvert.
    update public.question_items q
       set status = 'publiee'
     where q.id = v_r.question_id
       and q.status in ('signalee', 'en_revue')
       and not exists (
         select 1 from public.question_reports o
          where o.question_id = q.id and o.status in ('nouveau', 'en_revue')
       );
  end if;
  return v_r;
end;
$$;
revoke all on function public.resolve_question_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_question_report(uuid, text, text) to authenticated;

-- Rattrapage : les signalements deja traites dont la question est restee ecartee.
update public.question_items q
   set status = 'publiee'
 where q.status in ('signalee', 'en_revue')
   and exists (select 1 from public.question_reports r
                where r.question_id = q.id and r.status in ('corrige', 'confirme', 'rejete'))
   and not exists (select 1 from public.question_reports o
                    where o.question_id = q.id and o.status in ('nouveau', 'en_revue'));
