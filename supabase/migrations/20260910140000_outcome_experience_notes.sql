-- LA NOTE D EXPERIENCE, SEPAREE DE LA DECLARATION.
--
-- Decision de Stef du 10/09, option B sur trois. « Mon experience
-- d'acquisition » existe a l'ecran depuis la maquette, mais vivait dans un
-- `useSyncExternalStore` EN MEMOIRE : l'etudiant tapait son vecu, rechargeait
-- la page, tout etait perdu -- et la boite ne portait meme pas de badge
-- « Simule », contrairement au fil de tuteur juste en dessous.
--
-- ⚠️ POURQUOI PAS `outcome_self_reports.note`, QUI EXISTE POURTANT DEJA.
-- La colonne est la (2 000 caracteres) et la RPC `declare_outcome_level` sait
-- l'ecrire. Mais elle vit sur la MEME LIGNE que la declaration, dont
-- `declared_level` est obligatoire : ecrire une note exigerait donc de
-- declarer un niveau. Or le texte le plus utile est justement celui de
-- quelqu'un qui n'est PAS encore pret a se declarer competent -- « j'ai fait
-- quatre interrogatoires, je bute sur les antecedents familiaux ». Brancher la
-- boite sur cette RPC aurait oblige la plateforme a DECLARER UNE COMPETENCE A
-- LA PLACE DE L'ETUDIANT. D'ou une table a part : ce que je declare et ce que
-- je raconte ne sont pas la meme chose et n'ont pas a partager une ligne.
--
-- POURQUOI ELLE EST LISIBLE PAR L'ENCADREMENT, DES LE DEPART. Stef (10/09) :
-- ces notes et les recits de carnet formeront le corpus d'une fonctionnalite
-- d'analyse a venir -- rapports de stage individuels, et rapport SUR le stage
-- et la facon de l'ameliorer. La lecture par l'encadrant n'est donc pas une
-- concession : c'est la raison d'etre du stockage.
--   ⚠️ ET L'ECRAN DOIT LE DIRE. Une mention « Vos encadrants peuvent lire vos
--   notes » accompagne la boite. Sans elle, l'ecran laisserait croire a un
--   journal intime -- le defaut du 09/09 (« un contenu credible et faux »),
--   retourne dans l'autre sens.
--
-- 10 000 CARACTERES, comme `stage_log_entries.narrative`, et non 2 000 comme
-- la note de declaration : les deux gisements du futur corpus doivent avoir le
-- meme plafond, sinon l'un est tronque et l'autre pas, sans que personne l'ait
-- decide. Le champ de saisie n'annoncait aucune limite.

create table public.outcome_experience_notes (
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  outcome_id uuid not null references public.outcomes (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- UNE NOTE PAR ETUDIANT ET PAR ACQUIS. Ce n'est pas un journal date : c'est
  -- un texte que l'on reprend et complete, comme le recit d'une journee.
  primary key (enrollment_id, outcome_id)
);

create index outcome_experience_notes_outcome_idx
  on public.outcome_experience_notes (outcome_id);

alter table public.outcome_experience_notes enable row level security;
revoke all on public.outcome_experience_notes from public, anon, authenticated;
grant select on public.outcome_experience_notes to authenticated;

-- Meme forme que `stage_logs_select` (31/08), volontairement : le titulaire de
-- l'inscription, ou qui l'encadre. Les deux gisements du corpus obeissent ainsi
-- a la meme regle, et il n'y a qu'une chose a comprendre.
-- ⚠️ LE GRANT QUI MANQUAIT DEPUIS LE 31/08, rendu explicite ici.
-- `supervises_enrollment` a ete revoquee de `public, anon` sans jamais etre
-- accordee a `authenticated` -- contrairement a `is_program_staff` et
-- `can_read_profile`, qui l'ont ligne 113 et 115 du 20260821092000. En
-- production cela ne se voit pas : Supabase pose des droits par defaut sur le
-- schema `public` qui accordent l'execution a `authenticated` (verifie en base
-- le 10/09 : `has_function_privilege` rend `true`). Mais la policy ci-dessous
-- appelle la fonction DIRECTEMENT, sans passer par une enveloppe
-- `security definer` -- elle dependrait donc d'un droit ambiant que personne
-- n'a ecrit. Le rendre explicite ne change rien en production et rend la
-- migration autonome.
grant execute on function public.supervises_enrollment(uuid) to authenticated;

create policy outcome_experience_notes_select on public.outcome_experience_notes
for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.id = outcome_experience_notes.enrollment_id and e.person_id = auth.uid()
  )
  or public.supervises_enrollment(outcome_experience_notes.enrollment_id)
);

-- ECRITURE RESERVEE AU TITULAIRE. Un encadrant lit la note, il ne la corrige
-- pas : ce qu'il a a dire passe par le fil de discussion, ou il est signe.
create function public.save_outcome_experience_note(
  p_enrollment_id uuid,
  p_outcome_id uuid,
  p_body text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.owns_enrollment(p_enrollment_id) then
    raise exception 'Cette inscription n''est pas la votre.';
  end if;

  -- VIDER LA BOITE EFFACE LA NOTE, plutot que de laisser une ligne vide.
  -- Une chaine vide stockee serait indiscernable d'une note jamais ecrite pour
  -- la future analyse, et ferait un faux positif dans tout comptage.
  if length(btrim(coalesce(p_body, ''))) = 0 then
    delete from public.outcome_experience_notes
     where enrollment_id = p_enrollment_id and outcome_id = p_outcome_id;
    return;
  end if;

  insert into public.outcome_experience_notes (enrollment_id, outcome_id, body)
  values (p_enrollment_id, p_outcome_id, btrim(p_body))
  on conflict (enrollment_id, outcome_id) do update
    set body = excluded.body, updated_at = now();
end;
$$;

revoke all on function public.save_outcome_experience_note(uuid, uuid, text)
  from public, anon;
grant execute on function public.save_outcome_experience_note(uuid, uuid, text)
  to authenticated;
