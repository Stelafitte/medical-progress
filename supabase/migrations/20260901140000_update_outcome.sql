-- Corriger un acquis, et rejouer un referentiel revise.
--
-- LA DETTE QUE CECI FERME. Depuis l'origine, un acquis se cree et ne se corrige
-- jamais : treize fonctions ecrivent autour de `outcomes` et aucune ne s'appelle
-- `update_outcome`. Le role `authenticated` n'a que SELECT sur la table. Une
-- coquille dans un intitule, un niveau attendu mal choisi sur 313 lignes
-- importees, une revision du referentiel de la SFC : rien de tout cela n'etait
-- rattrapable depuis l'application. Seul un UPDATE manuel dans l'editeur SQL,
-- sous le role postgres, pouvait le faire -- ce qui ne passe pas a l'echelle et
-- suppose une intervention exterieure.
--
-- CE QUI RESTE FIGE, ET POURQUOI.
--   * le CODE : c'est l'identite de la ligne. `unique (program_id, code)` en
--     depend, l'import rejouable en depend, et un code qui change fait perdre
--     la trace de ce qui a ete revise.
--   * la NATURE : des declarations d'etudiants (`outcome_self_reports`) et des
--     validations par un senior s'accrochent a un acquis. Faire passer une
--     competence reelle validee en connaissance laisserait ces validations
--     orphelines, sans que rien ne le signale. Une nature fausse se corrige en
--     archivant et recreant, pas en glissant.
-- Choix de Stef le 01/09, contre l'option « tout sauf le code ».
--
-- CE QUI DEVIENT MODIFIABLE : l'intitule, la description, le niveau attendu et
-- le rang R2C. Ce sont les quatre champs qu'une revision de referentiel touche.
--
-- NULL = INCHANGE, pour les quatre. Consequence assumee : on ne peut pas VIDER
-- un rang par cette fonction. Retirer un rang d'une connaissance n'a pas de cas
-- d'usage aujourd'hui ; si un jour il en faut un, ajouter un parametre explicite
-- plutot que de donner un autre sens a NULL.

create function public.update_outcome(
  p_outcome_id uuid,
  p_label text default null,
  p_description text default null,
  p_target_mastery mastery_level default null,
  p_knowledge_rank public.outcome_knowledge_rank default null
) returns public.outcomes
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.outcomes;
  v_after public.outcomes;
begin
  select * into v_before from public.outcomes where id = p_outcome_id;
  if v_before.id is null then
    raise exception 'Acquis introuvable.';
  end if;
  if not public.can_administer_program(v_before.program_id) then
    raise exception 'Droits insuffisants pour ce programme.';
  end if;

  -- La contrainte de table refuserait de toute facon, mais avec un message
  -- illisible. Sur un import de plusieurs centaines de lignes, un message clair
  -- attribuable a sa ligne vaut mieux qu'une violation de contrainte.
  if p_knowledge_rank is not null and v_before.nature <> 'knowledge' then
    raise exception 'Le rang R2C ne s''applique qu''aux connaissances (celui-ci est une %).', v_before.nature;
  end if;

  update public.outcomes
     set label          = coalesce(nullif(btrim(p_label), ''), label),
         description    = coalesce(p_description, description),
         target_mastery = coalesce(p_target_mastery, target_mastery),
         knowledge_rank = coalesce(p_knowledge_rank, knowledge_rank)
   where id = p_outcome_id
  returning * into v_after;

  -- On ne trace que si quelque chose a REELLEMENT change : rejouer un fichier
  -- de 313 lignes dont 300 sont identiques ne doit pas produire 300 evenements
  -- d'audit qui noient les treize vraies revisions.
  if v_after is distinct from v_before then
    insert into public.audit_events (program_id, actor_person_id, event_type, entity_type, entity_id, detail)
    values (
      v_after.program_id,
      auth.uid(),
      'outcome.updated',
      'outcome',
      v_after.id,
      jsonb_strip_nulls(jsonb_build_object(
        'code', v_after.code,
        'label', case when v_after.label is distinct from v_before.label
                 then jsonb_build_object('avant', v_before.label, 'apres', v_after.label) end,
        'description', case when v_after.description is distinct from v_before.description
                 then jsonb_build_object('avant', v_before.description, 'apres', v_after.description) end,
        'target_mastery', case when v_after.target_mastery is distinct from v_before.target_mastery
                 then jsonb_build_object('avant', v_before.target_mastery, 'apres', v_after.target_mastery) end,
        'knowledge_rank', case when v_after.knowledge_rank is distinct from v_before.knowledge_rank
                 then jsonb_build_object('avant', v_before.knowledge_rank, 'apres', v_after.knowledge_rank) end
      ))
    );
  end if;

  return v_after;
end;
$$;

revoke all on function public.update_outcome(uuid, text, text, mastery_level, public.outcome_knowledge_rank)
  from public, anon, authenticated;
grant execute on function public.update_outcome(uuid, text, text, mastery_level, public.outcome_knowledge_rank)
  to authenticated;
