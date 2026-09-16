-- L'ECOS SIMULE EST UNE AUTO-EVALUATION, ET IL SE PILOTE PAR PROMOTION (16/09).
--
-- LA DEMANDE (Stef, 16/09). Dans le Concepteur, paragraphe « Auto-evaluation »,
-- l'ECOS simule n'apparaissait pas -- alors que les cinq stations s'affichaient
-- chez l'apprenant, sans que personne ne les ait mises a disposition. Deux
-- choses a corriger, et elles vont ensemble : le RANGEMENT (un ECOS en ligne
-- est une auto-evaluation ; les ECOS de fin de stage, eux, sont en presentiel)
-- et le PILOTAGE (l'equipe coche la modalite, puis choisit STATION PAR STATION
-- ce qui est offert a la promotion ; sans selection, l'apprenant ne voit rien).
--
-- OU VIT LE CATALOGUE DES STATIONS. Dans le code (`src/domain/ecos.ts`), pas en
-- base : decision du 13/09, l'ECOS virtuel s'ouvre dans ChatGPT et le hub ne
-- garde que la grille rapportee. On enregistre donc des CLES de station, pas
-- des identifiants de lignes. Une cle inconnue du code est ignoree a
-- l'affichage : la base n'a pas a savoir ce que le catalogue contient.

-- 1. Le rangement : un ECOS en ligne est une auto-evaluation --------------------
update public.assessment_modalities
   set usage = 'self_assessment'
 where subtype = 'ecos'
   and mode = 'online'
   and usage <> 'self_assessment';

-- 2. Les stations mises a disposition d'une promotion ---------------------------
alter table public.cohort_assessment_modalities
  add column if not exists ecos_stations text[];

comment on column public.cohort_assessment_modalities.ecos_stations is
  'Pour un ECOS simule : les cles de stations offertes a cette promotion (src/domain/ecos.ts). Nul ou vide = aucune station, l''apprenant ne voit rien.';

create or replace function public.set_cohort_assessment_ecos(
  p_cohort_id uuid,
  p_modality_id uuid,
  p_stations text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_clean text[];
begin
  select program_id into v_program_id
    from public.cohort_assessment_modalities
   where cohort_id = p_cohort_id and modality_id = p_modality_id;
  if v_program_id is null then
    raise exception 'Cette promotion n''utilise pas cette modalité.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  -- Vide et nul sont la meme chose : aucune station offerte.
  select array_agg(distinct btrim(s) order by btrim(s)) into v_clean
    from unnest(coalesce(p_stations, '{}'::text[])) as s
   where btrim(s) <> '';

  update public.cohort_assessment_modalities
     set ecos_stations = v_clean
   where cohort_id = p_cohort_id and modality_id = p_modality_id;
end;
$$;
comment on function public.set_cohort_assessment_ecos is
  'Choisit les stations d''ECOS simule offertes a une promotion. Reserve a l''administration du programme ; le tableau est dedoublonne et trie, vide vaut nul.';
revoke all on function public.set_cohort_assessment_ecos(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.set_cohort_assessment_ecos(uuid, uuid, text[]) to authenticated;
