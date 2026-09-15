-- LOT D — L'apprenant lit les evaluations de SA promotion (15/09).
--
-- Jusqu'ici, tout le referentiel d'evaluation etait reserve a l'equipe
-- (is_program_staff). La note du 31/08 le disait : « a revoir le jour ou un
-- ecran apprenant la consommera ». Ce jour est arrive.
--
-- LA REGLE, identique dans l'esprit a outcomes_select : l'apprenant voit le
-- PARCOURS de sa promotion, pas le referentiel de travail du concepteur.
--   * une modalite lui est visible si l'une de SES promotions l'utilise
--     (cohort_assessment_modalities) et qu'elle n'est pas archivee ;
--   * un lien lui est visible s'il porte l'une de ses promotions ;
--   * une epreuve datee lui est visible si elle porte l'une de ses promotions.
-- Une modalite creee pour le programme mais servie a aucune de ses promotions
-- lui reste invisible — comme un acquis hors parcours.

-- Ses promotions, en une fonction — meme forme que is_enrolled_in_program.
create or replace function public.is_in_cohort(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.enrollments e
     where e.person_id = auth.uid()
       and e.cohort_id = p_cohort_id
       and e.status = 'active'
  );
$$;
revoke all on function public.is_in_cohort(uuid) from public, anon;
grant execute on function public.is_in_cohort(uuid) to authenticated;

-- 1. Les liens promotion <-> modalite
drop policy if exists cohort_assessment_modalities_select_staff on public.cohort_assessment_modalities;
create policy cohort_assessment_modalities_select on public.cohort_assessment_modalities
for select to authenticated
using (
  public.is_program_staff(program_id)
  or public.is_in_cohort(cohort_id)
);

-- 2. Les epreuves datees
drop policy if exists assessment_sessions_select_staff on public.assessment_sessions;
create policy assessment_sessions_select on public.assessment_sessions
for select to authenticated
using (
  public.is_program_staff(program_id)
  or public.is_in_cohort(cohort_id)
);

-- 3. Les modalites elles-memes : par l'existence d'un lien qu'il a le droit de
--    voir. La sous-requete passe par la policy de la table des liens, donc la
--    regle n'est ecrite qu'une fois.
drop policy if exists assessment_modalities_select_scoped on public.assessment_modalities;
create policy assessment_modalities_select on public.assessment_modalities
for select to authenticated
using (
  public.is_program_staff(program_id)
  or (
    archived_at is null
    and exists (
      select 1 from public.cohort_assessment_modalities l
       where l.modality_id = assessment_modalities.id
         and public.is_in_cohort(l.cohort_id)
    )
  )
);

comment on policy assessment_modalities_select on public.assessment_modalities is
  'Equipe : tout. Apprenant : les modalites non archivees servies a l''une de '
  'ses promotions actives. Lot D, 15/09.';
