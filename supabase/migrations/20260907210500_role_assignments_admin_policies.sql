-- LES DEUX POLICIES D'ECRITURE SUR `role_assignments`, VERSEES AU DEPOT.
--
-- Elles existaient en base sans migration. Le depot ne portait que
-- `role_assignments_select_scoped` : la lecture etait versionnee, l'ecriture
-- non. Un environnement reconstruit depuis le depot aurait donc eu une table
-- ou PERSONNE ne peut attribuer ni revoquer un role, sans que rien ne le dise.
--
-- Elles sont reprises A L'IDENTIQUE de ce que `pg_policies` rend en base, sans
-- reecriture : le but est de rattraper la derive, pas d'en profiter pour
-- changer une regle de droits.
--
-- CE QU'ELLES DISENT, ET C'EST BIEN PENSE : on ne peut pas se donner un role a
-- soi-meme (`person_id <> auth.uid()`), et une mise a jour ne peut que
-- REVOQUER (`revoked_at is not null`) — jamais requalifier une attribution
-- existante.

drop policy if exists role_assignments_insert_admin on public.role_assignments;
create policy role_assignments_insert_admin on public.role_assignments
for insert to authenticated
with check (
  person_id <> auth.uid()
  and granted_by = auth.uid()
  and (
    is_platform_admin()
    or (
      scope_kind <> 'platform'::role_scope_kind
      and program_id is not null
      and can_administer_program(program_id)
    )
  )
);

drop policy if exists role_assignments_update_admin on public.role_assignments;
create policy role_assignments_update_admin on public.role_assignments
for update to authenticated
using (
  person_id <> auth.uid()
  and (
    is_platform_admin()
    or (
      scope_kind <> 'platform'::role_scope_kind
      and program_id is not null
      and can_administer_program(program_id)
    )
  )
)
with check (
  person_id <> auth.uid()
  and revoked_at is not null
  and (
    is_platform_admin()
    or (
      scope_kind <> 'platform'::role_scope_kind
      and program_id is not null
      and can_administer_program(program_id)
    )
  )
);
