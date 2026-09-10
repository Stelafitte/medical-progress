-- AFFECTATIONS DE STAGE : DERIVEES DES GROUPES, PAS SAISIES.
--
-- Decision de Stef du 10/09 (option 1). Les ecrans de l'encadrant demandent
-- « de quels etudiants suis-je responsable, sur quel terrain, entre quelles
-- dates ? ». Les deux premieres reponses sont dans le groupe d'encadrement ;
-- la troisieme dans la promotion.
--
-- POURQUOI PAS UNE TABLE `placement_assignments`. Le port la suppose depuis le
-- debut, et elle n'a jamais existe en base. La creer ferait vivre la meme
-- verite a DEUX endroits : le groupe, qui gouverne deja qui a le droit de LIRE
-- un carnet (`supervises_enrollment`), et la fiche d'affectation, qui
-- gouvernerait ce que l'ECRAN affiche. Le jour ou les deux divergent,
-- l'encadrant voit dans « Mes etudiants » un etudiant dont la RLS lui refuse le
-- carnet. On derive donc, et il n'y a qu'une source.
--
-- LES DATES VIENNENT DE LA PROMOTION, et ce n'est pas un choix nouveau :
-- `open_stage_logs_for_group` (20260907120000) ecrit deja
-- `period_starts_on/ends_on` = `cohorts.starts_on/ends_on`, avec le commentaire
-- « la periode du carnet est celle de la cohorte : c'est elle qui ancre les
-- semaines de stage ». `placements` ne porte AUCUNE date. La derivation dit
-- donc exactement ce que le carnet dit deja.
--
-- CE QU'ON NE SAIT PAS REPRESENTER, ET C'EST ASSUME : une arrivee decalee, un
-- changement d'encadrant en cours de stage, une affectation annulee. Le jour ou
-- il en faudra une, cette fonction devient une vue sur la vraie table et AUCUN
-- ecran ne bouge — c'est tout l'interet de passer par une fonction.

/* ================================================================== */
/* L'identifiant                                                      */
/* ================================================================== */

-- Il doit etre STABLE d'un appel a l'autre : React s'en sert comme cle de
-- liste, et un identifiant qui change a chaque lecture remonterait tout le
-- tableau a chaque rafraichissement. `md5` des trois identifiants qui
-- definissent l'affectation le garantit sans rien stocker.

/* ================================================================== */
/* La fonction                                                        */
/* ================================================================== */

-- `security invoker` : la RLS des trois tables de groupe s'applique, et elle
-- dit deja la bonne chose. `is_program_staff` inclut `placement_supervisor`,
-- donc l'encadrant lit les groupes de son programme ; l'apprenant lit ceux de
-- son programme parce qu'il y est inscrit. Aucun droit nouveau n'est ouvert.
--
-- TROIS FILTRES NULLABLES plutot que trois fonctions : les trois lectures du
-- port (`ForProgram`, `ForSupervisor`, `ForEnrollment`) sont la meme requete
-- vue par trois portes. `ForEnrollment` est appelee par l'APPRENANT, qui n'a
-- pas de `program_id` sous la main — d'ou un filtre programme qui accepte NULL.
create function public.list_placement_assignments(
  p_program_id uuid,
  p_supervisor_person_id uuid,
  p_enrollment_id uuid
)
returns table (
  id uuid,
  placement_id uuid,
  enrollment_id uuid,
  supervisor_person_id uuid,
  starts_on date,
  ends_on date,
  status text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    md5(g.id::text || m.enrollment_id::text || s.person_id::text)::uuid as id,
    g.placement_id,
    m.enrollment_id,
    s.person_id as supervisor_person_id,
    c.starts_on,
    c.ends_on,
    case
      when current_date < c.starts_on then 'planned'
      when current_date > c.ends_on then 'completed'
      else 'in_progress'
    end as status
  from public.supervision_groups g
  join public.supervision_group_members m on m.group_id = g.id
  join public.supervision_group_supervisors s on s.group_id = g.id
  join public.cohorts c on c.id = g.cohort_id
  where (p_program_id is null or g.program_id = p_program_id)
    and (p_supervisor_person_id is null or s.person_id = p_supervisor_person_id)
    and (p_enrollment_id is null or m.enrollment_id = p_enrollment_id);
$$;

comment on function public.list_placement_assignments(uuid, uuid, uuid) is
  'Affectations de stage DERIVEES des groupes d encadrement. Dates = periode de la promotion, statut calcule. Aucune table d affectation : voir la migration 20260910100000.';

revoke all on function public.list_placement_assignments(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.list_placement_assignments(uuid, uuid, uuid)
  to authenticated;
