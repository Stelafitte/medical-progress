/*
 * L'EQUIPE SE VOIT ELLE-MEME (11/09).
 *
 * CE QUI MANQUAIT. Un encadrant ne pouvait pas savoir QUI ENCADRE AVEC LUI,
 * ni qui est le responsable du stage. Deux verrous, mesures avant d'y
 * toucher :
 *   1. `role_assignments_select_scoped` ne rendait que SES PROPRES roles
 *      (`person_id = auth.uid()`), donc aucune liste d'equipe possible ;
 *   2. `can_read_profile` n'ouvrait que les profils des personnes INSCRITES
 *      a un programme ou l'on est staff -- or un collegue encadrant n'est pas
 *      un inscrit, son nom restait invisible.
 * Demande de Stef le 11/09 : « il faudrait que l'encadrant voie dans sa vue
 * d'ensemble et dans communication qui sont les autres encadrants et le
 * responsable du stage ».
 *
 * CE QUE CELA OUVRE, ET A QUI. L'EQUIPE D'UN PROGRAMME SE VOIT ENTRE ELLE :
 * qui est staff (`is_program_staff` : administrateur, enseignant, encadrant,
 * responsable de stage) voit les roles de ce programme et les profils de ceux
 * qui les portent. Noms et adresses de l'equipe deviennent donc visibles de
 * toute l'equipe -- c'est une decision de confidentialite, prise par Stef le
 * 11/09, pas un effet de bord.
 *
 * ⚠️ L'APPRENANT NE GAGNE RIEN. Les deux regles passent par
 * `is_program_staff`, dont il ne fait pas partie : il continue de ne voir que
 * ses propres roles et les profils que la regle des inscrits lui ouvrait deja.
 *
 * ⚠️ LES ROLES DE PORTEE PLATEFORME RESTENT CACHES. Leurs lignes ont
 * `program_id is null`, et `is_program_staff(null)` est faux pour tout le
 * monde sauf l'administrateur de plateforme. Un encadrant ne decouvre donc pas
 * qui administre la plateforme.
 *
 * ⚠️ ON N'OUVRE QUE LA LECTURE. Les policies d'ecriture de `role_assignments`
 * ne sont pas touchees : accorder un role reste le geste de l'administration.
 */

drop policy if exists role_assignments_select_scoped on public.role_assignments;
create policy role_assignments_select_scoped on public.role_assignments
for select to authenticated
using (
  person_id = auth.uid()
  or public.can_administer_program(program_id)
  or public.is_platform_admin()
  -- L'EQUIPE DU PROGRAMME, ajoutee le 11/09.
  or public.is_program_staff(program_id)
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
    -- LES COLLEGUES, ajoutes le 11/09 : qui porte un role dans un programme
    -- ou je suis staff est visible de moi, et moi de lui.
    or exists (
      select 1
      from public.role_assignments ra
      where ra.person_id = p_person_id
        and ra.revoked_at is null
        and ra.program_id is not null
        and public.is_program_staff(ra.program_id)
    );
$can_read_profile$;
