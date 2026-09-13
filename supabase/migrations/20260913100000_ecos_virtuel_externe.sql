/* ==================================================================
   ECOS VIRTUEL — LES STATIONS CHATGPT DECLAREES DANS LE HUB (13/09)

   LA DEMANDE. Stef, le 12/09 : les cinq stations ECOS construites dans
   ChatGPT (cas 1, cas 2, ECG, 3 bis, cas 4) « sont a integrer dans notre
   plateforme ». Puis le 13/09 : option 1 -- la station s'ouvre dans
   ChatGPT, et l'etudiant rapporte ensuite dans le hub la grille de
   notation Excel que le GPT lui rend apres le DEBRIEF.

   CE QUE LA BASE GARDE. Un PASSAGE (`ecos_external_runs`) : quel etudiant,
   quelle station, quel jour, quel score sur quel maximum. Et LA GRILLE
   ligne a ligne (`ecos_external_run_items`) : l'intitule, le bareme et la
   note de chaque item, dans l'ordre du fichier. Le score du passage n'est
   pas lu du fichier : il est RECALCULE ici, somme des items -- la ligne
   TOTAL du fichier est ecartee par l'application avant l'envoi.

   CE QUE CE N'EST PAS. Ni une preuve ni une confirmation (decisions 1 et
   3 du modele du 12/09) : la station tourne hors du hub, personne ici n'a
   vu le dialogue. C'est une DECLARATION de l'etudiant, lisible par son
   equipe de stage. Le catalogue des cinq stations vit pour l'instant dans
   l'application (`src/domain/ecos.ts`) ; il passera en base quand le
   moteur ECOS interne (decision 4) sera construit.

   QUI LIT, QUI ECRIT. Lecture : l'etudiant proprietaire de l'inscription
   (`owns_enrollment`) et ceux qui l'encadrent (`supervises_enrollment` :
   admin du programme, encadrants et responsable du terrain de son
   groupe). Ecriture : rien en direct, tout par fonction -- l'etudiant
   enregistre (`record_ecos_external_run`) et peut effacer un passage
   qui est le sien (`delete_ecos_external_run`). L'equipe ne modifie rien.
   ================================================================== */

create table public.ecos_external_runs (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  station_key text not null check (length(btrim(station_key)) between 1 and 80),
  station_label text not null check (length(btrim(station_label)) between 1 and 200),
  source text not null default 'chatgpt' check (source in ('chatgpt')),
  played_on date not null,
  score numeric(7, 2) not null check (score >= 0),
  max_score numeric(7, 2) not null check (max_score > 0),
  item_count integer not null check (item_count between 1 and 200),
  created_at timestamptz not null default now(),
  constraint ecos_external_runs_score_bounded check (score <= max_score)
);

comment on table public.ecos_external_runs is
  'Passage d''une station ECOS jouee HORS du hub (GPT ChatGPT de Stef) et '
  'declaree par l''etudiant avec la grille de notation rendue au DEBRIEF. '
  'Le score est la somme recalculee des items, jamais la valeur lue du fichier. '
  'Declaration de l''etudiant, lisible par son equipe de stage ; ni preuve ni '
  'confirmation.';

create index ecos_external_runs_enrollment_idx
  on public.ecos_external_runs (enrollment_id, played_on desc);

create index ecos_external_runs_program_idx
  on public.ecos_external_runs (program_id, played_on desc);

create table public.ecos_external_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ecos_external_runs (id) on delete cascade,
  position integer not null check (position >= 1),
  label text not null check (length(btrim(label)) between 1 and 500),
  max_points numeric(6, 2) not null check (max_points >= 0),
  points numeric(6, 2) not null check (points >= 0),
  constraint ecos_external_run_items_points_bounded check (points <= max_points),
  unique (run_id, position)
);

comment on table public.ecos_external_run_items is
  'Grille de notation d''un passage ECOS externe, une ligne par item dans '
  'l''ordre du fichier : intitule, bareme (points maximum) et note obtenue.';

/* ------------------------------------------------------------------
   Lecture : l'etudiant et son equipe. Rien pour les autres.

   La propriete est testee en clair (person_id = auth.uid()) et non par
   `owns_enrollment`, que la base n'ouvre pas au role authenticated
   (permission denied dans une politique) -- meme forme que les
   politiques du carnet de stage (`stage_logs_select`).
   ------------------------------------------------------------------ */

alter table public.ecos_external_runs enable row level security;
alter table public.ecos_external_run_items enable row level security;
revoke all on public.ecos_external_runs from public, anon, authenticated;
revoke all on public.ecos_external_run_items from public, anon, authenticated;
grant select on public.ecos_external_runs to authenticated;
grant select on public.ecos_external_run_items to authenticated;

create policy ecos_external_runs_select on public.ecos_external_runs
for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.id = ecos_external_runs.enrollment_id and e.person_id = auth.uid()
  )
  or public.supervises_enrollment(ecos_external_runs.enrollment_id)
);

create policy ecos_external_run_items_select on public.ecos_external_run_items
for select to authenticated
using (
  exists (
    select 1 from public.ecos_external_runs r
    join public.enrollments e on e.id = r.enrollment_id
    where r.id = ecos_external_run_items.run_id
      and (e.person_id = auth.uid() or public.supervises_enrollment(r.enrollment_id))
  )
);

/* ------------------------------------------------------------------
   Ecriture : l'etudiant enregistre sa grille, item par item.

   p_items : tableau JSON [{"label": text, "max_points": number,
   "points": number}, ...] dans l'ordre du fichier. Chaque item est
   verifie ici (intitule non vide, 0 <= points <= max_points) : une
   grille bancale est refusee entiere, pas enregistree a moitie.
   ------------------------------------------------------------------ */

create or replace function public.record_ecos_external_run(
  p_enrollment_id uuid,
  p_station_key text,
  p_station_label text,
  p_played_on date,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_run_id uuid;
  v_item jsonb;
  v_position integer := 0;
  v_label text;
  v_max numeric(6, 2);
  v_points numeric(6, 2);
  v_score numeric(7, 2) := 0;
  v_max_score numeric(7, 2) := 0;
begin
  if not public.owns_enrollment(p_enrollment_id) then
    raise exception 'Seul l''etudiant inscrit peut declarer un passage ECOS sur son inscription.';
  end if;

  if p_played_on is null or p_played_on > current_date then
    raise exception 'La date du passage doit etre renseignee et ne peut pas etre dans le futur.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 200 then
    raise exception 'La grille doit contenir entre 1 et 200 items.';
  end if;

  select e.program_id into v_program_id
  from public.enrollments e
  where e.id = p_enrollment_id;

  insert into public.ecos_external_runs
    (enrollment_id, program_id, station_key, station_label, played_on,
     score, max_score, item_count)
  values
    (p_enrollment_id, v_program_id, btrim(p_station_key), btrim(p_station_label),
     p_played_on, 0, 1, jsonb_array_length(p_items))
  returning id into v_run_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_position := v_position + 1;
    v_label := nullif(btrim(coalesce(v_item ->> 'label', '')), '');
    if v_label is null then
      raise exception 'Item % : intitule manquant.', v_position;
    end if;
    begin
      v_max := (v_item ->> 'max_points')::numeric;
      v_points := (v_item ->> 'points')::numeric;
    exception when others then
      raise exception 'Item % (« % ») : bareme ou note illisible.', v_position, v_label;
    end;
    if v_max is null or v_points is null or v_max < 0 or v_points < 0 or v_points > v_max then
      raise exception 'Item % (« % ») : la note doit etre comprise entre 0 et le bareme.', v_position, v_label;
    end if;

    insert into public.ecos_external_run_items (run_id, position, label, max_points, points)
    values (v_run_id, v_position, v_label, v_max, v_points);

    v_score := v_score + v_points;
    v_max_score := v_max_score + v_max;
  end loop;

  if v_max_score <= 0 then
    raise exception 'La grille n''a aucun point a obtenir : bareme total nul.';
  end if;

  update public.ecos_external_runs
  set score = v_score, max_score = v_max_score
  where id = v_run_id;

  return v_run_id;
end;
$$;

comment on function public.record_ecos_external_run is
  'RPC SECURITY DEFINER : l''etudiant declare un passage de station ECOS '
  'externe (ChatGPT) avec sa grille. Verifie owns_enrollment, la date et '
  'chaque item ; le score est la somme des items. Retourne l''identifiant du passage.';

revoke all on function public.record_ecos_external_run(uuid, text, text, date, jsonb) from public, anon;
grant execute on function public.record_ecos_external_run(uuid, text, text, date, jsonb) to authenticated;

create or replace function public.delete_ecos_external_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment_id uuid;
begin
  select r.enrollment_id into v_enrollment_id
  from public.ecos_external_runs r
  where r.id = p_run_id;

  if v_enrollment_id is null or not public.owns_enrollment(v_enrollment_id) then
    raise exception 'Seul l''etudiant qui a declare ce passage peut l''effacer.';
  end if;

  delete from public.ecos_external_runs where id = p_run_id;
end;
$$;

comment on function public.delete_ecos_external_run is
  'RPC SECURITY DEFINER : efface un passage ECOS externe et sa grille. '
  'Reserve a l''etudiant proprietaire de l''inscription ; l''equipe ne modifie rien.';

revoke all on function public.delete_ecos_external_run(uuid) from public, anon;
grant execute on function public.delete_ecos_external_run(uuid) to authenticated;
