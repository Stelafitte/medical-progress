-- REGLER L ASSISTANT IA DEPUIS L ADMINISTRATION DU PROGRAMME.
--
-- CE QUI MANQUAIT. `program_ai_settings` existe depuis le 03/09 et la fonction
-- edge la respecte deja : elle refuse si `enabled` est faux, elle coupe au
-- plafond. Mais la table ne portait QUE `grant select to authenticated` : aucune
-- voie d ecriture depuis un client. Le reglage n existait donc que si quelqu un
-- l ecrivait a la main dans l editeur SQL. Un garde-fou que seul son auteur sait
-- deplacer n est pas un reglage, c est une constante bien rangee.
--
-- POURQUOI UNE FONCTION ET PAS UNE POLICY D ECRITURE. Meme motif que
-- `outcome_self_reports` et `start_ai_thread` : l ecriture passe par une
-- fonction. Une policy `update` sur la table exposerait chaque colonne
-- separement, `active_provider` comprise — et un `update` qui ne mentionne pas
-- une colonne la laisse en place, ce qui est exactement ce qu on veut ici mais
-- ne se lit nulle part. La fonction dit en une signature ce qu un administrateur
-- a le droit de changer : l ouverture, le plafond, la politique de repli. La
-- CLE et le FOURNISSEUR restent a `set_program_ai_credential` : ouvrir l IA et
-- confier un secret ne sont pas le meme geste.
--
-- `can_administer_program` ET NON `is_program_staff`. Le second inclut
-- `teacher` et `placement_supervisor`. Relever un plafond de depense ou couper
-- l outil pour toute une promotion n est pas un geste d encadrant de stage.

/* ================================================================== */
/* 1. La politique de repli                                            */
/* ================================================================== */

-- CE QUE CE REGLAGE ARBITRE : le cout par question, et il n a de sens que
-- depuis que le texte d un acquis a un repli. `read_outcome_sections` rend
-- toujours quelque chose — a defaut de sections propres, le chapitre entier.
-- Donc, sans reglage, l assistant appellerait le modele a CHAQUE question, alors
-- qu aujourd hui il repond « rien trouve » sans appel sous le seuil de
-- pertinence. Le passage de zero a un appel par question n est pas une decision
-- de developpeur : c est une decision de celui qui paie.
--
--   `seuil`           — comportement actuel. Sous le seuil de pertinence, on
--                       repond « rien trouve » SANS appeler le modele. Le moins
--                       cher, au prix de quelques refus sur des questions
--                       legitimes mal formulees.
--   `sections_seules` — on appelle le modele des qu il existe un texte
--                       RATTACHE a l acquis, jamais sur le seul chapitre.
--                       L intermediaire : on paie quand la reponse a des
--                       chances d etre precise.
--   `chapitre`        — repli complet. Il y a toujours du texte, donc toujours
--                       un appel. Le plus juste pour l etudiant, le plus cher.
--
-- DEFAUT `seuil` : CE QUI TOURNE AUJOURD HUI. Une migration ne change pas la
-- facture de quelqu un pendant qu il dort. Chaque programme passera au repli
-- quand son administrateur l aura decide, a l ecran.
create type public.ai_fallback_policy as enum ('seuil', 'sections_seules', 'chapitre');

alter table public.program_ai_settings
  add column fallback_policy public.ai_fallback_policy not null default 'seuil';

-- Pas de nouvelle policy : la colonne herite de `program_ai_settings_select`.
-- L apprenant lit donc la politique qui s applique a lui, comme il lit deja son
-- plafond. Un reglage qui decide de la reponse qu on recoit ne se cache pas.

/* ================================================================== */
/* 2. Ecrire le reglage                                                */
/* ================================================================== */

-- UPDATE PUIS INSERT, ET SURTOUT PAS `insert ... on conflict`. C est
-- contre-intuitif et c est un vrai piege, trouve au banc d essai : dans un
-- `INSERT ... ON CONFLICT DO UPDATE`, PostgreSQL execute les declencheurs
-- BEFORE INSERT sur la ligne PROPOSEE, AVANT de detecter le conflit. La ligne
-- proposee ici ne porte pas `active_provider` -- elle est absente de la
-- signature -- donc `program_ai_settings_guard` la voyait nulle et refusait
-- l ouverture sur un programme qui avait pourtant deja son fournisseur et sa
-- cle. Le reglage aurait ete impossible a activer depuis l ecran, avec un
-- message parlant d un fournisseur manquant qui, lui, ne manquait pas.
--
-- L ordre update-puis-insert supprime le probleme : le chemin `insert` n est
-- emprunte que par un programme SANS ligne, ou `active_provider` est
-- effectivement nulle et ou le refus d ouvrir est la bonne reponse.
--
-- `active_provider` N EST PAS DANS LA SIGNATURE et l `update` ne la mentionne
-- pas : elle survit intacte a chaque enregistrement. Couper puis rouvrir l IA
-- ne fait donc pas perdre le fournisseur choisi.
--
-- LE DECLENCHEUR `program_ai_settings_guard_trg` RESTE LE JUGE de la coherence
-- ouverture / fournisseur / cle : il leve si `enabled` passe a vrai sans moteur.
-- On ne recopie pas sa regle ici, sinon elle existerait a deux endroits et
-- divergerait au premier changement.
create function public.set_program_ai_settings(
  p_program_id uuid,
  p_enabled boolean,
  p_monthly_credit_cap integer,
  p_fallback_policy public.ai_fallback_policy
)
returns public.program_ai_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.program_ai_settings;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Reglage IA refuse : vous n administrez pas ce programme.'
      using errcode = '42501';
  end if;

  if p_monthly_credit_cap is null or p_monthly_credit_cap < 0 then
    raise exception 'Le plafond mensuel doit etre un entier positif ou nul.'
      using errcode = '22023';
  end if;

  update public.program_ai_settings s
     set enabled = coalesce(p_enabled, false),
         monthly_credit_cap = p_monthly_credit_cap,
         fallback_policy = p_fallback_policy
   where s.program_id = p_program_id
  returning s.* into v_row;

  if not found then
    begin
      insert into public.program_ai_settings
        (program_id, enabled, monthly_credit_cap, fallback_policy)
      values
        (p_program_id, coalesce(p_enabled, false), p_monthly_credit_cap, p_fallback_policy)
      returning * into v_row;
    exception when unique_violation then
      -- DEUX ADMINISTRATEURS QUI ENREGISTRENT EN MEME TEMPS. Le second trouve
      -- la ligne posee entre son `update` et son `insert` : on rejoue l update
      -- plutot que de lui rendre une erreur qu il ne saurait pas interpreter.
      update public.program_ai_settings s
         set enabled = coalesce(p_enabled, false),
             monthly_credit_cap = p_monthly_credit_cap,
             fallback_policy = p_fallback_policy
       where s.program_id = p_program_id
      returning s.* into v_row;
    end;
  end if;

  return v_row;
end;
$$;

revoke all on function public.set_program_ai_settings(
  uuid, boolean, integer, public.ai_fallback_policy
) from public, anon;
grant execute on function public.set_program_ai_settings(
  uuid, boolean, integer, public.ai_fallback_policy
) to authenticated;

/* ================================================================== */
/* 3. Ce que le reglage a coute ce mois-ci                             */
/* ================================================================== */

-- UN PLAFOND SANS COMPTEUR NE SE PILOTE PAS. `ai_credits_used_this_month`
-- existe deja mais repond POUR UN APPRENANT : c est ce dont la fonction edge a
-- besoin pour bloquer, jamais ce dont un administrateur a besoin pour decider.
-- Lui doit voir la consommation du programme, et surtout COMBIEN D APPRENANTS
-- SONT DEJA AU PLAFOND — c est le seul chiffre qui dit si le plafond est bien
-- place, et il est invisible dans un total.
--
-- `security definer` ET C EST NECESSAIRE ICI, a la difference de
-- `read_outcome_sections` : la fonction agrege les fils de TOUS les apprenants
-- du programme, que la RLS de `ai_threads` interdit a quiconque de lire un par
-- un — un administrateur n a pas a lire les conversations pour en connaitre le
-- cout. Le privilege eleve est donc borne par le controle explicite ci-dessous,
-- et la fonction ne rend AUCUN contenu de message : des comptes, rien d autre.
--
-- LE CONTROLE EST UN `raise`, PAS UN `where`. Un filtre d autorisation dans une
-- requete d agregation rendrait une ligne de zeros a qui n a pas le droit :
-- indiscernable d un programme ou personne n a rien demande. Un refus se dit.
create function public.program_ai_usage_this_month(p_program_id uuid)
returns table (
  credits_total integer,
  messages_total integer,
  apprenants_actifs integer,
  apprenants_au_plafond integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cap integer;
begin
  if not public.can_administer_program(p_program_id) then
    raise exception 'Consommation IA refusee : vous n administrez pas ce programme.'
      using errcode = '42501';
  end if;

  select s.monthly_credit_cap into v_cap
  from public.program_ai_settings s
  where s.program_id = p_program_id;

  return query
  with par_apprenant as (
    select
      t.enrollment_id,
      coalesce(sum(m.credits), 0)::integer as credits,
      count(m.id)::integer as messages
    from public.ai_threads t
    join public.ai_messages m on m.thread_id = t.id
    where t.program_id = p_program_id
      and m.created_at >= date_trunc('month', now())
    group by t.enrollment_id
  )
  select
    coalesce(sum(p.credits), 0)::integer,
    coalesce(sum(p.messages), 0)::integer,
    count(*)::integer,
    -- `v_cap` nul = aucun reglage enregistre : personne ne peut etre « au
    -- plafond » d un plafond qui n existe pas. `filter` sur un predicat nul ne
    -- compte rien, ce qui est la reponse juste et non un zero par accident.
    count(*) filter (where v_cap is not null and p.credits >= v_cap)::integer
  from par_apprenant p;
end;
$$;

revoke all on function public.program_ai_usage_this_month(uuid) from public, anon;
grant execute on function public.program_ai_usage_this_month(uuid) to authenticated;
