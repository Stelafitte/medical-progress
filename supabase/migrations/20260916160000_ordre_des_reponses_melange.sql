-- L'ORDRE DES PROPOSITIONS EST MELANGE A LA LECTURE (16/09).
--
-- LA MESURE D'ABORD (15/09, § 9.7 du journal). L'hypothese de depart etait
-- fausse : sur les 1493 QRM, les bonnes reponses sont deja reparties (A 20 %,
-- B 20 %, C 20 %, D 20 %, E 21 %) et « cocher toujours ABC » rend 19,3 %, pas
-- la moyenne. Le melange NE CORRIGE DONC PAS un biais de position -- il n'y en
-- a pas. Il repond a l'autre argument, celui qui reste : deux etudiants cote a
-- cote voient aujourd'hui exactement le meme ecran.
--
-- LE CHOIX (Stef, § 9.7) : melanger A LA LECTURE, jamais a l'import -- ce
-- serait un ordre fige de plus -- et de facon STABLE par (question,
-- inscription). Stable veut dire : le meme etudiant retrouve son ordre s'il
-- recharge la page ou revient sur la question ; son voisin en a un autre.
-- L'ordre vient de md5(identifiant d'option || identifiant d'inscription) :
-- rien n'est tire au hasard a chaque appel, rien n'est stocke.
--
-- LES LETTRES A, B, C SONT REATTRIBUEES A L'AFFICHAGE, cote client : la base
-- continue de rendre la vraie lettre de chaque proposition, et c'est elle que
-- le client renvoie a answer_question. Le bareme, les explications et les
-- signalements ne changent pas d'un octet.
--
-- SANS INSCRIPTION (equipe pedagogique en relecture), l'ordre d'origine est
-- conserve : c'est celui du fichier, celui qu'on corrige.

-- 1. La question ---------------------------------------------------------------
drop function if exists public.read_question(uuid, boolean);
create or replace function public.read_question(
  p_question_id uuid,
  p_reveal_count boolean default false,
  p_enrollment_id uuid default null
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
  v_graine text;
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

  -- La graine n'est retenue que si l'inscription est bien celle de l'appelant :
  -- personne ne choisit l'ordre d'un autre.
  select e.id::text into v_graine
    from public.enrollments e
   where e.id = p_enrollment_id and e.person_id = auth.uid();

  select jsonb_agg(
           jsonb_build_object('letter', o.letter, 'position', o.position, 'body', o.body)
           order by case when v_graine is null then lpad(o.position::text, 4, '0')
                         else md5(o.id::text || v_graine) end
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
  'RPC SECURITY DEFINER : rend une question et ses propositions SANS la reponse. p_reveal_count rend le nombre de bonnes reponses. p_enrollment_id melange l''ordre des propositions, stable par (question, inscription) ; nul = ordre du fichier.';
revoke all on function public.read_question(uuid, boolean, uuid) from public, anon;
grant execute on function public.read_question(uuid, boolean, uuid) to authenticated;

-- 2. L'etape d'un dossier --------------------------------------------------------
drop function if exists public.read_case(uuid);
create or replace function public.read_case(p_case_id uuid, p_enrollment_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with graine as (
    select e.id::text as valeur
      from public.enrollments e
     where e.id = p_enrollment_id and e.person_id = auth.uid()
  )
  select jsonb_build_object(
           'id', c.id, 'external_ref', c.external_ref, 'kind', c.kind, 'title', c.title,
           'vignette', c.vignette, 'chapter', c.chapter, 'chapter_title', c.chapter_title,
           'item_code', c.item_code,
           'steps', (
             select coalesce(jsonb_agg(
               jsonb_build_object(
                 'id', q.id, 'position', q.case_position, 'format', q.format,
                 'reveal', q.reveal, 'stem', q.stem, 'expected', q.expected,
                 'options', (
                   select coalesce(jsonb_agg(
                            jsonb_build_object('letter', o.letter, 'body', o.body)
                            order by case when (select valeur from graine) is null
                                          then lpad(o.position::text, 4, '0')
                                          else md5(o.id::text || (select valeur from graine)) end),
                          '[]'::jsonb)
                     from public.question_options o where o.question_id = q.id
                 )
               ) order by q.case_position), '[]'::jsonb)
               from public.question_items q
              where q.case_id = c.id and q.status = 'publiee'
           )
         )
    from public.question_cases c
   where c.id = p_case_id
     and (public.is_program_staff(c.program_id)
          or (c.status = 'publiee' and public.is_enrolled_in_program(c.program_id)));
$$;
revoke all on function public.read_case(uuid, uuid) from public, anon;
grant execute on function public.read_case(uuid, uuid) to authenticated;
