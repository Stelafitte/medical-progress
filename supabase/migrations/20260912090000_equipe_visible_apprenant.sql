/*
 * L'ETUDIANT VOIT QUI L'ENCADRE (12/09).
 *
 * LA DEMANDE. Stef, le 12/09 : dans la vue d'ensemble de l'etudiant, « il faut
 * afficher son stage d'appartenance, son groupe et l'equipe d'encadrement et
 * le responsable de stage ». Le terrain et le groupe, il les lisait deja
 * (`placements_select`, `supervision_groups_select` ouvrent a l'inscrit). Ce
 * qu'il ne pouvait pas lire, c'est QUI : ni les roles poses sur son terrain,
 * ni les profils de ces personnes -- la migration `20260911200000` avait
 * ouvert l'equipe A L'EQUIPE, et deliberement pas a l'apprenant.
 *
 * CE QUE CETTE MIGRATION OUVRE, ET RIEN DE PLUS. A l'inscrit membre d'un
 * groupe d'encadrement :
 *   1. les roles de portee « terrain » poses sur LE terrain de son groupe --
 *      donc le responsable de stage et les encadrants de ce terrain ;
 *   2. le profil de ces personnes, et celui des encadrants rattaches a SON
 *      groupe (`supervision_group_supervisors`).
 * Pas les roles des autres terrains, pas l'administration du programme, pas
 * l'equipe d'une promotion qui n'est pas la sienne.
 *
 * ⚠️ TOUT PASSE PAR L'APPARTENANCE A UN GROUPE. Un inscrit sans groupe ne voit
 * personne -- il n'est encadre par personne, et c'est exactement le trou que
 * le concepteur signale desormais en etape 4.
 *
 * UNE FONCTION PORTE LA REGLE, `mes_terrains_de_stage()`, plutot que quatre
 * sous-requetes recopiees : elle rend les terrains des groupes dont
 * l'utilisateur courant est membre. `security definer` pour lire les tables de
 * groupes sans passer par leur RLS -- elle ne rend que des identifiants de
 * terrains, jamais une ligne de ces tables.
 */

create or replace function public.mes_terrains_de_stage()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $mes_terrains$
  select distinct g.placement_id
  from public.supervision_group_members m
  join public.supervision_groups g on g.id = m.group_id
  join public.enrollments e on e.id = m.enrollment_id
  where e.person_id = auth.uid();
$mes_terrains$;

revoke all on function public.mes_terrains_de_stage() from public, anon;
grant execute on function public.mes_terrains_de_stage() to authenticated;

drop policy if exists role_assignments_select_scoped on public.role_assignments;
create policy role_assignments_select_scoped on public.role_assignments
for select to authenticated
using (
  person_id = auth.uid()
  or public.can_administer_program(program_id)
  or public.is_platform_admin()
  or public.is_program_staff(program_id)
  -- L'ETUDIANT VOIT LES ROLES DE SON TERRAIN (12/09) : responsable de stage
  -- et encadrants du terrain de son groupe, rien d'autre.
  or (
    scope_kind = 'placement'
    and revoked_at is null
    and scope_id in (select public.mes_terrains_de_stage())
  )
);

create or replace function public.can_read_profile(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $can_read_profile$
  select p_person_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1
      from public.enrollments e
      where e.person_id = p_person_id
        and public.is_program_staff(e.program_id)
    )
    -- LES COLLEGUES (11/09) : qui porte un role dans un programme ou je suis
    -- staff est visible de moi, et moi de lui.
    or exists (
      select 1
      from public.role_assignments ra
      where ra.person_id = p_person_id
        and ra.revoked_at is null
        and ra.program_id is not null
        and public.is_program_staff(ra.program_id)
    )
    -- CEUX QUI M'ENCADRENT (12/09) : les roles poses sur le terrain de mon
    -- groupe, et les encadrants rattaches a mon groupe.
    or exists (
      select 1
      from public.role_assignments ra
      where ra.person_id = p_person_id
        and ra.revoked_at is null
        and ra.scope_kind = 'placement'
        and ra.scope_id in (select public.mes_terrains_de_stage())
    )
    or exists (
      select 1
      from public.supervision_group_supervisors s
      join public.supervision_group_members m on m.group_id = s.group_id
      join public.enrollments e on e.id = m.enrollment_id
      where s.person_id = p_person_id
        and e.person_id = auth.uid()
    );
$can_read_profile$;
