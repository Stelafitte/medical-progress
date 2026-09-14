-- LOT A2 — Le contenu d'evaluation EST PAR PROMOTION (14/09, tard).
--
-- Stef, apres avoir vu l'atelier : « quand je choisis une promotion, en dessous
-- doit apparaitre le contenu des modalites d'evaluation de cette promotion, et
-- le contenu peut etre different d'une promotion a l'autre ».
--
-- Une modalite reste configuree UNE FOIS pour le programme (format, lieu,
-- usage, consignes : `assessment_modalities`). Ce qui devient propre a chaque
-- promotion, c'est de l'UTILISER ou non — cette table — et QUAND
-- (`assessment_sessions`, Lot A).
--
-- Une ligne = « cette promotion utilise cette modalite ». Pas de ligne = elle
-- ne l'utilise pas. Une modalite peut donc exister au catalogue du programme
-- sans etre servie a aucune promotion, et deux promotions de la meme annee
-- peuvent avoir deux contenus d'evaluation differents.

create table public.cohort_assessment_modalities (
  program_id uuid not null,
  cohort_id uuid not null,
  modality_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (cohort_id, modality_id),
  constraint cohort_assessment_modalities_cohort_same_program
    foreign key (cohort_id, program_id)
    references public.cohorts (id, program_id) on delete cascade,
  constraint cohort_assessment_modalities_modality_same_program
    foreign key (modality_id, program_id)
    references public.assessment_modalities (id, program_id) on delete cascade
);

comment on table public.cohort_assessment_modalities is
  'Une promotion utilise une modalite d''evaluation du programme. La modalite '
  'est configuree une fois (assessment_modalities) ; chaque promotion choisit '
  'de la servir ou non (ici) et quand (assessment_sessions).';

create index cohort_assessment_modalities_program_idx
  on public.cohort_assessment_modalities (program_id, cohort_id);

revoke all on public.cohort_assessment_modalities from public, anon, authenticated;
alter table public.cohort_assessment_modalities enable row level security;
grant select on public.cohort_assessment_modalities to authenticated;

create policy cohort_assessment_modalities_select_staff
  on public.cohort_assessment_modalities
  for select to authenticated
  using (public.is_program_staff(program_id));

-- Activer ou retirer une modalite pour une promotion. Idempotent dans les deux
-- sens : activer deux fois ne cree rien, retirer l'absent ne se plaint pas.
-- Retirer supprime aussi les epreuves datees de cette promotion pour cette
-- modalite : une date sans modalite servie n'aurait plus de sens.
create or replace function public.set_cohort_assessment_modality(
  p_cohort_id uuid,
  p_modality_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_cohort_program uuid;
begin
  select program_id into v_program_id
    from public.assessment_modalities where id = p_modality_id and archived_at is null;
  if v_program_id is null then
    raise exception 'Modalité d''évaluation introuvable ou archivée.';
  end if;
  select program_id into v_cohort_program from public.cohorts where id = p_cohort_id;
  if v_cohort_program is null or v_cohort_program <> v_program_id then
    raise exception 'La promotion n''appartient pas au programme de cette modalité.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  if p_enabled then
    insert into public.cohort_assessment_modalities (program_id, cohort_id, modality_id)
    values (v_program_id, p_cohort_id, p_modality_id)
    on conflict do nothing;
  else
    delete from public.assessment_sessions
      where cohort_id = p_cohort_id and modality_id = p_modality_id;
    delete from public.cohort_assessment_modalities
      where cohort_id = p_cohort_id and modality_id = p_modality_id;
  end if;
end;
$$;

revoke all on function public.set_cohort_assessment_modality(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_cohort_assessment_modality(uuid, uuid, boolean)
  to authenticated;
