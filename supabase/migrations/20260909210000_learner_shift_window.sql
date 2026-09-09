-- DEPLACER, MAIS AUSSI RACCOURCIR OU ETIRER.
--
-- CE QUE STEF A DEMANDE, MOT POUR MOT (09/09) : « en appuyant sur le jalon on
-- rentre en modification et que l on puisse modifier DEBUT, FIN ou DEPLACER LE
-- SEGMENT sur la ligne ». Trois gestes. La table du 31/08 n en permet qu un :
-- elle ne porte que `shifted_due_on`, une seule date, et le domaine en deduit
-- le debut en conservant la duree du retroplanning. Deplacer : oui. Changer la
-- duree : impossible, faute d un endroit ou l ecrire.
--
-- UNE COLONNE NULLABLE, ET NON DEUX COLONNES OBLIGATOIRES. `null` garde le sens
-- qu avait la table jusqu ici — « j ai deplace ce jalon, sa duree est celle du
-- retroplanning » — et les lignes existantes restent exactes sans reprise. Une
-- date explicite dit « j ai choisi ma fenetre ». Deux etats, deux sens, aucune
-- valeur par defaut qui mentirait.

-- BANC D ESSAI (PostgreSQL 16, 09/09) : 14 cas, tous verts. La ligne ecrite par
-- l ancienne fonction survit avec un debut `null` ; il ne reste qu UNE fonction
-- `shift_milestone` apres migration ; deplacement simple, fenetre explicite,
-- retour a une fenetre implicite qui EFFACE le debut, fenetre d un seul jour ;
-- fin avant debut refusee par la fonction ET par le `check` en ecriture directe,
-- sans que la ligne existante bouge ; jalon officiel, programme ferme,
-- inscription d autrui, droits d execution, et un appel a trois arguments qui
-- retombe sur le defaut.

begin;

alter table public.learner_milestone_shifts
  add column shifted_starts_on date;

comment on column public.learner_milestone_shifts.shifted_starts_on is
  'Debut choisi par l apprenant. NULL = duree du retroplanning conservee, fenetre simplement deplacee.';

-- LA CONTRAINTE EST DANS LA BASE, PAS DANS L ECRAN. Une fenetre qui finit avant
-- de commencer n est pas une erreur de saisie a rattraper a l affichage : c est
-- une ligne qui ne veut rien dire, et le seul endroit ou l interdire une fois
-- pour toutes est ici.
alter table public.learner_milestone_shifts
  add constraint learner_milestone_shifts_window
  check (shifted_starts_on is null or shifted_starts_on <= shifted_due_on);

/* ================================================================== */
/* La fonction, avec un troisieme argument                             */
/* ================================================================== */

-- `DROP` PUIS `CREATE`, ET NON `CREATE OR REPLACE`. Ajouter un parametre — meme
-- avec une valeur par defaut — ne remplace pas la fonction : PostgreSQL en cree
-- une SURCHARGE, et PostgREST se retrouve devant deux candidates pour le meme
-- nom. Le remplacement doit etre explicite.
--
-- AUCUN APPEL EN VOL A CASSER : `shift_milestone` n est appelee par aucune ligne
-- de `src/` a ce jour, et la table compte zero decalage en production (mesure du
-- 09/09). Le meme geste dans un mois demanderait une periode de cohabitation.
drop function if exists public.shift_milestone(uuid, uuid, date);

create function public.shift_milestone(
  p_enrollment_id uuid,
  p_milestone_id uuid,
  p_due_on date,
  p_starts_on date default null
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
  if v_official then
    raise exception 'Ce jalon porte une echeance officielle : il ne peut pas etre deplace.';
  end if;

  -- MESSAGE LISIBLE AVANT QUE LA CONTRAINTE NE PARLE A NOTRE PLACE, comme pour
  -- le jalon officiel. Le `check` reste le garde-fou ; ceci est la phrase que
  -- l apprenant lira.
  if p_starts_on is not null and p_starts_on > p_due_on then
    raise exception 'La fin ne peut pas preceder le debut.';
  end if;

  insert into public.learner_milestone_shifts
    (enrollment_id, milestone_id, milestone_official, shifted_due_on, shifted_starts_on)
  values
    (p_enrollment_id, p_milestone_id, false, p_due_on, p_starts_on)
  on conflict (enrollment_id, milestone_id) do update
    set shifted_due_on    = excluded.shifted_due_on,
        shifted_starts_on = excluded.shifted_starts_on,
        updated_at        = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- `on conflict do update` EST SUR : le trigger `before insert` de cette table,
-- s il en avait un, verrait la ligne proposee — c est le defaut mesure ce matin
-- sur `program_ai_settings`. Ici la table n en porte aucun ; le controle vit
-- dans la fonction, au-dessus.

revoke all on function public.shift_milestone(uuid, uuid, date, date) from public, anon;
grant execute on function public.shift_milestone(uuid, uuid, date, date) to authenticated;

commit;
