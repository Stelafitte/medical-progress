-- OUVRIR (OU NON) LE REAMENAGEMENT DU PLAN AUX APPRENANTS.
--
-- CE QUI EXISTAIT DEJA, ET QUI DORMAIT. `learner_milestone_shifts` et
-- `shift_milestone` sont en base depuis le 31/08, avec un garde-fou remarquable :
-- une cle etrangere composite vers `plan_milestones (id, official)` doublee d un
-- `check (milestone_official = false)`. C est POSTGRESQL qui refuse qu un
-- etudiant decale une echeance institutionnelle, pas un ecran qu on peut
-- oublier. Aucune ligne de `src/` n a jamais appele tout cela.
--
-- CE QUI MANQUE, ET POURQUOI CA COMPTE (Stef, 09/09) : « l etudiant doit
-- pouvoir, SI AUTORISE PAR L ADMIN PROGRAMME, modifier les jalons ». Ce
-- reglage-la n existe nulle part. En l etat, des que l ecran appellerait
-- `shift_milestone`, tout inscrit de tout programme pourrait reamenager son
-- plan — et une regle qui ne vit que dans l ecran qui l applique n est pas une
-- regle : il suffit d appeler la fonction directement.

begin;

/* ================================================================== */
/* 1. Le reglage                                                       */
/* ================================================================== */

-- SUR `programs`, ET NON DANS UNE TABLE A PART. Trois drapeaux de meme nature y
-- vivent deja — `placements_enabled`, `audits_enabled`, `dpc_enabled` — et
-- inventer un quatrieme rangement pour le quatrieme drapeau ferait deux endroits
-- ou chercher « ce que ce programme autorise ».
--
-- DEFAUT `false` : l absence de decision vaut refus, comme pour l assistant IA.
-- Une migration n ouvre pas une porte pendant que son proprietaire dort.
alter table public.programs
  add column learner_plan_shifts_enabled boolean not null default false;

comment on column public.programs.learner_plan_shifts_enabled is
  'Les apprenants peuvent-ils deplacer leurs propres jalons non officiels (learner_milestone_shifts) ?';

/* ================================================================== */
/* 2. Le controle, DANS la fonction                                    */
/* ================================================================== */

-- `create or replace` A SIGNATURE IDENTIQUE : ni surcharge, ni `drop function`,
-- donc aucun appel en vol n est casse pendant la migration. Le corps est celui
-- du 31/08, augmente d un seul controle.
--
-- LE CONTROLE EST ICI ET NON A L ECRAN. C est la meme raison que pour le
-- reglage de l assistant IA : ce qui protege doit etre a l endroit que personne
-- ne peut contourner. La fonction est `security definer` et appelable par tout
-- compte connecte ; sans ce test, le drapeau ne serait qu une decoration.
create or replace function public.shift_milestone(
  p_enrollment_id uuid,
  p_milestone_id uuid,
  p_due_on date
) returns public.learner_milestone_shifts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_official boolean;
  v_milestone_program uuid;
  v_row public.learner_milestone_shifts;
begin
  if not public.owns_enrollment(p_enrollment_id) then
    raise exception 'Cette inscription n''est pas la votre.';
  end if;

  select e.program_id into v_program_id
  from public.enrollments e where e.id = p_enrollment_id;

  -- LE CONTROLE AJOUTE LE 09/09.
  if not exists (
    select 1 from public.programs p
    where p.id = v_program_id and p.learner_plan_shifts_enabled
  ) then
    raise exception 'Le reamenagement du plan n''est pas ouvert sur ce programme.';
  end if;

  select m.official, m.program_id into v_official, v_milestone_program
  from public.plan_milestones m where m.id = p_milestone_id;

  if v_milestone_program is null then
    raise exception 'Jalon introuvable.';
  end if;
  if v_milestone_program is distinct from v_program_id then
    raise exception 'Ce jalon n''appartient pas a votre programme.';
  end if;
  -- Message lisible avant que la contrainte ne parle a notre place.
  if v_official then
    raise exception 'Ce jalon porte une echeance officielle : il ne peut pas etre deplace.';
  end if;

  insert into public.learner_milestone_shifts
    (enrollment_id, milestone_id, milestone_official, shifted_due_on)
  values
    (p_enrollment_id, p_milestone_id, false, p_due_on)
  on conflict (enrollment_id, milestone_id) do update
    set shifted_due_on = excluded.shifted_due_on,
        updated_at     = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- REVENIR A LA DATE DE LA PROMOTION RESTE POSSIBLE MEME SI LE REGLAGE SE FERME,
-- et c est deliberé : `reset_milestone_shift` n est pas touchee. Le jour ou un
-- administrateur referme le reamenagement, les etudiants qui avaient deja
-- deplace un jalon doivent pouvoir revenir a la reference — leur interdire les
-- laisserait coinces sur un plan personnel qu ils ne peuvent plus corriger.

/* ================================================================== */
/* 3. Quand un jalon DEVIENT officiel                                  */
/* ================================================================== */

-- ⚠️ DEFAUT MESURE AU BANC D ESSAI LE 09/09, ET IL BLOQUAIT L ADMINISTRATEUR.
--
-- `learner_milestone_shifts` porte une cle etrangere composite vers
-- `plan_milestones (id, official)` avec `on update cascade`, doublee d un
-- `check (milestone_official = false)`. Le montage est excellent pour empecher
-- un decalage sur un jalon deja officiel. Mais quand un jalon NON officiel le
-- DEVIENT, la cascade propage `official = true` dans les decalages existants et
-- le `check` refuse — donc c est l `update` de l ADMINISTRATEUR qui echoue, avec
-- « violates check constraint learner_milestone_shifts_not_official ».
--
-- Mesure : cas P7. Un seul etudiant ayant deplace le jalon suffit a interdire a
-- l administrateur de le rendre officiel, sur un message que personne ne peut
-- interpreter.
--
-- CE QU ON FAIT, ET POURQUOI. Le trigger supprime les decalages personnels du
-- jalon AVANT que la cascade ne les invalide. Rendre un jalon officiel est une
-- decision pedagogique ; elle doit aboutir. La retenir derriere une erreur de
-- contrainte reviendrait a laisser un etudiant bloquer une decision de
-- programme sans que personne comprenne pourquoi.
--
-- CE QUE CELA COUTE, ET LA DETTE QUI RESTE OUVERTE : on efface un reamenagement
-- que l etudiant avait fait, SANS LE LUI DIRE. C est le prix a payer ici, mais
-- ce n est pas satisfaisant. L ECRAN D ADMINISTRATION DOIT PREVENIR AVANT :
-- « trois apprenants ont deplace ce jalon ; le rendre officiel annulera leurs
-- dates ». Tant que cet avertissement n existe pas, la suppression est
-- silencieuse — c est ecrit ici pour que personne ne le decouvre en production.
create function public.purge_shifts_when_milestone_becomes_official()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.official and not old.official then
    delete from public.learner_milestone_shifts
     where milestone_id = new.id;
  end if;
  return new;
end;
$$;

-- BEFORE, et non AFTER : la suppression doit avoir lieu avant que la cascade de
-- la cle etrangere ne tente de propager `official = true` sur des lignes que le
-- `check` refusera.
create trigger plan_milestones_purge_shifts
before update of official on public.plan_milestones
for each row execute function public.purge_shifts_when_milestone_becomes_official();

revoke all on function public.purge_shifts_when_milestone_becomes_official()
  from public, anon, authenticated;

commit;
