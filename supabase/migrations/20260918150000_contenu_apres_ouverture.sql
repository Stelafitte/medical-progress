-- 18/09 -- L'APPRENANT NE VOIT LE PROGRAMME QU'UNE FOIS SA PROMOTION OUVERTE
--
-- LE CONSTAT (Stef, 18/09) : inscrit dans « Promotion test SL DU », promotion
-- encore en BROUILLON d'un programme ni concu ni programme (DIU-ECHO-1 :
-- 0 acquis), l'etudiant voyait deja le cours publie dans la Mediatheque.
-- « Puisque rien n'est concu ou programme, l'apprenant ne devrait pas voir de
-- contenu a ce stade. »
--
-- LA CAUSE : `is_enrolled_in_program` ne regardait que l'inscription. Le statut
-- de la promotion -- que le Concepteur fait passer de `draft` a `open` par
-- `open_cohort` (02/09), une fois calendrier et acquis poses -- n'entrait nulle
-- part dans l'acces.
--
-- LE CORRECTIF, EN UN SEUL ENDROIT : toutes les lectures apprenant (supports,
-- acquis, jalons, evaluations, carnet, banque de questions, dossiers, fils...)
-- passent par cette fonction -- 16 migrations s'y appuient. La corriger ici,
-- c'est les corriger toutes, sans en oublier une.
--
-- Statuts qui ouvrent l'acces : `open`, `in_progress`, `completed` (un ancien
-- etudiant garde la lecture de ce qu'il a suivi). `draft` et `archived` ne
-- l'ouvrent pas. Le personnel du programme n'est pas concerne : il passe par
-- `is_program_staff`.
--
-- REJOUABLE.

create or replace function public.is_enrolled_in_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.cohorts c on c.id = e.cohort_id
    where e.person_id = auth.uid()
      and e.program_id = p_program_id
      and e.status in ('active', 'completed')
      and c.status in ('open', 'in_progress', 'completed')
  );
$$;

-- LE PROGRAMME LUI-MEME RESTE LISIBLE. `programs_select_scoped` s'appuyait sur
-- la meme fonction : sans cette reecriture, l'etudiant d'une promotion en
-- brouillon ne verrait meme plus le NOM de son programme, et l'ecran ne
-- pourrait pas lui dire « votre promotion n'est pas encore ouverte ». Il garde
-- le nom et les reglages du programme ; c'est le CONTENU qui attend l'ouverture.

drop policy if exists programs_select_scoped on public.programs;
create policy programs_select_scoped on public.programs
for select to authenticated
using (
  public.is_program_staff(id)
  or exists (
    select 1 from public.enrollments e
    where e.person_id = auth.uid()
      and e.program_id = programs.id
      and e.status in ('active', 'completed')
  )
);
