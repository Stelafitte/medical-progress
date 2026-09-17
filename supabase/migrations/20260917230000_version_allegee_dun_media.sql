-- ============================================================================
-- LA VERSION ALLÉGÉE D'UN MÉDIA — le socle du transcodage.
--
-- Stef a tranché le 17/09 au soir, après avoir regardé ses propres boucles :
--   imagerie diagnostique  → CRF 23, résolution et cadence INTACTES  (−51 %)
--   animations, séquences  → CRF 28 en 720p                     (−95 à −98 %)
--   narration              → AAC 64 kbit/s mono                      (−62 %)
--
-- CE QUI MANQUAIT EN BASE : de quoi dire « ceci est la version allégée de
-- cela ». `learning_resource_assets` sait décrire un objet, pas sa filiation.
-- Sans ça, un transcodage n'aurait le choix qu'entre écraser l'original —
-- irréversible, donc exclu — et déposer un objet que personne ne relie à rien.
--
-- L'ORIGINAL N'EST JAMAIS TOUCHÉ. C'est la seule règle non négociable du
-- chantier : on ajoute une ligne, on n'en modifie aucune. Si le réglage
-- s'avère trop agressif dans six mois, il suffit de cesser de servir les
-- dérivées ; rien n'est perdu.
--
-- POURQUOI UNE COLONNE ET PAS UNE TABLE. Une dérivée EST un média : même
-- seau, même nature, mêmes contrôles, mêmes politiques de lecture. Une table
-- à part dupliquerait tout ça pour n'ajouter qu'un lien.
-- ============================================================================

alter table public.learning_resource_assets
  add column if not exists source_asset_id uuid
    references public.learning_resource_assets (id) on delete cascade;

comment on column public.learning_resource_assets.source_asset_id is
  'Renseignée sur une version ALLÉGÉE : l''objet dont elle dérive. Nulle sur un original. L''original n''est jamais modifié.';

/* Une dérivée par original : sinon on ne sait plus laquelle servir. */
create unique index if not exists asset_une_seule_derivee_par_source
  on public.learning_resource_assets (source_asset_id)
  where source_asset_id is not null and deleted_at is null;

/* Lecture rapide « cet original a-t-il déjà sa version allégée ? » — c'est la
   question que l'outil pose pour CHAQUE objet à chaque passage, et c'est ce
   qui le rend rejouable sans refaire le travail déjà fait. */
create index if not exists asset_derivees_idx
  on public.learning_resource_assets (source_asset_id)
  where source_asset_id is not null;

/* Une dérivée ne dérive pas d'une dérivée : deux transcodages successifs
   dégraderaient deux fois. La base le refuse plutôt que de compter sur
   l'outil. */
create or replace function public.refuse_derivee_de_derivee()
returns trigger
language plpgsql
as $$
begin
  if new.source_asset_id is not null and exists (
    select 1 from public.learning_resource_assets a
    where a.id = new.source_asset_id and a.source_asset_id is not null
  ) then
    raise exception 'Une version allégée ne se transcode pas à son tour : deux passages dégradent deux fois.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists asset_pas_de_derivee_de_derivee on public.learning_resource_assets;
create trigger asset_pas_de_derivee_de_derivee
  before insert or update of source_asset_id on public.learning_resource_assets
  for each row execute function public.refuse_derivee_de_derivee();

/* ------------------------------------------------------------------ */
/* ENREGISTRER UNE VERSION ALLÉGÉE                                     */
/* ------------------------------------------------------------------ */

create or replace function public.register_lightened_asset(
  p_source_asset_id uuid,
  p_object_path text,
  p_byte_size bigint,
  p_media_type text,
  /* Le réglage employé, pour qu'on sache DANS SIX MOIS ce qui a produit ce
     fichier : 'video crf 23', 'audio aac 64k mono'. Sans cette trace, un
     réglage regretté ne se retrouve plus. */
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_src public.learning_resource_assets;
  v_id uuid;
begin
  select * into v_src from public.learning_resource_assets where id = p_source_asset_id;
  if v_src.id is null then
    raise exception 'Média source inconnu.' using errcode = 'no_data_found';
  end if;
  if not public.can_administer_program(v_src.program_id) then
    raise exception 'Seule l''administration du programme allège ses médias.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_byte_size is null or p_byte_size <= 0 then
    raise exception 'Une version allégée a un poids.' using errcode = 'check_violation';
  end if;
  /* Un « allègement » plus lourd que l'original est un échec silencieux :
     la base le refuse plutôt que de le servir. */
  if v_src.byte_size is not null and p_byte_size >= v_src.byte_size then
    raise exception 'La version produite (% octets) n''est pas plus légère que l''original (% octets).',
      p_byte_size, v_src.byte_size using errcode = 'check_violation';
  end if;

  insert into public.learning_resource_assets
    (program_id, resource_id, kind, storage_provider, bucket_name, object_path,
     media_type, original_file_name, byte_size, processing_status,
     source_asset_id, created_by)
  values
    (v_src.program_id, v_src.resource_id, v_src.kind, v_src.storage_provider,
     v_src.bucket_name, p_object_path, p_media_type,
     coalesce(v_src.original_file_name, '') || ' [' || coalesce(p_note, 'allégé') || ']',
     p_byte_size, 'ready', p_source_asset_id, auth.uid())
  on conflict (bucket_name, object_path) do update
    set byte_size = excluded.byte_size,
        media_type = excluded.media_type,
        original_file_name = excluded.original_file_name,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.register_lightened_asset(uuid, text, bigint, text, text) is
  'Déclare la version allégée d''un média. L''original n''est jamais modifié. Refuse une dérivée plus lourde que sa source, et une dérivée de dérivée.';

grant execute on function public.register_lightened_asset(uuid, text, bigint, text, text)
  to authenticated;

/* ------------------------------------------------------------------ */
/* CE QUI RESTE À ALLÉGER                                              */
/*                                                                     */
/* L'outil appelle CETTE fonction, il ne compose pas sa propre requête :  */
/* le périmètre de ce qui est transcodable est une règle de la base, pas   */
/* une option d'un script.                                                */
/* ------------------------------------------------------------------ */

create or replace function public.assets_to_lighten(p_program_id uuid default null)
returns table (
  asset_id uuid,
  program_id uuid,
  program_name text,
  resource_title text,
  kind text,
  bucket_name text,
  object_path text,
  media_type text,
  byte_size bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select a.id, a.program_id, pr.name, r.title, a.kind::text,
         a.bucket_name, a.object_path, a.media_type, a.byte_size
  from public.learning_resource_assets a
  join public.programs pr on pr.id = a.program_id
  join public.learning_resources r on r.id = a.resource_id
  where a.deleted_at is null
    /* Un original, jamais une dérivée. */
    and a.source_asset_id is null
    /* Pas encore allégé. */
    and not exists (
      select 1 from public.learning_resource_assets d
      where d.source_asset_id = a.id and d.deleted_at is null
    )
    /* Seuls les médias qui pèsent : le texte et les manifestes n'ont rien à
       gagner, et les figures du référentiel font 29 ko en moyenne. */
    and (a.media_type like 'video/%' or a.media_type like 'audio/%')
    and coalesce(a.byte_size, 0) > 262144
    and public.can_administer_program(a.program_id)
    and (p_program_id is null or a.program_id = p_program_id)
  order by a.byte_size desc;
end;
$$;

comment on function public.assets_to_lighten(uuid) is
  'Les médias qui restent à alléger : originaux seulement, pas déjà traités, audio ou vidéo, au-dessus de 256 ko. Le périmètre est une règle de la base, pas une option du script.';

grant execute on function public.assets_to_lighten(uuid) to authenticated;
