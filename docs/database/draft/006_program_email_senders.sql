-- Campus Santé Augmenté — expéditeur SMTP dédié par programme
--
-- ****************************************************************
-- BROUILLON — NON APPLIQUÉ. Ne pas exécuter sur un environnement
-- Supabase sans validation explicite. Voir décision D95 dans
-- docs/database/draft/decision_log.md pour le raisonnement complet.
-- ****************************************************************
--
-- Objectif : chaque programme (DFASM, DIU écho, DPC...) a sa propre
-- identité institutionnelle et son propre nom de domaine OVH
-- (dfasm-connect.fr, echocardio-chubx.fr, odp2c.org...). Cette table fait
-- le lien entre un programme et la boîte mail OVH utilisée pour lui
-- envoyer ses invitations, SANS jamais stocker le mot de passe en base :
-- seul le NOM du secret Supabase (Edge Function Secrets) est stocké ; le
-- mot de passe lui-même reste uniquement dans le coffre de secrets,
-- jamais dans une table.
--
-- Un programme sans ligne ici n'a pas d'expéditeur dédié : la fonction
-- invite-person retombe alors sur le mécanisme d'invitation intégré de
-- Supabase (expéditeur générique noreply@mail.app.supabase.io), ce qui
-- garde le pilote actuel ("Campus Santé") fonctionnel sans rien casser.

create table public.program_email_senders (
  program_id uuid primary key references public.programs (id) on delete cascade,
  smtp_host text not null default 'smtp.mail.ovh.net',
  smtp_port integer not null default 465,
  -- Adresse de la boîte (ex. invitations@dfasm-connect.fr) : pas sensible,
  -- sert aussi de valeur "From" et de nom d'utilisateur SMTP.
  smtp_user text not null check (smtp_user = lower(btrim(smtp_user))),
  -- Nom du secret Supabase Edge Function contenant le mot de passe de
  -- cette boîte (ex. "SMTP_PASSWORD_DFASM"). Jamais le mot de passe lui-même.
  smtp_password_secret text not null check (length(btrim(smtp_password_secret)) between 1 and 100),
  from_name text not null check (length(btrim(from_name)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.program_email_senders is
  'Un programme -> une identité SMTP dédiée (boîte OVH par domaine '
  'institutionnel). Le mot de passe ne vit jamais ici, seulement le nom '
  'du secret Supabase qui le contient. Voir décision D95.';

create trigger program_email_senders_set_updated_at
before update on public.program_email_senders
for each row execute function public.set_updated_at();

alter table public.program_email_senders enable row level security;

revoke all on public.program_email_senders from anon, authenticated;
-- Lecture/écriture réservée à l'administration plateforme : c'est une
-- config d'infrastructure transverse, pas une donnée de programme
-- ordinaire. Réutilise is_platform_admin(), sans modification.
grant select, insert, update, delete on public.program_email_senders to authenticated;

create policy program_email_senders_platform_admin on public.program_email_senders
for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Pas de policy program_staff : la fonction invite-person lit cette table
-- via son client service_role (comme pour l'appel admin d'invitation
-- lui-même), jamais via le client scopé sur l'utilisateur appelant — ça
-- évite d'exposer la config SMTP (host/port/adresse d'envoi) à travers
-- une nouvelle policy RLS alors que ce n'est pas nécessaire au fonctionnement.
