-- LES SEMAINES « ON » ET « OFF » DU STAGE.
--
-- LE TROU, MESURE LE 10/09 en construisant le calendrier de presence : les
-- etudiants du DFASM alternent semaine EN SERVICE et semaine DE TRAVAIL
-- PERSONNEL, et cette alternance n existait NULLE PART en base. Le calendrier
-- ne pouvait donc pas distinguer « journee manquee » de « semaine ou l on
-- n attendait personne ». Il traitait faute de mieux toute semaine sans
-- declaration comme une semaine off -- ce qui masquait une semaine en service
-- entierement oubliee. Cette migration ferme ce trou.
--
-- L ALTERNANCE SE POSE SUR LE GROUPE DE SUPERVISION, pas sur l etudiant ni sur
-- la promotion (decision de Stef, 10/09) : ce sont DEUX MOITIES qui alternent
-- l une contre l autre -- pendant que la premiere est dans le service, la
-- seconde travaille chez elle. Deux moities = deux groupes, chacun avec son
-- calendrier decale d une semaine.
--
-- ⚠️ ET CELA NE COUPE PAS L EQUIPE D ENCADREMENT. Les memes encadrants suivent
-- les deux groupes : `handle_people_activation` (migration 20260910200000)
-- inscrit deja tout nouvel encadrant dans TOUS les groupes du terrain. Un
-- groupe decrit QUAND des etudiants sont la, jamais QUI les encadre.

/* ================================================================== */
/* 1. La table                                                         */
/* ================================================================== */

create table public.supervision_group_weeks (
  group_id uuid not null references public.supervision_groups (id) on delete cascade,
  -- LE LUNDI, ET RIEN D AUTRE. Stocker une semaine par une date quelconque
  -- ferait exister deux lignes pour la meme semaine des que deux ecrans
  -- calculeraient leur borne differemment.
  week_start date not null,
  kind text not null check (kind in ('on', 'off')),
  set_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (group_id, week_start),
  constraint supervision_group_weeks_lundi
    check (extract(isodow from week_start) = 1)
);

create index supervision_group_weeks_group_idx
  on public.supervision_group_weeks (group_id, week_start);

/* ================================================================== */
/* 2. Qui lit, qui ecrit                                               */
/* ================================================================== */

alter table public.supervision_group_weeks enable row level security;
revoke all on public.supervision_group_weeks from public, anon, authenticated;
grant select on public.supervision_group_weeks to authenticated;

-- MEME PORTEE QUE LE GROUPE LUI-MEME. L etudiant DOIT voir ses propres semaines
-- off : c est la reponse a « pourquoi mon carnet me reclame-t-il cette
-- semaine-la ? ». La cacher aux apprenants ferait du calendrier un reproche
-- qu ils ne pourraient pas verifier.
create policy supervision_group_weeks_select on public.supervision_group_weeks
for select to authenticated
using (
  exists (
    select 1 from public.supervision_groups g
    where g.id = supervision_group_weeks.group_id
      and (public.is_program_staff(g.program_id) or public.is_enrolled_in_program(g.program_id))
  )
);

-- Aucune ecriture directe : le calendrier d un stage se pose par
-- l administration du programme, jamais par un encadrant et encore moins par
-- un etudiant. Les deux fonctions ci-dessous sont les seules portes.

/* ================================================================== */
/* 3. Poser ou corriger UNE semaine                                    */
/* ================================================================== */

-- `p_kind` a `null` EFFACE la semaine : elle redevient « non renseignee », ce
-- qui n est pas la meme chose qu une semaine off. Le meme geste que la note
-- d experience vide (10/09).
create function public.set_supervision_group_week(
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
  if not public.can_administer_program(v_program_id) then
    raise exception 'Seule l''administration du programme pose le calendrier d''un stage.';
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

/* ================================================================== */
/* 4. Generer l alternance regulière                                   */
/* ================================================================== */

-- LE RYTHME THEORIQUE, POSE D UN GESTE, PUIS CORRIGE A LA MAIN. Un stage de
-- onze semaines ne se saisit pas semaine par semaine au depart ; mais un
-- ferie, un congres ou un rattrapage casse toujours le rythme, et c est
-- `set_supervision_group_week` qui repare, sans regenerer.
--
-- ⚠️ REMPLACE TOUT le calendrier du groupe : c est un geste de mise en place,
-- pas d ajustement. La fonction rend le nombre de semaines posees.
create function public.generate_supervision_group_weeks(
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
  if not public.can_administer_program(v_program_id) then
    raise exception 'Seule l''administration du programme pose le calendrier d''un stage.';
  end if;
  if p_first_kind not in ('on', 'off') then
    raise exception 'La premiere semaine est « on » ou « off », pas « % ».', p_first_kind;
  end if;
  if p_period < 1 then
    raise exception 'Une alternance porte sur au moins une semaine.';
  end if;

  delete from public.supervision_group_weeks where group_id = p_group_id;

  -- Le lundi de la semaine qui contient le premier jour du stage : une
  -- promotion qui commence un mercredi a bien une premiere semaine.
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
