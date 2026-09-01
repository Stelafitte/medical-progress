-- Reprendre une classe : la modifier, l'archiver.
--
-- POURQUOI MAINTENANT. Depuis le debut, une classe se cree et ne se reprend
-- jamais : le port n'a que `createCohort`. Deux fois en deux jours il a fallu
-- corriger une date de fin par un `update` SQL a la main (01/11 -> 20/11, puis
-- 20/11 -> 15/11, cette derniere parce que le fichier de la scolarite disait
-- 15). Avec quatre promotions de 12 semaines par an, une faute de frappe sur un
-- libelle ou une date decalee est la regle, pas l'exception.
--
-- ARCHIVER, PAS SUPPRIMER. Cinq tables pointent vers `cohorts` : enrollments,
-- people (intended_cohort_id), plan_milestones, stage_logs, supervision_groups.
-- Une suppression emporterait des carnets de stage et des inscriptions, ou
-- echouerait sur une contrainte au pire moment. L'archivage est reversible et
-- c'est deja la doctrine du projet pour les acquis (`archived_at`) : une classe
-- archivee sort des listes actives, rien n'est perdu.
--
-- CE QUI N'EST PAS MODIFIABLE : `program_id` et `curriculum_version_id`.
-- Deplacer une classe d'un programme a l'autre laisserait ses inscriptions, ses
-- jalons et ses carnets rattaches a l'ancien. Ce n'est pas une modification,
-- c'est une migration de donnees ; elle n'a pas sa place derriere un bouton.

alter table public.cohorts
  add column archived_at timestamptz;

comment on column public.cohorts.archived_at is
  'Archivage reversible d''une classe. Non nul = sortie des listes actives, sans perte : inscriptions, jalons et carnets de stage restent rattaches.';

-- La lecture courante ne veut que les classes actives ; l'index suit cet usage.
create index cohorts_active_idx
  on public.cohorts (program_id, starts_on)
  where archived_at is null;

/* ------------------------------------------------------------------ */
/* Modifier                                                            */
/* ------------------------------------------------------------------ */

create function public.update_cohort(
  p_cohort_id uuid,
  p_label text,
  p_academic_year text,
  p_starts_on date,
  p_ends_on date
) returns public.cohorts
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.cohorts;
  v_after public.cohorts;
begin
  select * into v_before from public.cohorts where id = p_cohort_id;
  if v_before.id is null then
    raise exception 'Classe introuvable.';
  end if;
  if not public.can_administer_program(v_before.program_id) then
    raise exception 'Non autorisé à modifier une classe de ce programme.';
  end if;

  -- Les dates arrivent du meme formulaire que la creation, qui les controle
  -- deja ; on le revalide ici parce qu'un port n'est pas un ecran et qu'un
  -- appel direct ne passe par aucun formulaire.
  if coalesce(p_ends_on, v_before.ends_on) < coalesce(p_starts_on, v_before.starts_on) then
    raise exception 'La date de fin doit suivre la date de début.';
  end if;

  -- `coalesce` partout : un champ non transmis n'est pas efface. L'ecran envoie
  -- l'etat complet du formulaire, mais le port doit rester utilisable pour une
  -- correction d'un seul champ.
  update public.cohorts
     set label         = coalesce(nullif(btrim(p_label), ''), label),
         academic_year = coalesce(nullif(btrim(p_academic_year), ''), academic_year),
         starts_on     = coalesce(p_starts_on, starts_on),
         ends_on       = coalesce(p_ends_on, ends_on),
         updated_at    = now()
   where id = p_cohort_id
  returning * into v_after;

  insert into public.audit_events (program_id, actor_person_id, event_type, entity_type, entity_id, detail)
  values (
    v_after.program_id,
    auth.uid(),
    'cohort.updated',
    'cohort',
    v_after.id,
    jsonb_build_object(
      'avant', jsonb_build_object('label', v_before.label, 'academic_year', v_before.academic_year,
                                  'starts_on', v_before.starts_on, 'ends_on', v_before.ends_on),
      'apres', jsonb_build_object('label', v_after.label, 'academic_year', v_after.academic_year,
                                  'starts_on', v_after.starts_on, 'ends_on', v_after.ends_on)
    )
  );

  return v_after;
end;
$$;

/* ------------------------------------------------------------------ */
/* Archiver / desarchiver                                              */
/* ------------------------------------------------------------------ */

-- Une seule fonction pour les deux sens : archiver et desarchiver sont la meme
-- decision prise dans un sens ou dans l'autre, et deux fonctions jumelles
-- finiraient par diverger sur les droits ou sur l'audit.
create function public.set_cohort_archived(
  p_cohort_id uuid,
  p_archived boolean
) returns public.cohorts
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.cohorts;
begin
  select program_id into v_program_id from public.cohorts where id = p_cohort_id;
  if v_program_id is null then
    raise exception 'Classe introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Non autorisé à archiver une classe de ce programme.';
  end if;

  update public.cohorts
     set archived_at = case when p_archived then now() else null end,
         updated_at  = now()
   where id = p_cohort_id
  returning * into v_row;

  insert into public.audit_events (program_id, actor_person_id, event_type, entity_type, entity_id, detail)
  values (
    v_row.program_id,
    auth.uid(),
    case when p_archived then 'cohort.archived' else 'cohort.restored' end,
    'cohort',
    v_row.id,
    jsonb_build_object('label', v_row.label)
  );

  return v_row;
end;
$$;

revoke all on function public.update_cohort(uuid, text, text, date, date)
  from public, anon, authenticated;
revoke all on function public.set_cohort_archived(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.update_cohort(uuid, text, text, date, date) to authenticated;
grant execute on function public.set_cohort_archived(uuid, boolean) to authenticated;
