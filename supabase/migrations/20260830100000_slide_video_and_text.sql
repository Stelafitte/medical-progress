-- Une diapositive peut porter une video, et pas seulement une image fixe.
-- Le type d'asset correspondant est ajoute par la migration 20260830095000.
--
-- Mesure faite le 30/08 sur un cours reel du corpus (Module 6
-- Echocardiographie) : 3 diapositives sur 10 contiennent une boucle
-- d'echocardiographie, 2 autres portent 15 effets d'entree chacune. Une image
-- fixe perd ces deux choses, qui sont le contenu pedagogique lui-meme.
--
-- Le convertisseur produit desormais, pour chaque diapositive, un clip rendu
-- par PowerPoint (animations, boucles video et narration comprises) et une
-- image de couverture. L'image reste obligatoire : elle sert d'affiche avant
-- lecture et de repli si le clip ne peut pas etre lu.

alter table public.narrated_deck_slides
  add column video_asset_id uuid;

alter table public.narrated_deck_slides
  add constraint narrated_slide_video_same_resource
  foreign key (video_asset_id, resource_id)
  references public.learning_resource_assets (id, resource_id) on delete restrict;

comment on column public.narrated_deck_slides.video_asset_id is
  'Clip de la diapositive, rendu par PowerPoint avec ses animations et ses videos incluses. Null pour une diapositive statique.';

-- Texte de la diapositive, tel qu'il figure a l'ecran. Distinct de transcript,
-- qui porte la narration. Les deux alimentent l'exploitation IA du cours.
alter table public.narrated_deck_slides
  add column slide_text text;

comment on column public.narrated_deck_slides.slide_text is
  'Texte porte par la diapositive, extrait de l''OOXML. La narration, elle, va dans transcript.';

-- Republication d'un diaporama : meme fonction, deux champs de plus par
-- diapositive. Le corps est repris a l'identique par ailleurs.
create or replace function public.publish_narrated_deck(
  p_resource_id uuid, p_source_asset_id uuid, p_slide_count integer,
  p_duration_ms bigint, p_transcript_available boolean,
  p_slides jsonb, p_chapters jsonb
) returns public.narrated_decks
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_program_id uuid; v_deck public.narrated_decks;
  v_slide jsonb; v_chapter jsonb; v_version integer;
begin
  select program_id into v_program_id from public.learning_resources where id = p_resource_id;
  if v_program_id is null then raise exception 'Support introuvable.'; end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.narrated_decks where resource_id = p_resource_id;

  insert into public.narrated_decks (
    program_id, resource_id, version, status, source_asset_id,
    slide_count, duration_ms, transcript_available, reviewed_by, reviewed_at, published_at
  ) values (
    v_program_id, p_resource_id, v_version, 'published', p_source_asset_id,
    p_slide_count, p_duration_ms, p_transcript_available, auth.uid(), now(), now()
  ) returning * into v_deck;

  for v_slide in select * from jsonb_array_elements(p_slides) loop
    insert into public.narrated_deck_slides (
      resource_id, deck_id, slide_index, title, duration_ms,
      image_asset_id, audio_asset_id, video_asset_id, slide_text,
      transcript, transcript_language, audio_present
    ) values (
      p_resource_id, v_deck.id, (v_slide->>'slideIndex')::integer,
      coalesce(v_slide->>'title', ''), coalesce((v_slide->>'durationMs')::integer, 0),
      (v_slide->>'imageAssetId')::uuid, nullif(v_slide->>'audioAssetId', '')::uuid,
      nullif(v_slide->>'videoAssetId', '')::uuid, nullif(v_slide->>'slideText', ''),
      nullif(v_slide->>'transcript', ''), nullif(v_slide->>'transcriptLanguage', ''),
      (v_slide->>'audioAssetId') is not null and v_slide->>'audioAssetId' <> ''
    );
  end loop;

  for v_chapter in select * from jsonb_array_elements(p_chapters) loop
    insert into public.narrated_deck_chapters (deck_id, chapter_index, title, starts_at_slide)
    values (v_deck.id, (v_chapter->>'chapterIndex')::integer, v_chapter->>'title', (v_chapter->>'startsAtSlide')::integer);
  end loop;

  return v_deck;
end; $$;

revoke all on function public.publish_narrated_deck(uuid, uuid, integer, bigint, boolean, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.publish_narrated_deck(uuid, uuid, integer, bigint, boolean, jsonb, jsonb)
to authenticated;
