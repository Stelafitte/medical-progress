-- LE COMPAGNON D'APPRENTISSAGE : fils de discussion ancres sur les cours.
--
-- Demande de Stef le 03/09 : un outil de chat qui « n'utilise que le contenu
-- des ressources theoriques », fonctionne « comme un fil de discussion sur un
-- sujet donne », a l'ecrit et « surtout en vocal sur smartphone », et sait
-- interroger l'apprenant (questions ouvertes, fermees, QCM, auto-evaluation).
--
-- CE QUE CETTE MIGRATION POSE, ET RIEN DE PLUS : le stockage des fils, la
-- regle de qui les lit, et le plafond de consommation. Ni la recherche (elle
-- existe deja : `search_learning_resource_texts`, 30/08), ni l'appel au modele
-- (il vivra dans une Edge Function, comme `analyze-program-objectives`).

/* ================================================================== */
/* 1. Le reglage IA d'un programme                                     */
/* ================================================================== */

-- TABLE A PART PLUTOT QU'UNE COLONNE SUR `programs`. Le reglage IA va grossir
-- (modele, paliers autorises, corpus ouverts) et n'a rien a faire dans la
-- table qui porte l'identite d'un enseignement. Un programme sans ligne ici
-- n'a pas d'IA : l'absence vaut refus, jamais autorisation par defaut.
create table public.program_ai_settings (
  program_id uuid primary key references public.programs (id) on delete cascade,
  enabled boolean not null default false,
  -- Plafond MENSUEL par apprenant, en credits (voir CREDIT_UNIT_COST_BY_TIER
  -- cote domaine : modele leger = 1, modele avance = 4, vocal = 12).
  -- Decision de Stef le 03/09 : un plafond des la V1. Sans lui, un seul
  -- etudiant peut vider le compte du fournisseur en une nuit, et personne ne
  -- s'en apercoit avant la facture.
  monthly_credit_cap integer not null default 400 check (monthly_credit_cap >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.program_ai_settings enable row level security;
revoke all on public.program_ai_settings from public, anon, authenticated;
grant select on public.program_ai_settings to authenticated;

-- L'apprenant a le droit de savoir si l'outil est ouvert et quel est son
-- plafond : un quota qu'on ne peut pas lire est un quota qu'on subit.
create policy program_ai_settings_select on public.program_ai_settings
for select to authenticated
using (
  public.is_program_staff(program_id) or public.is_enrolled_in_program(program_id)
);

/* ================================================================== */
/* 2. Les fils                                                         */
/* ================================================================== */

create type public.ai_thread_scope as enum ('knowledge', 'competence');

-- UN FIL = UN SUJET. C'est la forme demandee : on ouvre un fil sur « les
-- endocardites », on y revient, le contexte tient. Le rattachement a un acquis
-- est OPTIONNEL : un etudiant part souvent d'une question, pas d'un code.
create table public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  -- L'onglet d'origine. Les deux corpus ne se melangent pas : un fil ouvert
  -- depuis « Mes competences » n'ira pas chercher dans les chapitres SFC.
  scope public.ai_thread_scope not null,
  title text not null default '' check (length(title) <= 200),
  outcome_id uuid references public.outcomes (id) on delete set null,
  -- PARTAGE A L'INITIATIVE DE L'ETUDIANT (decision du 03/09). Le fil est prive
  -- par defaut : un etudiant qui se sait lu ne pose plus les questions betes,
  -- celles qui font progresser. Mais il doit pouvoir montrer un fil precis a
  -- son encadrant -- d'ou une date, et non un booleen : on veut savoir QUAND
  -- il a partage, et le retrait remet simplement la colonne a NULL.
  shared_with_staff_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_threads_enrollment_idx on public.ai_threads (enrollment_id, updated_at desc);
create index ai_threads_shared_idx on public.ai_threads (program_id)
  where shared_with_staff_at is not null;

alter table public.ai_threads enable row level security;
revoke all on public.ai_threads from public, anon, authenticated;
grant select on public.ai_threads to authenticated;

create policy ai_threads_select on public.ai_threads
for select to authenticated
using (
  public.owns_enrollment(enrollment_id)
  or (shared_with_staff_at is not null and public.is_program_staff(program_id))
);

/* ================================================================== */
/* 3. Les tours de parole                                              */
/* ================================================================== */

create type public.ai_message_role as enum ('learner', 'assistant');

-- LES CITATIONS SONT UNE COLONNE, PAS UNE MISE EN FORME DU TEXTE. C'est le
-- seul moyen pour l'etudiant de verifier ce qu'on lui affirme, et pour nous de
-- constater apres coup qu'une reponse ne s'appuyait sur rien. Un modele de
-- langage peut toujours completer avec ce qu'il sait par ailleurs ; en
-- medecine, cela doit se voir. Une reponse sans citation reste possible --
-- « je ne trouve pas cela dans vos supports » en est une -- mais elle est
-- alors visiblement sans source.
--
-- LES JETONS ET LES SECONDES D'AUDIO SONT CONSERVES sur chaque tour : c'est ce
-- qui permettra de repondre a la question de Stef -- « on validera sur le
-- cout » -- avec des mesures et non des estimations.
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_threads (id) on delete cascade,
  role public.ai_message_role not null,
  content text not null,
  -- Mode demande par l'apprenant (ask, be_questioned, generate_quiz,
  -- guided_clinical_case, adaptive_review, voice). Texte libre volontairement :
  -- la liste vit cote domaine et bougera plus vite que la base.
  mode text not null default 'ask' check (length(mode) <= 40),
  citations jsonb not null default '[]'::jsonb,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  audio_seconds numeric(8, 2) not null default 0 check (audio_seconds >= 0),
  -- Credits consommes par CE tour. Zero pour un message de l'apprenant.
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now()
);

create index ai_messages_thread_idx on public.ai_messages (thread_id, created_at);

alter table public.ai_messages enable row level security;
revoke all on public.ai_messages from public, anon, authenticated;
grant select on public.ai_messages to authenticated;

-- Meme regle que le fil : on ne dedouble pas la decision, on la delegue.
create policy ai_messages_select on public.ai_messages
for select to authenticated
using (
  exists (
    select 1 from public.ai_threads t
    where t.id = ai_messages.thread_id
      and (
        public.owns_enrollment(t.enrollment_id)
        or (t.shared_with_staff_at is not null and public.is_program_staff(t.program_id))
      )
  )
);

/* ================================================================== */
/* 4. La consommation, lue depuis les tours eux-memes                  */
/* ================================================================== */

-- PAS DE SECOND REGISTRE. Le compteur pourrait vivre dans une table dediee ;
-- il y aurait alors DEUX verites sur la meme consommation, et un jour elles
-- divergeraient. Les tours de parole SONT le registre : on les somme.
-- Le mois calendaire est la fenetre, parce que c'est celle d'une facture.
create function public.ai_credits_used_this_month(p_enrollment_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(m.credits), 0)::integer
  from public.ai_messages m
  join public.ai_threads t on t.id = m.thread_id
  where t.enrollment_id = p_enrollment_id
    and m.created_at >= date_trunc('month', now());
$$;

revoke all on function public.ai_credits_used_this_month(uuid) from public, anon;
grant execute on function public.ai_credits_used_this_month(uuid) to authenticated;

/* ================================================================== */
/* 5. Ouvrir un fil, partager un fil                                   */
/* ================================================================== */

-- Aucune policy d'ecriture sur les deux tables : tout passe par des fonctions,
-- comme pour `outcome_self_reports`. L'ecriture des tours de parole, elle,
-- appartient a l'Edge Function -- c'est elle qui a vu la reponse du modele et
-- qui sait ce qu'elle a coute.
create function public.start_ai_thread(
  p_enrollment_id uuid,
  p_scope public.ai_thread_scope,
  p_title text default '',
  p_outcome_id uuid default null
) returns public.ai_threads
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_row public.ai_threads;
begin
  if not public.owns_enrollment(p_enrollment_id) then
    raise exception 'Cette inscription n''est pas la votre.';
  end if;

  select e.program_id into v_program_id
  from public.enrollments e where e.id = p_enrollment_id;

  if not exists (
    select 1 from public.program_ai_settings s
    where s.program_id = v_program_id and s.enabled
  ) then
    raise exception 'Le compagnon IA n''est pas ouvert sur ce programme.';
  end if;

  -- Un acquis d'un AUTRE programme ne peut pas amorcer un fil : ce serait
  -- ouvrir une porte discrete vers un referentiel qu'on n'a pas le droit de lire.
  if p_outcome_id is not null and not exists (
    select 1 from public.outcomes o
    where o.id = p_outcome_id and o.program_id = v_program_id
  ) then
    raise exception 'Cet acquis n''appartient pas a ce programme.';
  end if;

  insert into public.ai_threads (enrollment_id, program_id, scope, title, outcome_id)
  values (p_enrollment_id, v_program_id, p_scope, left(coalesce(p_title, ''), 200), p_outcome_id)
  returning * into v_row;

  return v_row;
end;
$$;

-- Partager, ou reprendre son partage. Le meme geste dans les deux sens : un
-- etudiant qui ne peut pas retirer ce qu'il a montre ne montrera rien.
create function public.set_ai_thread_shared(
  p_thread_id uuid,
  p_shared boolean
) returns public.ai_threads
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.ai_threads;
begin
  if not exists (
    select 1 from public.ai_threads t
    where t.id = p_thread_id and public.owns_enrollment(t.enrollment_id)
  ) then
    raise exception 'Ce fil n''est pas le votre.';
  end if;

  update public.ai_threads
     set shared_with_staff_at = case when p_shared then now() else null end,
         updated_at = now()
   where id = p_thread_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.start_ai_thread(uuid, public.ai_thread_scope, text, uuid)
  from public, anon, authenticated;
revoke all on function public.set_ai_thread_shared(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.start_ai_thread(uuid, public.ai_thread_scope, text, uuid)
  to authenticated;
grant execute on function public.set_ai_thread_shared(uuid, boolean)
  to authenticated;
