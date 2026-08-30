-- Etat « retenue dans le programme » pour les connaissances et competences.
--
-- Contexte : dans le Concepteur, la case a cocher d'une liste d'acquis ne
-- portait aucun sens durable — elle ne servait qu'a designer les lignes sur
-- lesquelles agir. Le concepteur veut pouvoir dire, et conserver, quels
-- acquis sont effectivement integres au parcours, sans les retirer du
-- referentiel du programme pour autant.
--
-- Trois etats distincts, a ne pas confondre :
--   * retenue              -> retained_at non nul : integree au parcours
--   * presente non retenue -> retained_at nul     : reste dans la liste,
--                             visible et modifiable, mais hors parcours
--   * archivee             -> archived_at non nul : sortie des listes actives
--                             (voir 20260829200000), reversible
--
-- Le defaut est « retenue » : creer une connaissance depuis le Concepteur
-- l'integre au parcours, ce qui etait le comportement implicite jusqu'ici.
-- Les lignes existantes sont donc backfillees — aucune ne change de
-- comportement au deploiement.

alter table public.outcomes
  add column if not exists retained_at timestamptz default now();

update public.outcomes
  set retained_at = coalesce(created_at, now())
  where retained_at is null;

comment on column public.outcomes.retained_at is
  'Non nul = acquis integre au parcours du programme. Nul = present dans le referentiel mais hors parcours. Distinct de archived_at, qui sort l''acquis des listes actives.';

-- Bascule d'un lot d'acquis. Un lot plutot qu'un appel par ligne : le
-- Concepteur enregistre l'etat de toutes les cases d'une liste en une fois,
-- et une bascule partielle laisserait l'ecran et la base en desaccord.
--
-- L'autorisation est verifiee par programme distinct, pas par ligne : un lot
-- qui toucherait deux programmes echoue si l'un des deux est interdit.
create or replace function public.set_outcomes_retained(
  p_outcome_ids uuid[],
  p_retained boolean
) returns setof public.outcomes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
begin
  if p_outcome_ids is null or array_length(p_outcome_ids, 1) is null then
    return;
  end if;

  for v_program_id in
    select distinct program_id from public.outcomes where id = any (p_outcome_ids)
  loop
    if not public.can_administer_program(v_program_id) then
      raise exception 'Droits insuffisants pour ce programme.';
    end if;
  end loop;

  return query
    update public.outcomes
      set retained_at = case when p_retained then now() else null end
      where id = any (p_outcome_ids)
      returning *;
end;
$$;

-- Aucun droit implicite : ni PUBLIC, ni anon. Seul un compte authentifie peut
-- appeler la fonction, et `can_administer_program` decide ensuite.
revoke all on function public.set_outcomes_retained(uuid[], boolean)
  from public, anon, authenticated;
grant execute on function public.set_outcomes_retained(uuid[], boolean)
  to authenticated;
