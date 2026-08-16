-- =====================================================================
-- DRAFT — DO NOT EXECUTE
-- Passeport Éducatif Médical — Lot 1 — invariants serveur (conception)
-- Ce fichier n'est pas une migration et n'a jamais été exécuté.
--
-- Objet : le SEUL mécanisme mutant privilégié de la base.
--
-- Pourquoi un mécanisme mutant est nécessaire :
--   evidence.status = 'validated' ne doit JAMAIS être posé par un client.
--   Les policies de 002 l'interdisent (with check exclut 'validated') et les
--   GRANT de colonnes de 001 empêchent de réécrire l'identité d'une preuve.
--   Il faut donc une autorité qui, elle seule, dérive le statut d'une preuve
--   de la dernière décision enregistrée dans evidence_validations.
--
-- Pourquoi un TRIGGER et pas une RPC :
--   une fonction RPC exposée à `authenticated` serait une surface d'attaque :
--   elle pourrait être appelée hors contexte, avec des paramètres choisis.
--   Un trigger AFTER INSERT sur evidence_validations n'est pas appelable
--   directement : il ne peut s'exécuter qu'en conséquence d'une insertion qui
--   a DÉJÀ franchi la policy evidence_validations_insert_scoped, laquelle
--   vérifie can_validate_evidence() (ni titulaire, ni auteur, portée exacte).
--   La décision reste donc toujours attribuée à un validateur autorisé.
--
-- Invariants garantis ici :
--   1. status ∈ {validated, rejected, submitted} est dérivé de la DERNIÈRE
--      décision, jamais déclaré par un client.
--   2. les colonnes d'identité d'une preuve sont immuables après soumission.
--   3. aucune fonction de ce fichier n'est exécutable par PUBLIC, anon ou
--      authenticated.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Dérivation du statut d'une preuve depuis le journal de validation
-- SECURITY DEFINER : la fonction doit écrire dans public.evidence alors que
-- le rôle appelant n'a ni le privilège UPDATE sur la colonne status au-delà
-- des valeurs autorisées, ni la policy permettant 'validated'. C'est
-- précisément le point : l'écriture privilégiée est confinée ici.
-- ---------------------------------------------------------------------
create or replace function public.apply_evidence_validation_decision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _latest public.validation_decision;
  _next   public.evidence_status;
begin
  -- Dernière décision enregistrée pour cette preuve (le journal est append-only,
  -- une correction est une nouvelle ligne, jamais une réécriture).
  select v.decision
    into _latest
    from public.evidence_validations v
   where v.evidence_id = new.evidence_id
   order by v.decided_at desc, v.created_at desc, v.id desc
   limit 1;

  _next := case _latest
             when 'validated'      then 'validated'::public.evidence_status
             when 'rejected'       then 'rejected'::public.evidence_status
             when 'needs_revision' then 'submitted'::public.evidence_status
           end;

  if _next is null then
    return null;
  end if;

  update public.evidence ev
     set status     = _next,
         updated_at = now()
   where ev.id = new.evidence_id
     and ev.status <> _next;

  -- Journalisation systématique : toute transition de statut est auditable.
  insert into public.audit_events
    (actor_person_id, action, target_type, target_id, program_id, detail)
  select new.validator_person_id,
         'evidence.status_derived',
         'evidence',
         ev.id::text,
         ev.program_id,
         jsonb_build_object(
           'decision', _latest,
           'status', _next,
           'validation_id', new.id,
           'validator_role', new.validator_role
         )
    from public.evidence ev
   where ev.id = new.evidence_id;

  return null;  -- AFTER trigger : la valeur de retour est ignorée.
end;
$$;

comment on function public.apply_evidence_validation_decision() is
  'Unique écriture privilégiée de la base : dérive evidence.status de la '
  'dernière décision de validation. Non exposée (aucun EXECUTE pour '
  'authenticated) et non appelable en RPC : elle ne s''exécute qu''en trigger.';

drop trigger if exists evidence_validations_apply_decision
  on public.evidence_validations;
create trigger evidence_validations_apply_decision
  after insert on public.evidence_validations
  for each row
  execute function public.apply_evidence_validation_decision();

-- ---------------------------------------------------------------------
-- 2. Garde-fou d'immutabilité des colonnes d'identité d'une preuve
-- Les GRANT de colonnes de 001 empêchent déjà le client de viser ces colonnes.
-- Ce trigger ferme le cas résiduel : écriture par service_role, par un script
-- d'import mal écrit, ou par une future fonction serveur.
-- Fonction NON privilégiée (pas de SECURITY DEFINER) : elle ne fait que
-- refuser une transition, aucun droit supplémentaire n'est requis.
-- ---------------------------------------------------------------------
create or replace function public.enforce_evidence_identity_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.enrollment_id is distinct from new.enrollment_id
     or old.program_id  is distinct from new.program_id
     or old.outcome_id  is distinct from new.outcome_id
     or old.created_by  is distinct from new.created_by
     or old.self_declared is distinct from new.self_declared
     or old.placement_assignment_id is distinct from new.placement_assignment_id
     or old.source_system is distinct from new.source_system
     or old.source_id     is distinct from new.source_id
     or old.import_batch_id is distinct from new.import_batch_id
     or old.created_at    is distinct from new.created_at
  then
    raise exception
      'evidence identity columns are immutable (evidence %, status %)',
      old.id, old.status
      using errcode = 'restrict_violation';
  end if;

  -- Une preuve sortie du brouillon ne peut plus revenir en arrière sur son
  -- contenu factuel : seules les transitions de statut restent possibles.
  if old.status <> 'draft'
     and (old.occurred_at is distinct from new.occurred_at
          or old.kind is distinct from new.kind)
  then
    raise exception
      'evidence factual columns are frozen after submission (evidence %)', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_evidence_identity_immutable() is
  'Refuse toute réécriture des colonnes d''identité/provenance d''une preuve, '
  'et gèle ses colonnes factuelles dès qu''elle n''est plus en brouillon.';

drop trigger if exists evidence_identity_immutable on public.evidence;
create trigger evidence_identity_immutable
  before update on public.evidence
  for each row
  execute function public.enforce_evidence_identity_immutable();

-- ---------------------------------------------------------------------
-- 3. Exposition : AUCUNE fonction de ce fichier n'est appelable par un client
-- ---------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.apply_evidence_validation_decision()',
    'public.enforce_evidence_identity_immutable()'
  ]
  loop
    execute format('alter function %s owner to postgres', fn);
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('revoke all on function %s from service_role', fn);
  end loop;
end $$;
-- Les triggers s'exécutent au nom du propriétaire de la fonction (postgres)
-- pour la fonction SECURITY DEFINER, et ne nécessitent AUCUN privilège
-- EXECUTE de l'appelant : révoquer partout ne casse donc pas le mécanisme,
-- mais supprime toute possibilité d'appel direct (RPC, PostgREST, SQL).

-- FIN — DRAFT — DO NOT EXECUTE
