-- Le rang de connaissance A / B / C de la R2C.
--
-- POURQUOI UNE COLONNE A PART, et non target_mastery.
-- Les deux se ressemblent et ne disent pas la meme chose. `target_mastery` dit
-- OU EN EST l'etudiant / ou il doit arriver (novice -> autonomous) ; le rang dit
-- A QUEL PALIER DE FORMATION la connaissance devient exigible. La reforme du
-- deuxieme cycle les separe explicitement :
--   A : indispensables a tout medecin (pratique courante et urgences), a
--       maitriser imperativement a l'issue du deuxieme cycle (~70 % du
--       programme) ;
--   B : devant etre acquises a l'entree dans le DES, plus approfondies,
--       evaluees a l'EDN avec une ponderation qui depend de la specialite ;
--   C : de niveau troisieme cycle, retirees des referentiels de second cycle,
--       enseignees et evaluees au cours du 3e cycle si necessaire.
-- Les fusionner ferait perdre l'un des deux : un rang A peut tres bien avoir un
-- niveau attendu eleve, et un rang B un niveau attendu modeste.
--
-- POURQUOI LES TROIS VALEURS DES MAINTENANT.
-- Le referentiel de la SFC (22 items de cardiologie, 313 connaissances) ne
-- porte que des A et des B : la R2C a fait SUPPRIMER les rangs C des
-- referentiels de deuxieme cycle. Campus en aura besoin des le premier
-- programme de troisieme cycle (DIU-ECHO, DPC). Ajouter une valeur a un enum
-- plus tard est possible mais ne peut pas se faire dans une transaction avec
-- son usage : autant poser l'echelle complete tout de suite.
--
-- POURQUOI NULLABLE.
-- Les 77 acquis existants de DFASM-CARDIO n'ont pas de rang, et les competences
-- n'en auront jamais. Nul = « non hierarchise », un etat valide et durable,
-- pas une donnee manquante a completer.

create type public.outcome_knowledge_rank as enum ('A', 'B', 'C');

alter table public.outcomes
  add column knowledge_rank public.outcome_knowledge_rank;

-- La regle enoncee par Stef, inscrite dans la base plutot que dans un ecran :
-- le rang hierarchise des CONNAISSANCES. Une competence, simulee ou reelle, se
-- valide ou ne se valide pas ; elle n'est pas « de rang B ».
alter table public.outcomes
  add constraint outcomes_knowledge_rank_only_for_knowledge
  check (knowledge_rank is null or nature = 'knowledge');

comment on column public.outcomes.knowledge_rank is
  'Rang R2C de la connaissance : A (socle du 2e cycle), B (entree dans le DES), C (3e cycle). Nul = non hierarchise. Ne s''applique qu''aux acquis de nature knowledge ; c''est distinct de target_mastery, qui est un degre de maitrise.';

-- Filtrer un referentiel par rang est la lecture la plus attendue (« montre-moi
-- les rangs A de l'item 232 »). Index partiel : les lignes sans rang, qui sont
-- la majorite aujourd'hui, n'ont pas a le peser.
create index outcomes_knowledge_rank_idx
  on public.outcomes (program_id, knowledge_rank)
  where knowledge_rank is not null;

/* ------------------------------------------------------------------ */
/* create_outcome doit savoir poser le rang                            */
/* ------------------------------------------------------------------ */

-- On REMPLACE la fonction au lieu d'en ajouter une surchargee : deux
-- create_outcome dont l'une a un parametre par defaut rendraient l'appel par
-- arguments nommes de PostgREST ambigu (« function is not unique »), et
-- l'ecriture des acquis tomberait d'un coup.
drop function public.create_outcome(
  uuid, uuid, text, text, text, outcome_nature, text, mastery_level
);

create function public.create_outcome(
  p_program_id uuid,
  p_curriculum_version_id uuid,
  p_code text,
  p_label text,
  p_description text,
  p_nature outcome_nature,
  p_domain text,
  p_target_mastery mastery_level,
  p_knowledge_rank public.outcome_knowledge_rank default null
) returns public.outcomes
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.outcomes;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'not authorized';
  end if;

  insert into public.outcomes (
    program_id, curriculum_version_id, code, label, description, nature, domain,
    target_mastery, knowledge_rank
  )
  values (
    p_program_id, p_curriculum_version_id, p_code, p_label, p_description, p_nature,
    p_domain, p_target_mastery, p_knowledge_rank
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_outcome(
  uuid, uuid, text, text, text, outcome_nature, text, mastery_level,
  public.outcome_knowledge_rank
) from public, anon, authenticated;

grant execute on function public.create_outcome(
  uuid, uuid, text, text, text, outcome_nature, text, mastery_level,
  public.outcome_knowledge_rank
) to authenticated;
