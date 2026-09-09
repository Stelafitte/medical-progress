-- OUVRIR OU REFERMER LE REAMENAGEMENT DU PLAN, DEPUIS L ADMINISTRATION.
--
-- CE QUI MANQUE. La migration du 09/09 a pose
-- `programs.learner_plan_shifts_enabled` et l a rendu contraignant DANS
-- `shift_milestone`. Mais aucune ecriture n existe : `programs` ne porte
-- qu une policy de LECTURE (`programs_select_scoped`, 21/08), jamais
-- d `update`. En l etat, le drapeau est a `false` sur les quatre programmes
-- et rien, dans l application, ne peut le passer a `true` — la fonctionnalite
-- entiere est inatteignable.
--
-- UNE RPC, COMME POUR LE BROUILLON DE CONCEPTION. C est le montage deja en
-- place sur cette table (`save_program_design_draft`, 29/08) : aucune ecriture
-- directe sur `programs`, une fonction `security definer` par decision, et
-- l autorisation verifiee DANS la fonction. Ouvrir une policy `update` sur
-- `programs` pour un booleen donnerait au meme mouvement le droit de reecrire
-- le code, le nom et l etablissement d un programme.
--
-- BANC D ESSAI (PostgreSQL 16, 09/09) : 8 cas, tous verts. Nominal, idempotence
-- a l ouverture, fermeture, `null` qui vaut refus, programme inconnu,
-- non-administrateur refuse ET valeur inchangee apres ce refus, droits
-- d execution (authenticated oui, anon non).

begin;

create or replace function public.set_learner_plan_shifts(
  p_program_id uuid,
  p_enabled boolean
) returns public.programs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.programs;
begin
  -- LE MEME GARDE QUE POUR LE BROUILLON. `can_administer_program` est la seule
  -- reponse a « qui pilote ce programme » ; en reecrire une variante ici
  -- creerait un deuxieme endroit ou la reponse pourrait diverger.
  if not public.can_administer_program(p_program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  -- `coalesce(..., false)` : un appel sans argument depuis PostgREST arrive
  -- avec `null`, et « je n ai rien decide » ne doit pas ouvrir une porte.
  update public.programs
     set learner_plan_shifts_enabled = coalesce(p_enabled, false)
   where id = p_program_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Programme introuvable.';
  end if;

  return v_row;
end;
$$;

-- REFERMER N EFFACE RIEN, et c est delibere : les decalages deja poses restent
-- en base et continuent de s appliquer au plan de leurs auteurs. Refermer veut
-- dire « on n en pose plus », pas « on annule ce que les etudiants ont fait ».
-- Ceux qui veulent revenir a la date de la promotion le peuvent toujours :
-- `reset_milestone_shift` ne teste pas le drapeau (voir migration du 09/09).

revoke all on function public.set_learner_plan_shifts(uuid, boolean)
  from public, anon;
grant execute on function public.set_learner_plan_shifts(uuid, boolean)
  to authenticated;

commit;
