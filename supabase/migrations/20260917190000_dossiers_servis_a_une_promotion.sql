-- ============================================================================
-- LES DOSSIERS SERVIS À UNE PROMOTION — la sélection a enfin où vivre.
--
-- Stef, 17/09 : « dans la liste comme toujours la possibilité de sélectionner
-- un ou plusieurs items ou tous ou aucun puis enregistrer la sélection. Fais
-- en une règle générale à appliquer partout. »
--
-- L'ECOS simulé savait déjà le faire : `ecos_stations` porte les clés des
-- stations offertes. Les dossiers, eux, n'avaient rien — la liste était en
-- lecture seule faute d'endroit où écrire le choix. D'où cette colonne, et
-- rien de plus.
--
-- POURQUOI `null` N'EST PAS UN TABLEAU VIDE, ET POURQUOI ÇA COMPTE.
--   `null`   personne n'a encore trié : TOUT le lot est servi. C'est l'état
--            d'une modalité qu'on vient de cocher, et c'est le bon défaut —
--            on rattache une banque de 21 dossiers pour qu'ils soient joués,
--            pas pour qu'ils restent invisibles.
--   `{}`     l'équipe a explicitement tout décoché : RIEN n'est servi.
--   `{...}`  exactement ces dossiers-là.
-- Confondre les deux ferait disparaître un lot entier au premier clic sur
-- « Tout décocher » suivi d'un rechargement — ou, pire, rendrait « aucun »
-- impossible à exprimer.
--
-- LA GARDE EST DANS LA FONCTION, comme partout ici : les écritures passent par
-- `security definer`, la RLS ne les voit pas.
-- ============================================================================

alter table public.cohort_assessment_modalities
  add column if not exists served_case_ids uuid[];

comment on column public.cohort_assessment_modalities.served_case_ids is
  'Dossiers servis à cette promotion. NULL = tout le lot (pas encore trié) ; tableau vide = aucun ; sinon exactement ceux-là.';

create or replace function public.set_cohort_served_cases(
  p_cohort_id uuid,
  p_modality_id uuid,
  /* `null` remet la modalité en « tout le lot ». */
  p_case_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program uuid;
  v_inconnus integer;
begin
  select cam.program_id into v_program
  from public.cohort_assessment_modalities cam
  where cam.cohort_id = p_cohort_id and cam.modality_id = p_modality_id;

  if v_program is null then
    raise exception 'Cette modalité n''est pas servie à cette promotion.'
      using errcode = 'no_data_found';
  end if;
  if not public.can_administer_program(v_program) then
    raise exception 'Seule l''administration du programme choisit les dossiers servis.'
      using errcode = 'insufficient_privilege';
  end if;

  /* Un identifiant qui n'est pas un dossier de CE programme n'entre pas : sans
     cela, une sélection copiée d'une autre promotion passerait sans bruit et
     l'étudiant verrait une liste vide sans que personne comprenne pourquoi. */
  if p_case_ids is not null and array_length(p_case_ids, 1) > 0 then
    select count(*) into v_inconnus
    from unnest(p_case_ids) as demande(id)
    where not exists (
      select 1 from public.question_cases qc
      where qc.id = demande.id and qc.program_id = v_program
    );
    if v_inconnus > 0 then
      raise exception 'Sélection refusée : % dossier(s) n''appartiennent pas à ce programme.', v_inconnus
        using errcode = 'check_violation';
    end if;
  end if;

  update public.cohort_assessment_modalities
     set served_case_ids = p_case_ids
   where cohort_id = p_cohort_id and modality_id = p_modality_id;
end;
$$;

comment on function public.set_cohort_served_cases(uuid, uuid, uuid[]) is
  'Choisit les dossiers servis à une promotion. NULL = tout le lot, tableau vide = aucun.';

grant execute on function public.set_cohort_served_cases(uuid, uuid, uuid[]) to authenticated;
