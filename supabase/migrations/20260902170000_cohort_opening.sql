-- Ouvrir une promotion : le sceau qui manquait au Concepteur.
--
-- Stef, le 02/09 : « pour valider mon programme tout juste concu ». Verifie le
-- meme jour : rien dans l'application ne modifiait jamais cohorts.status ni
-- curriculum_versions.status. Les deux enums existaient depuis le 21/08 et
-- personne ne les ecrivait -- toutes les promotions etaient en brouillon, tous
-- les modeles aussi, et « valider » ne voulait rien dire.
--
-- CE QUE LE SCEAU N'EST PAS. Ce n'est pas un verrou de conception. Stef a
-- demande le 02/09 de pouvoir revenir modifier jalons et referentiel « a
-- n'importe quel moment » : ouvrir une promotion ne ferme donc aucun ecran.
-- update_plan_milestone ne regarde pas le statut, et ce n'est pas un oubli.
--
-- CE QU'IL EST. Une declaration verifiee. Il ne se contente pas d'enregistrer
-- une intention : il REFUSE d'ouvrir une promotion dont le retroplanning est
-- vide ou incoherent. Un sceau qu'on peut apposer sur n'importe quoi ne
-- certifie rien.

/* ------------------------------------------------------------------ */
/* Ouvrir                                                              */
/* ------------------------------------------------------------------ */

create function public.open_cohort(
  p_cohort_id uuid,
  p_dry_run boolean default false
) returns table (
  jalons integer,
  acquis integer,
  jalons_vides integer,
  version_activee boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_version_id uuid;
  v_status public.cohort_status;
  v_starts date;
  v_ends date;
  v_last_week integer;
  v_plan_last integer;
  v_jalons integer;
  v_acquis integer;
  v_vides integer;
  v_version boolean := false;
begin
  select c.program_id, c.curriculum_version_id, c.status, c.starts_on, c.ends_on
    into v_program_id, v_version_id, v_status, v_starts, v_ends
  from public.cohorts c where c.id = p_cohort_id;

  if v_program_id is null then
    raise exception 'Promotion introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;
  if v_status <> 'draft' then
    raise exception 'Cette promotion n''est plus en conception (statut : %).', v_status;
  end if;

  select count(*) into v_jalons
  from public.plan_milestones m where m.cohort_id = p_cohort_id;

  -- Une promotion ouverte sans jalon donnerait a chaque etudiant un passeport
  -- vide : rien a faire, aucune echeance, un ecran qui ressemble a une panne.
  if v_jalons = 0 then
    raise exception 'Cette promotion ne porte aucun jalon : le passeport des apprenants serait vide.';
  end if;

  select count(*) into v_acquis
  from public.plan_milestone_outcomes mo
  join public.plan_milestones m on m.id = mo.milestone_id
  where m.cohort_id = p_cohort_id;

  if v_acquis = 0 then
    raise exception 'Aucun acquis n''est rattache aux jalons de cette promotion.';
  end if;

  -- Des jalons vides ne bloquent PAS : un chapitre date dont tous les acquis
  -- sont sortis du parcours reste une intention lisible. On les compte pour que
  -- le concepteur les voie, on ne decide pas a sa place.
  select count(*) into v_vides
  from public.plan_milestones m
  where m.cohort_id = p_cohort_id
    and not exists (
      select 1 from public.plan_milestone_outcomes mo where mo.milestone_id = m.id
    );

  -- MEME calcul de duree que learningWeeks() et apply_milestone_template :
  -- floor(jours / 7). Trois regles differentes finiraient par se contredire.
  v_last_week := floor((v_ends - v_starts) / 7.0);

  select max(coalesce(m.week_offset_end, m.week_offset)) into v_plan_last
  from public.plan_milestones m where m.cohort_id = p_cohort_id;

  if v_plan_last > v_last_week then
    raise exception
      'Un jalon est pose en semaine %, or cette promotion s''arrete a la semaine %.',
      v_plan_last, v_last_week;
  end if;

  -- La version de curriculum suit : une promotion ouverte ne tourne pas sur un
  -- brouillon. C'est ce qui fige le nom et les objectifs du modele -- l'ecran
  -- sait deja s'y conformer (modelFieldsLocked).
  v_version := exists (
    select 1 from public.curriculum_versions v
    where v.id = v_version_id and v.status = 'draft'
  );

  if not p_dry_run then
    update public.cohorts set status = 'open', updated_at = now() where id = p_cohort_id;
    if v_version then
      update public.curriculum_versions set status = 'active' where id = v_version_id;
    end if;
  end if;

  return query select v_jalons, v_acquis, v_vides, v_version;
end;
$$;

/* ------------------------------------------------------------------ */
/* Revenir en conception                                               */
/* ------------------------------------------------------------------ */

-- Le sceau se retire. Stef, le 02/09 : « il faudrait que oui a n'importe quel
-- moment et meme si un mode pilotage pour revenir en arriere si erreurs ».
--
-- ASYMETRIE ASSUMEE : rendre la promotion au brouillon NE remet PAS la version
-- de curriculum en brouillon. Une meme version sert plusieurs promotions ; la
-- redescendre pour une seule rouvrirait le nom et les objectifs du modele sous
-- les pieds des autres.
create function public.revert_cohort_to_draft(p_cohort_id uuid)
returns public.cohorts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_status public.cohort_status;
  v_row public.cohorts;
begin
  select c.program_id, c.status into v_program_id, v_status
  from public.cohorts c where c.id = p_cohort_id;

  if v_program_id is null then
    raise exception 'Promotion introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  -- Depuis « ouverte » seulement. Une promotion en cours ou terminee a une
  -- histoire -- des declarations, des carnets -- que ce bouton ne saurait pas
  -- defaire, et le laisser croire serait pire que de le refuser.
  if v_status <> 'open' then
    raise exception
      'Seule une promotion ouverte peut revenir en conception (statut actuel : %).', v_status;
  end if;

  update public.cohorts set status = 'draft', updated_at = now()
   where id = p_cohort_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.open_cohort(uuid, boolean) from public, anon, authenticated;
revoke all on function public.revert_cohort_to_draft(uuid) from public, anon, authenticated;
grant execute on function public.open_cohort(uuid, boolean) to authenticated;
grant execute on function public.revert_cohort_to_draft(uuid) to authenticated;
