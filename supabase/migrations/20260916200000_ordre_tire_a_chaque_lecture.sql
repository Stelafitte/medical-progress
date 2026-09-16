-- L'ORDRE DES PROPOSITIONS EST TIRE A CHAQUE LECTURE (16/09, arbitrage de Stef).
--
-- CE QUE CELA CHANGE par rapport a 20260916160000, pose ce matin. L'ordre y
-- etait STABLE par (question, inscription) : le meme etudiant retrouvait son
-- ordre en rechargeant, son voisin en avait un autre. Cela repondait a un seul
-- des deux arguments du 15/09 (§ 9.7). Stef tranche pour l'autre : « tirage a
-- chaque lecture souhaite » -- une question REJOUEE ne doit pas remontrer le
-- meme ordre, pour qu'on retienne le contenu d'une proposition et non sa place.
--
-- CONSEQUENCE ASSUMEE : recharger la page en cours de question redistribue les
-- propositions. C'est le prix du tirage a chaque lecture, et il est sans effet
-- sur la note : la vraie lettre de chaque proposition voyage avec elle, c'est
-- elle que le client renvoie a answer_question, et les lettres A, B, C ne sont
-- reattribuees qu'a l'AFFICHAGE.
--
-- LES DEUX FONCTIONS DEVIENNENT VOLATILE. `random()` est volatile ; une
-- fonction declaree stable peut voir son resultat reutilise dans la meme
-- requete, et le tirage ne serait plus tire. La declaration dit maintenant ce
-- que la fonction fait vraiment.
--
-- SANS INSCRIPTION (relecture par l'equipe), l'ordre du fichier est conserve :
-- c'est celui qu'on corrige.

-- 1. La question ---------------------------------------------------------------
create or replace function public.read_question(
  p_question_id uuid,
  p_reveal_count boolean default false,
  p_enrollment_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_q public.question_items;
  v_options jsonb;
  v_count integer;
  v_melange boolean;
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

  -- On ne melange que pour l'etudiant qui joue, et seulement si l'inscription
  -- est bien la sienne : personne ne decide de l'ordre d'un autre.
  select exists (
    select 1 from public.enrollments e
     where e.id = p_enrollment_id and e.person_id = auth.uid()
  ) into v_melange;

  select jsonb_agg(
           jsonb_build_object('letter', o.letter, 'position', o.position, 'body', o.body)
           order by case when v_melange then random() else o.position::float8 end
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
  'RPC SECURITY DEFINER : rend une question et ses propositions SANS la reponse. p_reveal_count rend le nombre de bonnes reponses. p_enrollment_id (l''inscription de l''appelant) fait TIRER l''ordre des propositions a chaque lecture ; nul ou etranger = ordre du fichier.';
revoke all on function public.read_question(uuid, boolean, uuid) from public, anon;
grant execute on function public.read_question(uuid, boolean, uuid) to authenticated;

-- 2. L'etape d'un dossier --------------------------------------------------------
create or replace function public.read_case(p_case_id uuid, p_enrollment_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_melange boolean;
  v_resultat jsonb;
begin
  select exists (
    select 1 from public.enrollments e
     where e.id = p_enrollment_id and e.person_id = auth.uid()
  ) into v_melange;

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
                            order by case when v_melange then random() else o.position::float8 end),
                          '[]'::jsonb)
                     from public.question_options o where o.question_id = q.id
                 )
               ) order by q.case_position), '[]'::jsonb)
               from public.question_items q
              where q.case_id = c.id and q.status = 'publiee'
           )
         )
    into v_resultat
    from public.question_cases c
   where c.id = p_case_id
     and (public.is_program_staff(c.program_id)
          or (c.status = 'publiee' and public.is_enrolled_in_program(c.program_id)));

  return v_resultat;
end;
$$;
revoke all on function public.read_case(uuid, uuid) from public, anon;
grant execute on function public.read_case(uuid, uuid) to authenticated;
