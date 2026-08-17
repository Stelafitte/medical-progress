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
--   3. la provenance historique (source_system, source_id, imported_at,
--      import_batch_id) est native-obligatoire pour un client et immuable en
--      UPDATE pour TOUS les rôles, sur les 15 tables concernées.
--   4. updated_at est imposé par le serveur sur les 14 tables qui en ont une.
--   5. aucune fonction de ce fichier n'est exécutable par PUBLIC, anon,
--      authenticated ou service_role.
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
-- 3. Provenance historique immuable — TOUTES les tables porteuses des 4
--    colonnes source_system / source_id / imported_at / import_batch_id
--
-- Règles :
--   * INSERT par un rôle `authenticated` : source_system DOIT valoir 'native'
--     et les trois autres colonnes DOIVENT être NULL. Un admin de programme ne
--     peut donc pas fabriquer une ligne prétendument importée du legacy.
--   * INSERT par service_role / postgres : provenance libre — c'est le seul
--     chemin d'import legacy, et il passe par le backend qui doit revérifier
--     l'autorisation métier (service_role contourne la RLS).
--   * UPDATE, QUEL QUE SOIT LE RÔLE : aucune des 4 colonnes ne peut changer.
--     Un import se fait par INSERT ; une correction ultérieure doit être
--     traçable (nouvelle ligne + audit_events), jamais réécrire l'origine.
--
-- SECURITY INVOKER (défaut, explicite) : la fonction ne fait que refuser une
-- transition, elle n'a besoin d'aucun privilège supplémentaire. search_path
-- verrouillé malgré tout, car elle référence des objets qualifiés.
-- ---------------------------------------------------------------------
create or replace function public.enforce_source_provenance()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    -- pg_has_role : couvre aussi un rôle applicatif futur membre de
    -- service_role, sans dépendre d'une égalité de nom exacte.
    if not pg_catalog.pg_has_role(current_user, 'service_role', 'USAGE')
       and current_user <> 'postgres'
    then
      if new.source_system is distinct from 'native'
         or new.source_id is not null
         or new.imported_at is not null
         or new.import_batch_id is not null
      then
        raise exception
          'legacy provenance columns can only be set by the import backend (table %)',
          tg_table_name
          using errcode = 'insufficient_privilege';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE — immuable pour tout le monde, service_role compris.
  if old.source_system   is distinct from new.source_system
     or old.source_id      is distinct from new.source_id
     or old.imported_at    is distinct from new.imported_at
     or old.import_batch_id is distinct from new.import_batch_id
  then
    raise exception
      'provenance columns are immutable (table %): imports are inserts, corrections must be traceable',
      tg_table_name
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_source_provenance() is
  'Trigger générique : provenance native imposée aux clients à l''insertion, '
  'et immuabilité des 4 colonnes de provenance à la mise à jour, tous rôles '
  'confondus (y compris service_role).';

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'programs', 'curriculum_versions', 'cohorts', 'enrollments',
    'role_assignments', 'outcomes', 'outcome_relations', 'learning_resources',
    'learning_resource_assets', 'placements', 'placement_assignments',
    'evidence', 'evidence_sources', 'evidence_validations'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I', t || '_source_provenance', t);
    execute format(
      'create trigger %I before insert or update on public.%I '
      'for each row execute function public.enforce_source_provenance()',
      t || '_source_provenance', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Horodatage serveur — updated_at n'est jamais fourni par un client
-- Aucun GRANT UPDATE de colonne n'inclut updated_at (001 §12.3, §12.4) ;
-- ce trigger ferme le cas des tables au GRANT large et des écritures serveur.
-- clock_timestamp() et non now() : l'heure réelle de la ligne, non l'heure de
-- début de transaction, pour distinguer deux écritures d'un même batch.
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Impose updated_at = clock_timestamp() à chaque UPDATE : la valeur envoyée '
  'par un appelant, client ou serveur, est toujours écrasée.';

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'programs', 'curriculum_versions', 'cohorts', 'enrollments',
    'role_assignments', 'outcomes', 'learning_resources',
    'learning_resource_assets', 'placements', 'placement_supervisors',
    'placement_assignments', 'evidence', 'ai_quota_policies'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    -- Nom suffixé 'z_' : les triggers BEFORE s'exécutent par ordre
    -- alphabétique, celui-ci doit passer APRÈS les gardes d'immutabilité.
    execute format('drop trigger if exists %I on public.%I', 'z_' || t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I '
      'for each row execute function public.set_updated_at()',
      'z_' || t || '_set_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Exposition : AUCUNE fonction de ce fichier n'est appelable par un client
-- ---------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.apply_evidence_validation_decision()',
    'public.enforce_evidence_identity_immutable()',
    'public.enforce_source_provenance()',
    'public.set_updated_at()'
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


-- =====================================================================
-- 6. PLAN D'ACQUISITION — immuabilité d'un template publié
-- Un template `published` (ou `retired`) est un référentiel opposable : il ne
-- se corrige pas, il se réédite. Les policies de 002 §15 l'interdisent déjà au
-- client ; ce trigger ferme le cas service_role / script d'import.
-- Fonction NON privilégiée : elle ne fait que refuser une transition.
-- =====================================================================
create or replace function public.enforce_plan_template_immutable()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  _status public.plan_template_status;
begin
  if tg_table_name = 'acquisition_plan_templates' then
    if tg_op = 'DELETE' then
      if old.status <> 'draft' then
        raise exception 'a published or retired plan template cannot be deleted'
          using errcode = 'insufficient_privilege';
      end if;
      return old;
    end if;

    -- Seules transitions permises hors draft : publication et retrait.
    if old.status = 'published' and new.status = 'retired' then
      return new;
    end if;
    if old.status = 'draft' then
      return new;
    end if;
    raise exception
      'plan template % is % : create a new version_number instead of editing it',
      old.id, old.status
      using errcode = 'insufficient_privilege';
  end if;

  -- Items et dépendances : rattachés à un template figé => figés aussi.
  select t.status into _status
    from public.acquisition_plan_templates t
   where t.id = coalesce(new.template_id, old.template_id);

  if _status is distinct from 'draft' then
    raise exception
      'plan template % is % : its items and dependencies are immutable', 
      coalesce(new.template_id, old.template_id), _status
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists apt_immutable on public.acquisition_plan_templates;
create trigger apt_immutable
  before update or delete on public.acquisition_plan_templates
  for each row execute function public.enforce_plan_template_immutable();

drop trigger if exists apti_immutable on public.acquisition_plan_template_items;
create trigger apti_immutable
  before insert or update or delete on public.acquisition_plan_template_items
  for each row execute function public.enforce_plan_template_immutable();

drop trigger if exists aptid_immutable
  on public.acquisition_plan_template_item_dependencies;
create trigger aptid_immutable
  before insert or update or delete
  on public.acquisition_plan_template_item_dependencies
  for each row execute function public.enforce_plan_template_immutable();

-- =====================================================================
-- 6.bis Chemin d'écriture interne — sans drapeau falsifiable
-- Un custom GUC (`current_setting('app.…')`) est positionnable par n'importe
-- quel rôle SQL : il ne peut donc JAMAIS servir d'autorisation. Les écritures
-- privilégiées du plan sont reconnues par leur contexte effectif : elles ne
-- surviennent qu'à l'intérieur d'une fonction SECURITY DEFINER dont le
-- propriétaire est postgres, donc avec `current_user = 'postgres'`.
-- Ni `authenticated` ni `service_role` ne peuvent atteindre ce contexte :
--   * ces rôles ne sont pas membres de postgres (aucun SET ROLE possible) ;
--   * les fonctions concernées ont EXECUTE révoqué pour tous les rôles (§13)
--     et ne s'exécutent qu'en trigger.
-- =====================================================================
-- Aucun helper SQL n'est introduit pour ce test : un appel de fonction imbriqué
-- depuis un trigger SECURITY INVOKER exigerait EXECUTE pour le rôle appelant et
-- pourrait échouer en `permission denied`, ce qui bloquerait aussi les écritures
-- légitimes (progress_state, édition d'un brouillon, draft -> pending).
-- Chaque trigger évalue donc directement, dans son bloc declare :
--     _internal boolean := (current_user = 'postgres');

-- =====================================================================
-- 7. Dérivation de l'impact et du rôle décideur
-- Le client n'a AUCUN GRANT sur change_impact / required_approver_role
-- (001 §13.9) : ils sont calculés ici, à partir des colonnes proposées et de
-- l'élément de plan visé. Un apprenant ne peut donc pas requalifier une
-- demande d'échéance officielle en simple ajustement personnel.
--
-- Règles (miroir de src/domain/acquisitionPlan.ts) :
--   * élément rattaché à un stage (placement_assignment_id)  => placement_supervisor
--     (l'encadrant EXACT de ce stage est requis)
--   * acquis real_competence SANS stage encore assigné       => teacher_or_admin
--     décision PROVISOIRE sur le CALENDRIER uniquement ; elle ne vaut jamais
--     acquisition, et dès qu'un stage est rattaché à l'élément, toute demande
--     ultérieure exige l'encadrant exact
--   * échéance officielle, ordre, hors fenêtre officielle    => teacher_or_admin
--   * cible personnelle et/ou rythme, dans la fenêtre        => auto_accept
-- L'ordre d'évaluation est décroissant en exigence.
-- =====================================================================
create or replace function public.derive_plan_change_request_impact()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  _item    public.acquisition_plan_items;
  _nature  public.outcome_nature;
  _official boolean;
  _personal boolean;
  _in_window boolean;
begin
  select * into _item
    from public.acquisition_plan_items i
   where i.id = new.plan_item_id;

  if _item.id is null then
    raise exception 'plan item % does not exist', new.plan_item_id;
  end if;

  select o.nature into _nature
    from public.outcomes o where o.id = _item.outcome_id;

  _official := new.proposed_official_due_at is not null
               or (new.proposed_sequence is not null
                   and new.proposed_sequence <> _item.sequence);
  _personal := new.proposed_learner_target_at is not null
               or new.proposed_pace <> '{}'::jsonb;

  _in_window := new.proposed_learner_target_at is null
                or (
                  (_item.official_start_at is null
                    or new.proposed_learner_target_at >= _item.official_start_at)
                  and (_item.official_due_at is null
                    or new.proposed_learner_target_at <= _item.official_due_at)
                );

  if _item.placement_assignment_id is not null then
    -- Stage rattaché : l'encadrant exact de CE stage, et lui seul.
    new.change_impact := 'clinical_competence';
    new.required_approver_role := 'placement_supervisor';
  elsif _nature = 'real_competence' then
    -- Aucun stage assigné : la demande resterait indécidable si l'on exigeait
    -- un encadrant. Repli SÛR : enseignant/administrateur de portée statue
    -- provisoirement sur le calendrier. Aucune acquisition n'en découle
    -- (la maîtrise reste dérivée des preuves validées, 003 §5).
    new.change_impact := 'clinical_competence';
    new.required_approver_role := 'teacher_or_admin';
  elsif _official or not _in_window then
    new.change_impact := case
      when new.proposed_official_due_at is not null then 'official_deadline'
      else 'prerequisite'
    end;
    new.required_approver_role := 'teacher_or_admin';
  elsif _personal then
    new.change_impact := case
      when new.proposed_pace <> '{}'::jsonb then 'personal_pace'
      else 'personal_target'
    end;
    new.required_approver_role := 'auto_accept';
  else
    raise exception 'a plan change request must propose at least one change';
  end if;

  -- Cohérence de portée : la demande porte toujours sur l'inscription de l'item.
  new.enrollment_id := _item.enrollment_id;
  new.program_id    := _item.program_id;
  return new;
end;
$$;

drop trigger if exists pcr_derive_impact on public.plan_change_requests;
create trigger pcr_derive_impact
  before insert or update of proposed_learner_target_at, proposed_official_due_at,
                             proposed_sequence, proposed_pace
  on public.plan_change_requests
  for each row execute function public.derive_plan_change_request_impact();


-- =====================================================================
-- 8. Transitions de cycle de vie d'une demande
--   draft   -> pending   (justification obligatoire, déjà en CHECK)
--   draft   -> withdrawn
--   pending -> withdrawn (tant qu'aucune décision n'est journalisée)
--   pending -> approved | rejected  : RÉSERVÉ au trigger de décision (§9)
--   toute autre transition, et toute écriture sur une demande décidée : refus.
-- La colonne status est accordée au client (001 §13.9) mais ce trigger la
-- borne : le client ne peut jamais poser lui-même approved / rejected.
-- =====================================================================
create or replace function public.enforce_plan_change_request_transitions()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  -- Contexte effectif, évalué sans appel de fonction imbriqué (cf. §6.bis) :
  -- vrai uniquement dans une fonction SECURITY DEFINER possédée par postgres.
  _internal boolean := (current_user = 'postgres');
begin
  -- Identité et demandeur non falsifiables après création.
  if new.plan_item_id <> old.plan_item_id
     or new.requested_by <> old.requested_by
     or new.enrollment_id <> old.enrollment_id
     or new.program_id <> old.program_id
     or new.created_at <> old.created_at then
    raise exception 'plan change request identity is immutable'
      using errcode = 'insufficient_privilege';
  end if;

  if old.status in ('approved', 'rejected', 'withdrawn') then
    raise exception 'plan change request % is already %, it cannot be rewritten',
      old.id, old.status using errcode = 'insufficient_privilege';
  end if;

  if new.status <> old.status then
    if new.status in ('approved', 'rejected') then
      if not _internal then
        raise exception
          'only a recorded decision can set a plan change request to %', new.status
          using errcode = 'insufficient_privilege';
      end if;
      new.decided_at := coalesce(new.decided_at, pg_catalog.clock_timestamp());
    elsif new.status = 'pending' then
      if old.status <> 'draft' then
        raise exception 'invalid transition % -> pending', old.status
          using errcode = 'check_violation';
      end if;
      if new.justification is null
         or length(btrim(new.justification)) < 10 then
        raise exception 'a justification is required before submitting a request'
          using errcode = 'check_violation';
      end if;
      new.submitted_at := pg_catalog.clock_timestamp();
    elsif new.status = 'withdrawn' then
      if old.status not in ('draft', 'pending') then
        raise exception 'invalid transition % -> withdrawn', old.status
          using errcode = 'check_violation';
      end if;
      new.withdrawn_at := pg_catalog.clock_timestamp();
    else
      raise exception 'invalid transition % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  else
    -- Une demande soumise est immuable hors décision ou retrait.
    if old.status = 'pending' and not _internal then
      raise exception 'a pending plan change request cannot be edited'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists pcr_transitions on public.plan_change_requests;
create trigger pcr_transitions
  before update on public.plan_change_requests
  for each row execute function public.enforce_plan_change_request_transitions();

-- =====================================================================
-- 9. Application atomique d'une décision + journalisation d'audit
-- SECURITY DEFINER : la fonction doit écrire des colonnes de
-- acquisition_plan_items et plan_change_requests que le rôle appelant n'a pas
-- le privilège d'écrire (official_due_at, sequence, status décisionnel).
-- Elle n'est PAS appelable directement : trigger AFTER INSERT sur
-- plan_change_decisions, dont l'insertion a déjà franchi la policy
-- pcd_insert_authorized (rôle exigé exact, portée exacte, non-demandeur).
-- =====================================================================
create or replace function public.apply_plan_change_decision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _req public.plan_change_requests;
begin
  select * into _req
    from public.plan_change_requests r where r.id = new.request_id
    for update;

  if _req.status <> 'pending' then
    raise exception 'plan change request % is not pending (status %)',
      _req.id, _req.status using errcode = 'check_violation';
  end if;


  -- rejected : AUCUNE écriture sur l'élément de plan (ni date, ni rythme).
  if new.decision = 'approved' then
    -- Seuls les champs proposés sont appliqués, un par un, dans la même
    -- transaction que la décision et son audit.
    update public.acquisition_plan_items i
       set learner_target_at = coalesce(_req.proposed_learner_target_at,
                                        i.learner_target_at),
           learner_pace      = case when _req.proposed_pace <> '{}'::jsonb
                                    then _req.proposed_pace
                                    else i.learner_pace end,
           official_due_at   = coalesce(_req.proposed_official_due_at,
                                        i.official_due_at),
           sequence          = coalesce(_req.proposed_sequence, i.sequence)
     where i.id = _req.plan_item_id;
  end if;

  update public.plan_change_requests r
     set status = case new.decision
                    when 'approved' then 'approved'::public.plan_change_status
                    else 'rejected'::public.plan_change_status
                  end,
         decided_at = new.decided_at
   where r.id = _req.id;

  insert into public.audit_events
    (actor_person_id, action, target_type, target_id, program_id, detail)
  values (
    new.reviewer_person_id,
    'plan_change_request.' || new.decision::text,
    'plan_change_request',
    _req.id::text,
    _req.program_id,
    jsonb_build_object(
      'plan_item_id', _req.plan_item_id,
      'change_impact', _req.change_impact,
      'required_approver_role', _req.required_approver_role,
      'applied_learner_target_at', _req.proposed_learner_target_at,
      'applied_learner_pace',
        case when new.decision = 'approved' then _req.proposed_pace
             else '{}'::jsonb end,
      'applied_official_due_at', _req.proposed_official_due_at,
      'applied_sequence', _req.proposed_sequence,
      'reviewer_role', new.reviewer_role,
      'decision_id', new.id
    )
  );

  return null;  -- AFTER trigger.
end;
$$;

drop trigger if exists pcd_apply_decision on public.plan_change_decisions;
create trigger pcd_apply_decision
  after insert on public.plan_change_decisions
  for each row execute function public.apply_plan_change_decision();

-- Journal append-only : refus explicite, y compris pour service_role.
create or replace function public.forbid_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception '% is append-only (attempted %)', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists pcd_append_only on public.plan_change_decisions;
create trigger pcd_append_only
  before update or delete on public.plan_change_decisions
  for each row execute function public.forbid_write();

-- =====================================================================
-- 10. Auto-acceptation d'un changement strictement personnel
-- Règle métier : un ajustement de cible personnelle ou de rythme, sans impact
-- institutionnel et dans la fenêtre officielle, n'a pas besoin d'un décideur.
-- Il est appliqué à la soumission, et journalisé comme les autres.
-- =====================================================================
create or replace function public.auto_accept_personal_plan_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status <> 'pending' or new.required_approver_role <> 'auto_accept' then
    return null;
  end if;


  update public.acquisition_plan_items i
     set learner_target_at = coalesce(new.proposed_learner_target_at,
                                      i.learner_target_at),
         learner_pace      = case when new.proposed_pace <> '{}'::jsonb
                                  then new.proposed_pace
                                  else i.learner_pace end
   where i.id = new.plan_item_id;

  update public.plan_change_requests r
     set status = 'approved', decided_at = pg_catalog.clock_timestamp()
   where r.id = new.id;

  insert into public.audit_events
    (actor_person_id, action, target_type, target_id, program_id, detail)
  values (new.requested_by, 'plan_change_request.auto_accepted',
          'plan_change_request', new.id::text, new.program_id,
          jsonb_build_object('plan_item_id', new.plan_item_id,
                             'change_impact', new.change_impact,
                             'applied_learner_target_at',
                                new.proposed_learner_target_at,
                             'applied_learner_pace', new.proposed_pace));

  return null;
end;
$$;

drop trigger if exists pcr_auto_accept on public.plan_change_requests;
create trigger pcr_auto_accept
  after update of status on public.plan_change_requests
  for each row execute function public.auto_accept_personal_plan_change();

-- =====================================================================
-- 11. Éléments de plan : tout sauf progress_state est gelé hors chemin interne
-- Le client n'a le GRANT que sur progress_state (001 §13.9) ; ce trigger ferme
-- le cas service_role, couvre AUSSI learner_target_at et learner_pace, et
-- rappelle que progress_state n'est PAS une acquisition.
-- =====================================================================
create or replace function public.enforce_plan_item_official_fields()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  -- Contexte effectif, évalué sans appel de fonction imbriqué (cf. §6.bis) :
  -- vrai uniquement dans une fonction SECURITY DEFINER possédée par postgres.
  _internal boolean := (current_user = 'postgres');
begin
  if new.plan_id <> old.plan_id
     or new.enrollment_id <> old.enrollment_id
     or new.program_id <> old.program_id
     or new.outcome_id <> old.outcome_id then
    raise exception 'plan item identity is immutable'
      using errcode = 'insufficient_privilege';
  end if;

  if not _internal then
    if new.official_start_at is distinct from old.official_start_at
       or new.official_due_at is distinct from old.official_due_at
       or new.sequence is distinct from old.sequence
       or new.is_mandatory is distinct from old.is_mandatory
       or new.placement_assignment_id is distinct from old.placement_assignment_id then
      raise exception
        'official plan fields change only through an approved plan change request'
        using errcode = 'insufficient_privilege';
    end if;
    -- Calendrier personnel et rythme : jamais en UPDATE direct, même pour
    -- service_role. Ils exigent une demande justifiée (auto-acceptée ou approuvée).
    if new.learner_target_at is distinct from old.learner_target_at
       or new.learner_pace is distinct from old.learner_pace then
      raise exception
        'learner_target_at and learner_pace change only through a justified plan change request'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Bornage de la cible personnelle : elle reste dans la fenêtre officielle.
  if new.learner_target_at is not null then
    if (new.official_start_at is not null
         and new.learner_target_at < new.official_start_at)
       or (new.official_due_at is not null
         and new.learner_target_at > new.official_due_at) then
      raise exception
        'learner_target_at must stay inside the official window'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists api_official_fields on public.acquisition_plan_items;
create trigger api_official_fields
  before update on public.acquisition_plan_items
  for each row execute function public.enforce_plan_item_official_fields();

-- =====================================================================
-- 12. Rattachement des triggers transverses existants aux nouvelles tables
-- (provenance §3, updated_at §4) — même mécanisme, mêmes garanties.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'acquisition_plan_templates', 'acquisition_plan_template_items',
    'acquisition_plan_template_item_dependencies', 'acquisition_plans',
    'acquisition_plan_items', 'plan_change_requests',
    'plan_change_decisions', 'passport_share_preferences'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I',
                   t || '_source_provenance', t);
    execute format(
      'create trigger %I before insert or update on public.%I '
      'for each row execute function public.enforce_source_provenance()',
      t || '_source_provenance', t);
  end loop;

  -- plan_change_decisions n'a pas de colonne updated_at (append-only).
  foreach t in array array[
    'acquisition_plan_templates', 'acquisition_plan_template_items',
    'acquisition_plans', 'acquisition_plan_items', 'plan_change_requests',
    'passport_share_preferences'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I',
                   'z_' || t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I '
      'for each row execute function public.set_updated_at()',
      'z_' || t || '_set_updated_at', t);
  end loop;
end $$;

-- =====================================================================
-- 13. Exposition : aucune des nouvelles fonctions n'est appelable par un client
-- =====================================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.enforce_plan_template_immutable()',
    'public.derive_plan_change_request_impact()',
    'public.enforce_plan_change_request_transitions()',
    'public.apply_plan_change_decision()',
    'public.auto_accept_personal_plan_change()',
    'public.enforce_plan_item_official_fields()',
    'public.forbid_write()'
  ]
  loop
    execute format('alter function %s owner to postgres', fn);
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('revoke all on function %s from service_role', fn);
  end loop;
end $$;
-- Aucun drapeau applicatif (custom GUC) n'intervient dans une autorisation :
-- set_config('app.plan_change_applying', ...) n'existe plus dans ce fichier.
-- Le seul chemin d'écriture privilégiée est le contexte effectif
-- current_user = 'postgres' (§6.bis), atteignable uniquement à l'intérieur des
-- fonctions SECURITY DEFINER possédées par postgres ci-dessus, dont l'EXECUTE
-- est révoqué pour PUBLIC, anon, authenticated et service_role.
-- Contrôle statique attendu : `rg -n "_plan_writer|current_setting\('app\." .`
-- ne doit renvoyer AUCUNE définition ni référence, et les deux triggers INVOKER
-- (§8, §11) doivent tester `current_user = 'postgres'` en ligne, sans appel de
-- fonction, pour ne dépendre d'aucun privilège EXECUTE.


-- FIN — DRAFT — DO NOT EXECUTE
