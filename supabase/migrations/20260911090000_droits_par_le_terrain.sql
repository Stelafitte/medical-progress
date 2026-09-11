/* ==================================================================
   LE DROIT SUIT LE TERRAIN, PLUS LE GROUPE.

   DECISION DE STEF, 11/09 : l ensemble des encadrants gere la cohorte
   entiere, independamment des groupes. Le groupe de supervision ne dit
   QUE l alternance ON / OFF -- une moitie a l hopital pendant que
   l autre travaille chez elle. La migration du 10/09 l ecrivait deja :
   « Un groupe decrit QUAND des etudiants sont la, jamais QUI les
   encadre. » Le droit d acces, lui, ne l avait pas encore suivi.

   DEUX TROUS MESURES LE 11/09, QUE CETTE MIGRATION FERME :

   TROU A -- un groupe cree APRES l activation d un encadrant n a aucun
   superviseur. `handle_people_activation` inscrit l encadrant dans tous
   les groupes du terrain, mais seulement ceux existant a l instant de
   son activation. Or on scinde la promotion en ON / OFF apres avoir
   recrute les encadrants. Aucun ecran ne permet de rattraper : il
   n existe aucun chemin applicatif pour ajouter un encadrant a un
   groupe. Les carnets de ce groupe deviennent invisibles, en silence.

   TROU B -- un etudiant qui n a pas encore choisi sa moitie n est
   membre d AUCUN groupe, donc invisible a tous les encadrants, y
   compris au responsable de stage. Aucun placement automatique
   n existe. Les inscrits d une promotion neuve sont TOUS dans ce cas le
   jour de leur arrivee.

   POURQUOI PASSER PAR LA COHORTE ET NON PAR `supervision_group_members`.
   L appartenance d un etudiant a un groupe dit quelles semaines on
   l attendait dans le service ; elle ne dit pas qui le suit. Le chemin
   devient donc : l inscription -> les groupes de SA PROMOTION -> le
   terrain de ces groupes -> le role porte sur ce terrain. Un etudiant
   sans groupe redevient visible, un encadrant absent d un groupe
   recent aussi.

   LIMITE CONNUE ET ACCEPTEE : une promotion pour laquelle AUCUN groupe
   n a ete cree reste sans encadrant, le seul lien entre une promotion
   et un terrain passant par `supervision_groups`. Un stage sans
   alternance demande donc quand meme un groupe, ne serait-ce que
   « promotion entiere ».

   ⚠️ CETTE FONCTION EST LE PIVOT DE SIX CHOSES : lecture et ecriture
   des carnets, fils de discussion, notes « Mon experience
   d acquisition », choix du groupe, validation de bloc. Les elargir
   toutes est VOULU ici -- l equipe d encadrement est une equipe -- mais
   cela doit rester conscient.
   ================================================================== */

create or replace function public.supervises_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment_id
      and public.can_administer_program(e.program_id)
  )
  or exists (
    select 1
    from public.enrollments e
    join public.supervision_groups g on g.cohort_id = e.cohort_id
    join public.role_assignments ra
      on ra.person_id = auth.uid()
     and ra.scope_kind = 'placement'
     and ra.scope_id = g.placement_id
     and ra.role in ('placement_supervisor', 'placement_manager')
     and ra.revoked_at is null
    where e.id = p_enrollment_id
  );
$$;

revoke all on function public.supervises_enrollment(uuid) from public, anon;
grant execute on function public.supervises_enrollment(uuid) to authenticated;

/* ==================================================================
   2. LE CALENDRIER S OUVRE AU RESPONSABLE DE STAGE

   DECISION DE STEF, 11/09. Poser l alternance n est pas un acte
   administratif : c est le responsable de stage qui connait les dates
   reelles du service, les feries et les semaines de congres. La base
   refusait -- « Seule l administration du programme pose le calendrier
   d un stage. »

   UNE FONCTION PLUTOT QUE DEUX TESTS COPIES. Les deux portes d ecriture
   du calendrier doivent dire exactement la meme regle ; ecrire la
   condition deux fois, c est accepter qu elles divergent un jour.
   ================================================================== */

create or replace function public.can_set_placement_calendar(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.supervision_groups g
    where g.id = p_group_id
      and (
        public.can_administer_program(g.program_id)
        or exists (
          select 1 from public.role_assignments ra
          where ra.person_id = auth.uid()
            and ra.role = 'placement_manager'
            and ra.scope_kind = 'placement'
            and ra.scope_id = g.placement_id
            and ra.revoked_at is null
        )
      )
  );
$$;

revoke all on function public.can_set_placement_calendar(uuid) from public, anon;
grant execute on function public.can_set_placement_calendar(uuid) to authenticated;

/* ------------------------------------------------------------------
   Poser ou corriger UNE semaine. Seul le test d autorisation change ;
   le reste est repris a l identique de la migration du 10/09.
   ------------------------------------------------------------------ */

create or replace function public.set_supervision_group_week(
  p_group_id uuid,
  p_week_start date,
  p_kind text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
begin
  select g.program_id into v_program_id
  from public.supervision_groups g where g.id = p_group_id;

  if v_program_id is null then
    raise exception 'Groupe de supervision introuvable.';
  end if;
  if not public.can_set_placement_calendar(p_group_id) then
    raise exception 'Seuls l''administration du programme et le responsable de stage posent le calendrier d''un stage.';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Une semaine se designe par son lundi (% n''en est pas un).', p_week_start;
  end if;

  if p_kind is null then
    delete from public.supervision_group_weeks
     where group_id = p_group_id and week_start = p_week_start;
    return;
  end if;

  if p_kind not in ('on', 'off') then
    raise exception 'Semaine « % » inconnue : « on » ou « off ».', p_kind;
  end if;

  insert into public.supervision_group_weeks (group_id, week_start, kind, set_by, updated_at)
  values (p_group_id, p_week_start, p_kind, auth.uid(), now())
  on conflict (group_id, week_start) do update
    set kind = excluded.kind, set_by = excluded.set_by, updated_at = now();
end;
$$;

revoke all on function public.set_supervision_group_week(uuid, date, text) from public, anon;
grant execute on function public.set_supervision_group_week(uuid, date, text) to authenticated;

/* ------------------------------------------------------------------
   Generer l alternance reguliere. Meme remarque : seul le test change.
   ------------------------------------------------------------------ */

create or replace function public.generate_supervision_group_weeks(
  p_group_id uuid,
  p_first_kind text default 'on',
  p_period integer default 1
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_debut date;
  v_fin date;
  v_lundi date;
  v_index integer := 0;
  v_poses integer := 0;
begin
  select g.program_id, c.starts_on, c.ends_on
    into v_program_id, v_debut, v_fin
  from public.supervision_groups g
  join public.cohorts c on c.id = g.cohort_id
  where g.id = p_group_id;

  if v_program_id is null then
    raise exception 'Groupe de supervision introuvable.';
  end if;
  if not public.can_set_placement_calendar(p_group_id) then
    raise exception 'Seuls l''administration du programme et le responsable de stage posent le calendrier d''un stage.';
  end if;
  if p_first_kind not in ('on', 'off') then
    raise exception 'La premiere semaine est « on » ou « off », pas « % ».', p_first_kind;
  end if;
  if p_period < 1 then
    raise exception 'Une alternance porte sur au moins une semaine.';
  end if;

  delete from public.supervision_group_weeks where group_id = p_group_id;

  v_lundi := v_debut - ((extract(isodow from v_debut)::integer - 1));

  while v_lundi <= v_fin loop
    insert into public.supervision_group_weeks (group_id, week_start, kind, set_by)
    values (
      p_group_id,
      v_lundi,
      case when (v_index / p_period) % 2 = 0 then p_first_kind
           when p_first_kind = 'on' then 'off'
           else 'on' end,
      auth.uid()
    );
    v_poses := v_poses + 1;
    v_index := v_index + 1;
    v_lundi := v_lundi + 7;
  end loop;

  return v_poses;
end;
$$;

revoke all on function public.generate_supervision_group_weeks(uuid, text, integer) from public, anon;
grant execute on function public.generate_supervision_group_weeks(uuid, text, integer) to authenticated;
