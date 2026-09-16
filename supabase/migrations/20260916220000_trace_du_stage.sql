-- DE QUOI LA TRACE D'UN STAGE EST-ELLE FAITE ? (16/09, decision de Stef)
--
-- LE CONSTAT. Le hub ne savait produire qu'UNE forme de trace -- la presence
-- cochee jour par jour -- et il l'imposait des qu'un stage existait. Pour le
-- DFASM c'est juste. Pour le DIU d'echocardiographie c'est faux deux fois :
-- l'apprenant n'y declare jamais sa presence, et ce qu'il doit vraiment
-- produire -- sa liste de cas, « 150 ETT, 50 ETO, 50 echos de stress » --
-- n'existait nulle part.
--
-- LA DECISION. La case « Journal de stage » du referentiel d'evaluation ne dit
-- plus SI le stage est suivi, elle dit COMMENT il l'est. Elle se deplie sur
-- quatre modalites, cumulables :
--   presence_digital        -- suivi demateralise : jours de presence + commentaires
--   logbook_digital         -- carnet dematerialise, remplit selon un MODELE
--   logbook_paper           -- carnet physique, hors plateforme
--   supervisor_attestation  -- attestation du responsable de stage
--
-- LES DEUX DERNIERES NE PRODUISENT AUCUNE DONNEE ICI : elles disent au bilan
-- ce qu'il faut avoir sous les yeux avant de prononcer. C'est le modele de
-- l'ECOS externe du 13/09 -- une declaration rapportee, jamais une preuve du hub.
--
-- ⚠️ LE MODELE DE CARNET EXISTE DEPUIS LE 31/08 ET N'AVAIT PAS D'ECRAN.
-- `stage_log_templates.objectives` porte deja {key, label, quota, frequency} :
-- c'est exactement « ETT : 150 ». On ne cree donc aucune table jumelle -- on
-- lui donne enfin ses portes d'ecriture.

-- 1. Configurer un carnet de stage ---------------------------------------------
create or replace function public.upsert_stage_log_template(
  p_program_id uuid,
  p_template_id uuid,
  p_label text,
  p_description text,
  p_objectives jsonb
)
returns public.stage_log_templates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.stage_log_templates;
  v_objectifs jsonb;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  if length(btrim(coalesce(p_label, ''))) = 0 then
    raise exception 'Le carnet doit porter un nom.';
  end if;

  -- Un item = un libelle libre et un nombre attendu. La cle est derivee du
  -- libelle si elle n'est pas donnee : elle sert a retrouver les declarations
  -- de l'apprenant quand le libelle est corrige.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'key', coalesce(nullif(btrim(o->>'key'), ''),
                             left(regexp_replace(lower(btrim(o->>'label')), '[^a-z0-9]+', '-', 'g'), 40)),
             'label', btrim(o->>'label'),
             'quota', greatest(0, coalesce((o->>'quota')::int, 0)),
             'frequency', coalesce(nullif(o->>'frequency', ''), 'per_placement')
           ) order by ord), '[]'::jsonb)
    into v_objectifs
    from jsonb_array_elements(coalesce(p_objectives, '[]'::jsonb)) with ordinality as t(o, ord)
   where length(btrim(coalesce(o->>'label', ''))) > 0;

  if p_template_id is null then
    -- Un nom deja pris doit se dire en francais, pas en « duplicate key » :
    -- c'est ce message brut qui a coute une heure sur « ECOS simule » le 16/09.
    if exists (select 1 from public.stage_log_templates t
                where t.program_id = p_program_id
                  and lower(btrim(t.label)) = lower(btrim(p_label))) then
      raise exception 'Un carnet porte deja ce nom dans ce programme : %', btrim(p_label);
    end if;
    insert into public.stage_log_templates (program_id, label, description, objectives)
    values (p_program_id, btrim(p_label), coalesce(p_description, ''), v_objectifs)
    returning * into v_row;
  else
    update public.stage_log_templates
       set label = btrim(p_label),
           description = coalesce(p_description, ''),
           objectives = v_objectifs,
           updated_at = now()
     where id = p_template_id and program_id = p_program_id
     returning * into v_row;
    if v_row.id is null then
      raise exception 'Carnet introuvable dans ce programme.';
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function public.upsert_stage_log_template(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.upsert_stage_log_template(uuid, uuid, text, text, jsonb) to authenticated;

create or replace function public.archive_stage_log_template(p_template_id uuid, p_enabled boolean default false)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_program_id uuid;
begin
  select program_id into v_program_id from public.stage_log_templates where id = p_template_id;
  if v_program_id is null then raise exception 'Carnet introuvable.'; end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  update public.stage_log_templates set enabled = p_enabled, updated_at = now() where id = p_template_id;
end;
$$;
revoke all on function public.archive_stage_log_template(uuid, boolean) from public, anon;
grant execute on function public.archive_stage_log_template(uuid, boolean) to authenticated;

-- 2. Ce que la modalite « Journal de stage » recouvre ----------------------------
alter table public.assessment_modalities
  add column if not exists stage_tracking text[] not null default '{}',
  add column if not exists stage_log_template_id uuid references public.stage_log_templates (id) on delete set null;

alter table public.assessment_modalities
  drop constraint if exists assessment_modalities_stage_tracking_connu;
alter table public.assessment_modalities
  add constraint assessment_modalities_stage_tracking_connu check (
    stage_tracking <@ array['presence_digital','logbook_digital','logbook_paper','supervisor_attestation']::text[]
  );

comment on column public.assessment_modalities.stage_tracking is
  'Journal de stage : de quoi la trace est faite. Vide = rien de decide, le module Stage decide seul (comportement d''avant le 16/09).';
comment on column public.assessment_modalities.stage_log_template_id is
  'Le modele de carnet servi quand logbook_digital est retenu.';

create or replace function public.set_stage_tracking(
  p_modality_id uuid,
  p_modes text[],
  p_template_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_modes text[];
  v_presence_retiree boolean;
begin
  select program_id into v_program_id from public.assessment_modalities where id = p_modality_id;
  if v_program_id is null then raise exception 'Modalite introuvable.'; end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  select coalesce(array_agg(distinct m order by m), '{}') into v_modes
    from unnest(coalesce(p_modes, '{}'::text[])) m
   where m in ('presence_digital','logbook_digital','logbook_paper','supervisor_attestation');

  /*
   * ON NE FERME PAS UN CARNET QUI A SERVI. Retirer le suivi dematerialise
   * alors que des journees sont deja saisies effacerait de l'ecran des
   * presences reelles, et la file « Carnets a valider » des encadrants avec.
   */
  v_presence_retiree := exists (
    select 1 from public.assessment_modalities m
     where m.id = p_modality_id and 'presence_digital' = any (m.stage_tracking)
  ) and not ('presence_digital' = any (v_modes));

  if v_presence_retiree and exists (
    select 1 from public.stage_log_entries e
      join public.stage_logs l on l.id = e.stage_log_id
     where l.program_id = v_program_id
  ) then
    raise exception 'Des journees de presence sont deja saisies dans ce programme : le suivi dematerialise ne peut plus etre retire.';
  end if;

  update public.assessment_modalities
     set stage_tracking = v_modes,
         stage_log_template_id = case when 'logbook_digital' = any (v_modes) then p_template_id else null end,
         updated_at = now()
   where id = p_modality_id;
end;
$$;
revoke all on function public.set_stage_tracking(uuid, text[], uuid) from public, anon;
grant execute on function public.set_stage_tracking(uuid, text[], uuid) to authenticated;

-- 3. Le carnet de l'apprenant : ce qu'il declare, item par item -------------------
create table if not exists public.stage_logbook_reports (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  template_id uuid not null references public.stage_log_templates (id) on delete cascade,
  objective_key text not null check (length(btrim(objective_key)) between 1 and 60),
  declared_count integer not null default 0 check (declared_count >= 0),
  note text not null default '',
  updated_at timestamptz not null default now(),
  validated_by uuid references public.profiles (id) on delete set null,
  validated_at timestamptz,
  unique (enrollment_id, template_id, objective_key)
);
alter table public.stage_logbook_reports enable row level security;
revoke all on public.stage_logbook_reports from public, anon, authenticated;
grant select on public.stage_logbook_reports to authenticated;

drop policy if exists stage_logbook_reports_select on public.stage_logbook_reports;
create policy stage_logbook_reports_select on public.stage_logbook_reports
for select to authenticated
using (
  -- La propriete se teste EN CLAIR (piege du 13/09 : owns_enrollment n'est pas
  -- executable par authenticated dans une policy).
  exists (select 1 from public.enrollments e
           where e.id = enrollment_id and e.person_id = auth.uid())
  or public.supervises_enrollment(enrollment_id)
);

create or replace function public.declare_stage_logbook_count(
  p_enrollment_id uuid,
  p_template_id uuid,
  p_objective_key text,
  p_count integer,
  p_note text default ''
)
returns public.stage_logbook_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.stage_logbook_reports;
begin
  if not exists (select 1 from public.enrollments e
                  where e.id = p_enrollment_id and e.person_id = auth.uid()) then
    raise exception 'Ce carnet n''est pas le votre.';
  end if;

  insert into public.stage_logbook_reports
    (enrollment_id, template_id, objective_key, declared_count, note)
  values (p_enrollment_id, p_template_id, btrim(p_objective_key),
          greatest(0, coalesce(p_count, 0)), coalesce(p_note, ''))
  on conflict (enrollment_id, template_id, objective_key) do update
    set declared_count = greatest(0, coalesce(excluded.declared_count, 0)),
        note = excluded.note,
        updated_at = now(),
        -- Une declaration qui change perd sa validation : l'encadrant a valide
        -- un chiffre, pas une promesse.
        validated_by = null,
        validated_at = null
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.declare_stage_logbook_count(uuid, uuid, text, integer, text) from public, anon;
grant execute on function public.declare_stage_logbook_count(uuid, uuid, text, integer, text) to authenticated;

create or replace function public.validate_stage_logbook_report(p_report_id uuid, p_valide boolean default true)
returns public.stage_logbook_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.stage_logbook_reports;
  v_enrollment uuid;
begin
  select enrollment_id into v_enrollment from public.stage_logbook_reports where id = p_report_id;
  if v_enrollment is null then raise exception 'Declaration introuvable.'; end if;
  if not public.supervises_enrollment(v_enrollment) then
    raise exception 'Vous n''encadrez pas cet etudiant.';
  end if;
  update public.stage_logbook_reports
     set validated_by = case when p_valide then auth.uid() else null end,
         validated_at = case when p_valide then now() else null end
   where id = p_report_id
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.validate_stage_logbook_report(uuid, boolean) from public, anon;
grant execute on function public.validate_stage_logbook_report(uuid, boolean) to authenticated;

-- 4. Les traces hors plateforme : carnet physique, attestation --------------------
create table if not exists public.stage_attestations (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  kind text not null check (kind in ('logbook_paper', 'supervisor_attestation')),
  note text not null default '',
  granted_by uuid not null references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  unique (enrollment_id, kind)
);
alter table public.stage_attestations enable row level security;
revoke all on public.stage_attestations from public, anon, authenticated;
grant select on public.stage_attestations to authenticated;

drop policy if exists stage_attestations_select on public.stage_attestations;
create policy stage_attestations_select on public.stage_attestations
for select to authenticated
using (
  exists (select 1 from public.enrollments e
           where e.id = enrollment_id and e.person_id = auth.uid())
  or public.supervises_enrollment(enrollment_id)
);

/*
 * QUI ATTESTE. La meme regle que le PRONONCE du stage (11/09) : le responsable
 * de stage ou l'administration du programme. Un encadrant valide des semaines,
 * il n'atteste pas un carnet tenu ailleurs.
 */
create or replace function public.grant_stage_attestation(
  p_enrollment_id uuid,
  p_kind text,
  p_note text default ''
)
returns public.stage_attestations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.stage_attestations;
begin
  select program_id into v_program_id from public.enrollments where id = p_enrollment_id;
  if v_program_id is null then raise exception 'Inscription introuvable.'; end if;
  if p_kind not in ('logbook_paper', 'supervisor_attestation') then
    raise exception 'Type d''attestation inconnu.';
  end if;

  if not (public.can_administer_program(v_program_id) or exists (
        select 1 from public.role_assignments ra
         where ra.person_id = auth.uid() and ra.program_id = v_program_id
           and ra.role = 'placement_manager' and ra.revoked_at is null)) then
    raise exception 'L''attestation revient au responsable de stage ou a l''administration du programme.';
  end if;

  insert into public.stage_attestations (enrollment_id, kind, note, granted_by)
  values (p_enrollment_id, p_kind, coalesce(p_note, ''), auth.uid())
  on conflict (enrollment_id, kind) do update
    set note = excluded.note, granted_by = auth.uid(), granted_at = now()
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.grant_stage_attestation(uuid, text, text) from public, anon;
grant execute on function public.grant_stage_attestation(uuid, text, text) to authenticated;

create or replace function public.revoke_stage_attestation(p_enrollment_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_program_id uuid;
begin
  select program_id into v_program_id from public.enrollments where id = p_enrollment_id;
  if v_program_id is null then raise exception 'Inscription introuvable.'; end if;
  if not (public.can_administer_program(v_program_id) or exists (
        select 1 from public.role_assignments ra
         where ra.person_id = auth.uid() and ra.program_id = v_program_id
           and ra.role = 'placement_manager' and ra.revoked_at is null)) then
    raise exception 'L''attestation revient au responsable de stage ou a l''administration du programme.';
  end if;
  delete from public.stage_attestations where enrollment_id = p_enrollment_id and kind = p_kind;
end;
$$;
revoke all on function public.revoke_stage_attestation(uuid, text) from public, anon;
grant execute on function public.revoke_stage_attestation(uuid, text) to authenticated;
