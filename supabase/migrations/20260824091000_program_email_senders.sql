-- RECONSTRUCTION (30/08/2026) : table existante en base sans fichier de
-- migration. Definition reelle relue en base, sans modification de
-- comportement.
--
-- Expediteur SMTP par programme, utilise par l'envoi des invitations.
-- La colonne smtp_password_secret ne contient jamais un mot de passe en clair :
-- elle porte le NOM du secret a resoudre cote serveur.

create table public.program_email_senders (
  program_id uuid primary key references public.programs (id) on delete cascade,
  smtp_host text not null default 'smtp.mail.ovh.net',
  smtp_port integer not null default 465,
  smtp_user text not null
    check (smtp_user = lower(btrim(smtp_user))),
  smtp_password_secret text not null
    check (length(btrim(smtp_password_secret)) between 1 and 100),
  from_name text not null
    check (length(btrim(from_name)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger program_email_senders_set_updated_at
before update on public.program_email_senders
for each row execute function public.set_updated_at();

alter table public.program_email_senders enable row level security;

revoke all on public.program_email_senders from public, anon;
grant select, insert, update, delete on public.program_email_senders to authenticated;

create policy program_email_senders_platform_admin on public.program_email_senders
for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());
