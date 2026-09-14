-- LOT 1 — Ouvrir le vocabulaire des modalites d'evaluation (14/09).
--
-- POURQUOI CETTE MIGRATION EXISTE.
--
-- Le referentiel du 27/08 a ete ecrit pour decrire ce que le Hub sait FAIRE
-- lui-meme : un QCM, une simulation, un oral par IA, un cas clinique. Le
-- croisement `assessment_modalities_subtype_matches_mode` traduisait ca
-- fidelement — ce qui se passe en ligne est ce que la plateforme execute, ce
-- qui se passe en presentiel est un oral, un ecrit ou une epreuve pratique.
--
-- Stef (13/09) demande l'inverse : que le referentiel decrive ce que
-- l'ETUDIANT rencontrera pendant son stage, que la plateforme le fasse passer
-- ou non. Un ECOS en presentiel, un QCM sur table, une KFP : aucun des trois
-- n'etait saisissable. Le croisement n'etait pas une garde de coherence, c'etait
-- une hypothese sur le perimetre, et cette hypothese tombe.
--
-- CE QUI NE CHANGE PAS. `usage` — auto-evaluation / formative / examen de
-- validation / examen certifiant — porte deja exactement la distinction
-- demandee ; il n'est pas touche. `mode` garde ses deux valeurs : presentiel
-- ou en ligne, c'est la question posee.
--
-- CE QUI RESTE HORS PERIMETRE. La temporalite. Une modalite dit COMMENT on
-- evalue, jamais QUAND ni POUR QUELLE PROMOTION. Les sessions par cohorte
-- restent a construire (Lot 3) ; cette migration ne les anticipe pas, elle
-- rend seulement saisissable ce qu'elles dateront.

-- 1. Le croisement mode x sous-type disparait ---------------------------------
alter table public.assessment_modalities
  drop constraint if exists assessment_modalities_subtype_matches_mode;

-- 2. La liste des sous-types s'ouvre aux formats nationaux --------------------
--
-- La liste reste FERMEE : une enumeration libre laisserait entrer « K.F.P. »,
-- « kfp » et « Key Feature » comme trois formats distincts, et aucun ecran ne
-- pourrait plus grouper. Les sept cles d'origine sont conservees telles quelles
-- — aucune ligne existante n'est reecrite.
alter table public.assessment_modalities
  drop constraint if exists assessment_modalities_subtype_check;

alter table public.assessment_modalities
  add constraint assessment_modalities_subtype_check check (
    subtype in (
      -- Formats d'origine (27/08), inchanges.
      'oral', 'written', 'practical', 'qcm', 'simulation', 'ai_oral', 'case_study',
      -- Ecrit de type EDN / R2C.
      'qru', 'qroc', 'dp', 'mini_dp', 'kfp', 'tcs', 'lca',
      -- Clinique observee.
      'ecos', 'mini_cex', 'dops', 'portfolio'
    )
  );

-- 3. « Retenue au parcours », comme pour les acquis ---------------------------
--
-- Meme triptyque que outcomes depuis le 30/08 :
--   * retenue              -> retained_at non nul : le programme la propose
--   * presente non retenue -> retained_at nul     : reste au catalogue
--   * archivee             -> archived_at non nul : sortie de la liste
--
-- Les lignes existantes sont retenues : elles ont ete creees pour ce programme,
-- les declarer non retenues les ferait disparaitre d'ecrans ou elles figurent.
alter table public.assessment_modalities
  add column if not exists retained_at timestamptz default now();

update public.assessment_modalities
  set retained_at = coalesce(created_at, now())
  where retained_at is null;

comment on column public.assessment_modalities.retained_at is
  'Non nul = modalite retenue au parcours du programme. Nul = presente au '
  'catalogue mais hors parcours. Distincte de archived_at, qui la sort de la '
  'liste. Meme convention que outcomes.retained_at.';

-- 4. Bascule d'un lot, calquee sur set_outcomes_retained ----------------------
create or replace function public.set_assessment_modalities_retained(
  p_modality_ids uuid[],
  p_retained boolean
) returns setof public.assessment_modalities
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
begin
  if p_modality_ids is null or array_length(p_modality_ids, 1) is null then
    return;
  end if;

  for v_program_id in
    select distinct program_id
      from public.assessment_modalities
     where id = any (p_modality_ids)
  loop
    if not public.can_administer_program(v_program_id) then
      raise exception 'Droits insuffisants pour ce programme.';
    end if;
  end loop;

  return query
    update public.assessment_modalities
       set retained_at = case when p_retained then now() else null end
     where id = any (p_modality_ids)
    returning *;
end;
$$;

revoke all on function public.set_assessment_modalities_retained(uuid[], boolean)
  from public, anon, authenticated;
grant execute on function public.set_assessment_modalities_retained(uuid[], boolean)
  to authenticated;

comment on function public.set_assessment_modalities_retained is
  'RPC SECURITY DEFINER : bascule « retenue au parcours » sur un lot de '
  'modalites, apres verification de can_administer_program pour chaque '
  'programme concerne. Un lot qui toucherait deux programmes echoue si l''un '
  'des deux est interdit.';

-- 5. Le commentaire de table dit le nouveau perimetre ------------------------
comment on table public.assessment_modalities is
  'Referentiel des modalites d''evaluation d''un programme : type (presentiel '
  'ou en ligne), format et usage prevu (auto-evaluation, formative, validation, '
  'certification). Decrit ce que l''etudiant rencontrera, que la plateforme '
  'fasse passer l''epreuve ou non. Alimente l''onglet « Evaluations », le '
  'Concepteur de programme et le pilotage. Les sessions par cohorte — les '
  'DATES — restent hors perimetre et feront l''objet d''une table dediee.';
