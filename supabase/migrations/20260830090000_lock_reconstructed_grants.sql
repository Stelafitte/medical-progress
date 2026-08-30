-- Verrouillage des droits laisses ouverts sur les objets reconstruits
-- (30/08/2026). Les quatre migrations de reconstruction qui precedent decrivent
-- fidelement ce qui existait en base, defauts compris. Celle-ci corrige ces
-- defauts, pour que le depot et la base convergent vers l'etat voulu.
--
-- Trois ecarts a la convention du projet (revoke public/anon systematique,
-- policies ciblees sur authenticated) :
--   1. create_outcome etait executable par PUBLIC, donc par anon.
--   2. handle_people_activation, fonction de declencheur, idem.
--   3. la policy de lecture des acquis ciblait le role PUBLIC.
--
-- Aucun de ces ecarts n'etait exploitable : create_outcome verifie les droits
-- en interne (can_administer_program echoue pour un appelant anonyme), une
-- fonction de declencheur ne peut pas etre appelee directement, et la lecture
-- des acquis restait bloquee par l'absence de GRANT SELECT pour anon. Il s'agit
-- de defense en profondeur, pas d'un correctif de faille.

revoke all on function public.create_outcome(
  uuid, uuid, text, text, text, outcome_nature, text, mastery_level
) from public, anon;
grant execute on function public.create_outcome(
  uuid, uuid, text, text, text, outcome_nature, text, mastery_level
) to authenticated;

revoke all on function public.handle_people_activation() from public, anon;

drop policy if exists outcomes_select on public.outcomes;
create policy outcomes_select on public.outcomes
for select to authenticated
using (public.is_program_staff(program_id));
