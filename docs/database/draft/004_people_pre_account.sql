-- Campus Santé Augmenté — sas de pré-inscription (personnes sans compte)
--
-- ****************************************************************
-- BROUILLON — NON APPLIQUÉ. Ne pas exécuter sur un environnement
-- Supabase sans validation explicite. Voir décisions D89 et D94 dans
-- docs/database/draft/decision_log.md pour le raisonnement complet.
-- ****************************************************************
--
-- Objectif étroit : répondre à « une personne peut-elle exister sans compte
-- de connexion ? » (oui) SANS toucher à profiles, enrollments,
-- role_assignments, audit_events, ni à une seule policy RLS ou fonction de
-- sécurité déjà appliquée (is_platform_admin, can_administer_program,
-- is_program_staff, is_enrolled_in_program, can_read_profile) : elles
-- continuent toutes de supposer person_id = auth.uid(), inchangé.
--
-- `people` est un sas : une personne y existe entre le moment où un
-- administrateur la crée (ajout individuel ou import CSV/TSV) et le moment où
-- elle se connecte réellement pour la première fois. Dès cette première
-- connexion réelle, le déclencheur handle_new_auth_user existant (migration
-- 20260821090000) crée sa ligne profiles comme pour n'importe quel compte
-- aujourd'hui — ce brouillon ne modifie pas ce mécanisme. Le rattachement
-- automatique people -> profiles + la création de l'inscription associée
-- sont conçus séparément dans 005_people_activation_link.sql (D94).
--
-- Le rattachement people → profiles (activated_profile_id) est une
-- information de continuité administrative (traçabilité de l'invitation),
-- jamais une base de décision d'accès : tant qu'une personne n'a pas de ligne
-- profiles, elle n'a aucune session et donc rien à sécuriser côté RLS.
--
-- D94 (2026-08-22) a validé le principe produit suivant, repris ici : un
-- responsable pédagogique crée un groupe d'apprenants (cohorte), y ajoute des
-- personnes par import ou à la main, puis déclenche l'envoi d'un e-mail
-- d'invitation à chacune pour qu'elle se connecte. `intended_cohort_id`
-- porte cette intention d'inscription dès la création de la personne, avant
-- même l'envoi de l'invitation.

create table public.people (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  first_name text not null check (length(btrim(first_name)) between 1 and 120),
  last_name text not null check (length(btrim(last_name)) between 1 and 120),
  institutional_id text check (institutional_id is null or length(btrim(institutional_id)) between 1 and 80),
  login_email text not null check (login_email = lower(btrim(login_email))),
  origin text not null default 'individual' check (origin in ('individual', 'import')),
  -- Cohorte visée dès la création (import ou ajout individuel). Facultative :
  -- une personne peut exister sans cohorte cible (ex. intervenant externe,
  -- cf. rationale D89). Doit appartenir au même programme que `program_id`.
  intended_cohort_id uuid,
  -- Cycle de vie de l'INVITATION (distinct du statut de compte réel, qui
  -- n'existera qu'une fois profiles créé) :
  --   pending   : personne créée, aucun e-mail envoyé pour l'instant ;
  --   invited   : e-mail d'invitation envoyé, en attente de première connexion ;
  --   activated : première connexion réelle effectuée, activated_profile_id renseigné ;
  --   cancelled : invitation annulée par un administrateur avant toute connexion.
  status text not null default 'pending' check (status in ('pending', 'invited', 'activated', 'cancelled')),
  invited_at timestamptz,
  invited_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  -- Renseigné par le déclencheur d'activation (005_people_activation_link.sql)
  -- lors de la première connexion réelle correspondant à login_email.
  activated_profile_id uuid unique references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un même e-mail ne peut pas être en attente deux fois dans le même programme.
  unique (program_id, login_email),
  constraint people_cohort_same_program
    foreign key (intended_cohort_id, program_id)
    references public.cohorts (id, program_id) on delete set null,
  constraint people_status_activation_coherent check (
    (status = 'activated') = (activated_profile_id is not null)
  ),
  constraint people_status_invited_coherent check (
    status not in ('invited', 'activated') or invited_at is not null
  ),
  constraint people_status_cancelled_coherent check (
    (status = 'cancelled') = (cancelled_at is not null)
  )
);

comment on table public.people is
  'Sas de pré-inscription : personnes créées par un administrateur mais pas '
  'encore connectées. Ne fait PAS foi pour une décision d''accès — voir '
  'décisions D89 et D94. Une fois activated_profile_id renseigné, profiles '
  'et enrollments sont la seule source de vérité pour cette personne.';

create trigger people_set_updated_at
before update on public.people
for each row execute function public.set_updated_at();

alter table public.people enable row level security;

revoke all on public.people from anon, authenticated;
grant select, insert, update on public.people to authenticated;

-- Visible et modifiable uniquement par le personnel du programme concerné.
-- Réutilise is_program_staff(), sans aucune modification de cette fonction.
create policy people_select_staff on public.people
for select to authenticated
using (public.is_program_staff(program_id));

create policy people_insert_staff on public.people
for insert to authenticated
with check (
  public.is_program_staff(program_id)
  and created_by = auth.uid()
);

create policy people_update_staff on public.people
for update to authenticated
using (public.is_program_staff(program_id))
with check (public.is_program_staff(program_id));

-- Pas de policy delete : une personne en attente s'annule en pratique par
-- un statut ('cancelled'), pas par une suppression — cohérent avec la règle
-- déjà en vigueur ailleurs dans le projet (aucune suppression définitive).
--
-- NON COUVERT PAR CE BROUILLON, volontairement : l'envoi réel de l'e-mail
-- d'invitation. `invited_at`/`invited_by`/`status='invited'` sont l'état
-- attendu APRÈS un envoi réussi, mais l'envoi lui-même nécessite l'API
-- admin Supabase Auth (clé service_role, donc une Edge Function serveur —
-- jamais depuis le frontend) et déclenche une vraie communication vers un
-- tiers réel. Voir D94 : ce composant sera conçu et proposé séparément,
-- et ne sera déployé qu'avec un accord explicite, distinct de cette
-- validation de schéma.
