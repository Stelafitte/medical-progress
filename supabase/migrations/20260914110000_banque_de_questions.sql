/* ==================================================================
   BANQUE DE QUESTIONS — LE SOCLE (14/09)

   LA DEMANDE. Stef, le 11/09 : « les QCM doivent etre crees ET joues
   dans la plateforme ». Le 14/09, apres la passe de tri sur les 1493
   QRM deja rediges dans `qcm-banque/` : on ne mesure pas le taux de
   defaut, on PREVIENT l'etudiant et on lui donne un bouton pour
   signaler. Cette migration pose ce qu'il faut pour cela.

   LE MODELE EST POLYMORPHE. `question_items` porte le tronc commun --
   enonce, acquis, format, statut, version -- et `question_options` la
   charge utile des formats a propositions. Les formats a venir (QROC,
   QZP, TCS) ajouteront leur propre charge utile sans toucher au tronc.
   Figer un schema « cinq propositions » serait a refaire des la
   deuxieme modalite.

   LE RANG N'EST PAS STOCKE ICI. Il se lit a travers l'acquis
   (`outcomes.knowledge_rank`). Le stocker une seconde fois ferait
   qu'une correction de rang au referentiel ne se propagerait pas a la
   banque. C'est pourquoi `outcome_id` est OBLIGATOIRE : sans lui, le
   filtre par rang que Stef a demande le 11/09 n'a aucune assise.

   LE FORMAT DOCIMOLOGIQUE EST CALCULE. Cahier des charges R2C : les
   formats de restitution (QRU, QROC, QRP, QZP) sont de classe A, ceux
   de raisonnement (QRM, QRP longue, TCS) de classe B. C'est une
   consequence du format, jamais une saisie -- d'ou la colonne generee.

   LES PROPOSITIONS NE SONT JAMAIS LISIBLES PAR L'ETUDIANT. Si
   `question_options` etait ouverte en lecture, n'importe qui lirait la
   colonne `correct` depuis PostgREST avant de repondre. L'etudiant
   passe donc par `read_question` (qui rend les propositions SANS la
   reponse) puis `answer_question` (qui rend la correction apres coup).
   Seule l'equipe du programme lit la table en direct.

   LE RETRAIT EN UN CLIC. `set_question_status` permet de sortir une
   question de la circulation sans redeploiement : c'est ce qui borne
   le risque d'une banque non validee medicalement. Une erreur signalee
   le lundi disparait le lundi.
   ================================================================== */

/* ------------------------------------------------------------------
   1. LA QUESTION
   ------------------------------------------------------------------ */

create table public.question_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  outcome_id uuid not null references public.outcomes (id) on delete restrict,
  external_ref text check (length(btrim(external_ref)) between 1 and 80),
  format text not null default 'qrm' check (
    format in ('qrm', 'qru', 'qroc', 'qrp', 'qrp_longue', 'qzp', 'tcs')
  ),
  docimologic_class text generated always as (
    case when format in ('qrm', 'qrp_longue', 'tcs') then 'B' else 'A' end
  ) stored,
  stem text not null check (length(btrim(stem)) between 10 and 4000),
  commentary text,
  chapter integer check (chapter between 1 and 99),
  section_label text,
  status text not null default 'brouillon' check (
    status in ('brouillon', 'publiee', 'signalee', 'en_revue', 'retiree')
  ),
  source text not null default 'banque-cardio-2026',
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, external_ref)
);

comment on table public.question_items is
  'Tronc commun d''une question de la banque : enonce, acquis rattache (obligatoire), format, classe docimologique calculee, statut et version. Le rang ne figure pas ici : il se lit a travers l''acquis.';

comment on column public.question_items.docimologic_class is
  'Calculee, jamais saisie. A = formats de restitution, B = formats de raisonnement (cahier des charges R2C). Le rang B est pondere au double aux EDN ; cette colonne ne dit pas le rang, elle dit le format.';

comment on column public.question_items.status is
  'brouillon -> publiee -> signalee -> en_revue -> corrigee (retour a publiee) ou retiree. Seule une question publiee est servie a un etudiant.';

create index question_items_program_idx
  on public.question_items (program_id, status, chapter);

create index question_items_outcome_idx
  on public.question_items (outcome_id);

create trigger question_items_set_updated_at
before update on public.question_items
for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------
   2. LES PROPOSITIONS

   `flag` porte les notions indispensables et inacceptables du cahier
   des charges : leur non-respect annule la question. L'audit du 11/09
   a rappele qu'une notion dite indispensable dans un cours ne devient
   pas automatiquement eliminatoire dans un QCM -- d'ou la colonne
   `flag_source`, qui oblige a dire d'ou vient le drapeau.
   ------------------------------------------------------------------ */

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question_items (id) on delete cascade,
  position integer not null check (position between 1 and 25),
  letter text not null check (letter ~ '^[A-Y]$'),
  body text not null check (length(btrim(body)) between 1 and 1000),
  correct boolean not null,
  explanation text,
  flag text check (flag in ('indispensable', 'inacceptable')),
  flag_source text,
  unique (question_id, position),
  unique (question_id, letter),
  constraint question_options_flag_documented check (
    flag is null or nullif(btrim(coalesce(flag_source, '')), '') is not null
  )
);

comment on table public.question_options is
  'Propositions d''une question. JAMAIS lisible par un etudiant : la colonne `correct` serait lue depuis PostgREST avant la reponse. Lecture reservee a l''equipe du programme ; l''etudiant passe par read_question puis answer_question.';

comment on column public.question_options.flag_source is
  'D''ou vient le drapeau indispensable/inacceptable. Obligatoire des qu''un drapeau est pose : un drapeau non source est un drapeau invente.';

create index question_options_question_idx
  on public.question_options (question_id, position);

/* ------------------------------------------------------------------
   3. LES TENTATIVES
   ------------------------------------------------------------------ */

create table public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question_items (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  answer jsonb not null,
  count_revealed boolean not null default false,
  discordances integer check (discordances >= 0),
  score numeric(3, 2) not null check (score >= 0 and score <= 1),
  answered_at timestamptz not null default now()
);

comment on table public.question_attempts is
  'Une reponse d''un etudiant a une question. `count_revealed` retient que l''etudiant a demande le nombre de bonnes reponses : l''indice fait basculer la notation en x/n, il n''est jamais gratuit, et il est interdit hors entrainement.';

create index question_attempts_enrollment_idx
  on public.question_attempts (enrollment_id, answered_at desc);

create index question_attempts_question_idx
  on public.question_attempts (question_id);

/* ------------------------------------------------------------------
   4. LES SIGNALEMENTS

   Sans eux, l'avertissement affiche a l'etudiant n'est qu'un paravent.
   Un bouton derriere lequel il n'y a personne est pire que pas de
   bouton : les etudiants cessent de signaler apres trois fois sans
   reponse. Le statut et la resolution existent des maintenant pour que
   le choix de QUI traite les signalements puisse arriver plus tard
   sans nouvelle migration.
   ------------------------------------------------------------------ */

create table public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question_items (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  reported_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (
    reason in ('erreur', 'recommandation', 'ambigu', 'hors_programme', 'autre')
  ),
  message text check (length(btrim(message)) <= 2000),
  status text not null default 'nouveau' check (
    status in ('nouveau', 'en_revue', 'corrige', 'confirme', 'rejete')
  ),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  resolution text,
  created_at timestamptz not null default now()
);

comment on table public.question_reports is
  'Signalement d''une question par un etudiant. reason = erreur (la reponse est fausse), recommandation (divergence avec une reco plus recente que le referentiel), ambigu, hors_programme, autre. Les deux premieres valeurs recouvrent les deux risques annonces dans l''avertissement affiche.';

create index question_reports_open_idx
  on public.question_reports (program_id, status, created_at desc);

create index question_reports_question_idx
  on public.question_reports (question_id);

/* ------------------------------------------------------------------
   5. DROITS — verrouillage total, puis reouverture ciblee
   ------------------------------------------------------------------ */

alter table public.question_items enable row level security;
alter table public.question_options enable row level security;
alter table public.question_attempts enable row level security;
alter table public.question_reports enable row level security;

revoke all on public.question_items from public, anon, authenticated;
revoke all on public.question_options from public, anon, authenticated;
revoke all on public.question_attempts from public, anon, authenticated;
revoke all on public.question_reports from public, anon, authenticated;

grant select on public.question_items to authenticated;
grant select on public.question_options to authenticated;
grant select on public.question_attempts to authenticated;
grant select on public.question_reports to authenticated;

/* L'etudiant inscrit ne voit que les questions PUBLIEES. L'equipe voit tout. */
create policy question_items_select on public.question_items
for select to authenticated
using (
  public.is_program_staff(program_id)
  or (status = 'publiee' and public.is_enrolled_in_program(program_id))
);

/* Les propositions : l'equipe seule. Voir l'en-tete de cette migration. */
create policy question_options_select on public.question_options
for select to authenticated
using (
  exists (
    select 1 from public.question_items q
    where q.id = question_options.question_id
      and public.is_program_staff(q.program_id)
  )
);

create policy question_attempts_select on public.question_attempts
for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.id = question_attempts.enrollment_id and e.person_id = auth.uid()
  )
  or public.supervises_enrollment(question_attempts.enrollment_id)
);

create policy question_reports_select on public.question_reports
for select to authenticated
using (
  reported_by = auth.uid() or public.is_program_staff(program_id)
);

/* ------------------------------------------------------------------
   6. LIRE UNE QUESTION SANS SA REPONSE

   Rend l'enonce et les propositions dans l'ordre, SANS `correct`, SANS
   `explanation` et SANS les drapeaux. `revealed_count` n'est renseigne
   que si l'etudiant a demande l'indice ; il vaut null sinon, et le
   nombre de bonnes reponses reste hors de portee.
   ------------------------------------------------------------------ */

create or replace function public.read_question(
  p_question_id uuid,
  p_reveal_count boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q public.question_items;
  v_options jsonb;
  v_count integer;
begin
  select * into v_q from public.question_items where id = p_question_id;

  if v_q.id is null then
    raise exception 'Question introuvable.';
  end if;

  if not (
    public.is_program_staff(v_q.program_id)
    or (v_q.status = 'publiee' and public.is_enrolled_in_program(v_q.program_id))
  ) then
    raise exception 'Cette question n''est pas accessible.';
  end if;

  select jsonb_agg(
           jsonb_build_object('letter', o.letter, 'position', o.position, 'body', o.body)
           order by o.position
         ),
         count(*) filter (where o.correct)
    into v_options, v_count
  from public.question_options o
  where o.question_id = p_question_id;

  return jsonb_build_object(
    'id', v_q.id,
    'format', v_q.format,
    'docimologic_class', v_q.docimologic_class,
    'stem', v_q.stem,
    'outcome_id', v_q.outcome_id,
    'chapter', v_q.chapter,
    'status', v_q.status,
    'options', coalesce(v_options, '[]'::jsonb),
    'revealed_count', case when p_reveal_count then v_count else null end
  );
end;
$$;

comment on function public.read_question is
  'RPC SECURITY DEFINER : rend une question et ses propositions SANS la reponse. p_reveal_count rend le nombre de bonnes reponses -- c''est l''indice, qui fait ensuite basculer la notation en x/n dans answer_question.';

revoke all on function public.read_question(uuid, boolean) from public, anon;
grant execute on function public.read_question(uuid, boolean) to authenticated;

/* ------------------------------------------------------------------
   7. REPONDRE — le bareme officiel des EDN

   Cahier des charges R2C : 0 discordance = 1 point, 1 = 0,5, 2 = 0,2,
   3 ou plus = 0. Une discordance est une proposition cochee a tort OU
   oubliee a tort. Un drapeau non respecte annule la question.

   Deux ecarts assumes et decides avec Stef :
   -- une question a UNE SEULE bonne reponse est notee en binaire :
      c'est une QRU, et il n'y a pas de format a creer pour cela ;
   -- si l'etudiant a demande le nombre de bonnes reponses, la notation
      passe en x/n comme une QRP. L'indice se paie.
   ------------------------------------------------------------------ */

create or replace function public.answer_question(
  p_question_id uuid,
  p_enrollment_id uuid,
  p_selected text[],
  p_count_revealed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_q public.question_items;
  v_selected text[] := coalesce(p_selected, array[]::text[]);
  v_total_correct integer;
  v_hit integer;
  v_discordances integer;
  v_broken integer;
  v_score numeric(3, 2);
begin
  if not public.owns_enrollment(p_enrollment_id) then
    raise exception 'Seul l''etudiant inscrit peut repondre sur son inscription.';
  end if;

  select * into v_q from public.question_items where id = p_question_id;

  if v_q.id is null or v_q.status <> 'publiee' then
    raise exception 'Cette question n''est pas ouverte aux reponses.';
  end if;

  select count(*) filter (where o.correct),
         count(*) filter (where o.correct and o.letter = any (v_selected)),
         count(*) filter (where o.correct <> (o.letter = any (v_selected))),
         count(*) filter (
           where (o.flag = 'inacceptable' and o.letter = any (v_selected))
              or (o.flag = 'indispensable' and o.correct and not (o.letter = any (v_selected)))
         )
    into v_total_correct, v_hit, v_discordances, v_broken
  from public.question_options o
  where o.question_id = p_question_id;

  if v_total_correct is null or v_total_correct = 0 then
    raise exception 'Question sans reponse exacte : elle ne peut pas etre notee.';
  end if;

  if v_broken > 0 then
    v_score := 0;
  elsif p_count_revealed then
    v_score := round(v_hit::numeric / v_total_correct::numeric, 2);
  elsif v_total_correct = 1 then
    v_score := case when v_discordances = 0 then 1 else 0 end;
  else
    v_score := case v_discordances
                 when 0 then 1
                 when 1 then 0.5
                 when 2 then 0.2
                 else 0
               end;
  end if;

  insert into public.question_attempts
    (question_id, enrollment_id, program_id, answer, count_revealed, discordances, score)
  values
    (p_question_id, p_enrollment_id, v_q.program_id,
     to_jsonb(v_selected), p_count_revealed, v_discordances, v_score);

  return jsonb_build_object(
    'score', v_score,
    'discordances', v_discordances,
    'eliminatory', v_broken > 0,
    'options', (
      select jsonb_agg(
               jsonb_build_object(
                 'letter', o.letter, 'correct', o.correct,
                 'explanation', o.explanation, 'flag', o.flag
               ) order by o.position
             )
      from public.question_options o
      where o.question_id = p_question_id
    )
  );
end;
$$;

comment on function public.answer_question is
  'RPC SECURITY DEFINER : enregistre la reponse et rend la correction. Bareme EDN par discordances (1 / 0,5 / 0,2 / 0), binaire si une seule bonne reponse, x/n si le nombre a ete revele, 0 si un drapeau est enfreint.';

revoke all on function public.answer_question(uuid, uuid, text[], boolean) from public, anon;
grant execute on function public.answer_question(uuid, uuid, text[], boolean) to authenticated;

/* ------------------------------------------------------------------
   8. SIGNALER — et traiter

   `report_question` bascule la question en 'signalee' si elle etait
   publiee : l'etat de la banque dit tout de suite ce qui est conteste,
   sans attendre que quelqu'un ouvre la file.
   ------------------------------------------------------------------ */

create or replace function public.report_question(
  p_question_id uuid,
  p_reason text,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_q public.question_items;
  v_report_id uuid;
begin
  select * into v_q from public.question_items where id = p_question_id;

  if v_q.id is null then
    raise exception 'Question introuvable.';
  end if;

  if not (public.is_program_staff(v_q.program_id)
          or public.is_enrolled_in_program(v_q.program_id)) then
    raise exception 'Signalement reserve aux membres du programme.';
  end if;

  insert into public.question_reports
    (question_id, program_id, reported_by, reason, message)
  values
    (p_question_id, v_q.program_id, auth.uid(), p_reason,
     nullif(btrim(coalesce(p_message, '')), ''))
  returning id into v_report_id;

  if v_q.status = 'publiee' then
    update public.question_items set status = 'signalee' where id = p_question_id;
  end if;

  return v_report_id;
end;
$$;

comment on function public.report_question is
  'RPC SECURITY DEFINER : un membre du programme signale une question. La question publiee passe aussitot en statut signalee -- l''etat de la banque dit ce qui est conteste sans attendre qu''on ouvre la file.';

revoke all on function public.report_question(uuid, text, text) from public, anon;
grant execute on function public.report_question(uuid, text, text) to authenticated;

/* Le retrait en un clic, et son retour. Reserve a l'administration. */
create or replace function public.set_question_status(
  p_question_id uuid,
  p_status text
)
returns public.question_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_q public.question_items;
begin
  select * into v_q from public.question_items where id = p_question_id;

  if v_q.id is null then
    raise exception 'Question introuvable.';
  end if;

  if not public.can_administer_program(v_q.program_id) then
    raise exception 'Droits insuffisants pour changer le statut d''une question.';
  end if;

  update public.question_items
  set status = p_status,
      version = case when p_status = 'publiee' and v_q.status <> 'publiee'
                     then version + 1 else version end
  where id = p_question_id
  returning * into v_q;

  return v_q;
end;
$$;

comment on function public.set_question_status is
  'RPC SECURITY DEFINER : sort une question de la circulation, ou l''y remet, sans redeploiement. C''est ce qui borne le risque d''une banque non validee medicalement : une erreur signalee le lundi disparait le lundi.';

revoke all on function public.set_question_status(uuid, text) from public, anon;
grant execute on function public.set_question_status(uuid, text) to authenticated;

create or replace function public.resolve_question_report(
  p_report_id uuid,
  p_status text,
  p_resolution text default null
)
returns public.question_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_r public.question_reports;
begin
  select * into v_r from public.question_reports where id = p_report_id;

  if v_r.id is null then
    raise exception 'Signalement introuvable.';
  end if;

  if not public.can_administer_program(v_r.program_id) then
    raise exception 'Droits insuffisants pour traiter un signalement.';
  end if;

  update public.question_reports
  set status = p_status,
      resolution = nullif(btrim(coalesce(p_resolution, '')), ''),
      handled_by = auth.uid(),
      handled_at = now()
  where id = p_report_id
  returning * into v_r;

  return v_r;
end;
$$;

comment on function public.resolve_question_report is
  'RPC SECURITY DEFINER : traite un signalement. Le statut de la QUESTION reste un geste separe (set_question_status) : corriger un signalement ne republie jamais une question par effet de bord.';

revoke all on function public.resolve_question_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_question_report(uuid, text, text) to authenticated;
