-- 21/09 -- DES LIENS D'INVITATION VALABLES 7 JOURS
--
-- LE CONSTAT (week-end du 19-20/09, invitations de la promotion DFASM) : la
-- plupart des etudiants ont recu « lien expire ». Le courriel portait un jeton
-- Supabase, dont la validite est d'UNE HEURE par defaut et de 24 h au plus :
-- un etudiant qui ouvre son courriel le lendemain arrive trop tard. Aucun
-- reglage Supabase ne permet 7 jours.
--
-- LA PARADE : le courriel ne porte plus de jeton Supabase. Il porte NOTRE
-- jeton, valable 7 jours, dont seule l'empreinte (SHA-256) est conservee ici.
-- Au clic sur « Activer mon compte », la fonction `claim-invitation` verifie
-- ce jeton et fabrique A CET INSTANT un lien Supabase, echange aussitot par la
-- page : il n'a plus le temps d'expirer.
--
-- LE JETON RESTE UTILISABLE PENDANT 7 JOURS, meme apres un premier clic : un
-- etudiant interrompu avant d'avoir choisi son mot de passe peut revenir par le
-- meme courriel. Un nouvel envoi pour la meme adresse REVOQUE les precedents.
--
-- ACCES : aucun. RLS activee sans politique, droits retires : seules les
-- fonctions (service_role) lisent et ecrivent cette table.
--
-- REJOUABLE.

create table if not exists public.invitation_links (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email))),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0
);

create index if not exists invitation_links_email_idx
  on public.invitation_links (email, created_at desc);

alter table public.invitation_links enable row level security;
revoke all on public.invitation_links from public, anon, authenticated;
