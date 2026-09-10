-- FAIRE QU UNE PERSONNE DU VIVIER PUISSE DEVENIR UN ENCADRANT.
--
-- CONSTAT MESURE LE 10/09, apres la premiere synchronisation UMCV (14 membres
-- lus, 6 encadrants ajoutes au vivier) : `handle_people_activation` (24/08) ne
-- sait poser qu un role `learner`, et seulement si la personne porte un
-- `intended_cohort_id`. Les 6 encadrants du 4O activeraient donc leur compte
-- SANS AUCUN ROLE -- ni encadrant, ni rien. C est le meme blocage que celui
-- mesure le matin meme : personne ne porte `placement_supervisor`.
--
-- CETTE MIGRATION N INVITE PERSONNE ET NE CREE AUCUN COMPTE. Elle rend
-- seulement l activation capable de fabriquer un encadrant :
--   1. le vivier porte desormais une INTENTION DE ROLE ;
--   2. la synchronisation la renseigne ;
--   3. le declencheur d activation l honore.

/* ================================================================== */
/* 1. L intention de role dans le vivier                               */
/* ================================================================== */

alter table public.people
  add column if not exists intended_role public.role_name,
  add column if not exists intended_placement_id uuid;

-- Meme motif que `people_cohort_same_program` (24/08) : un terrain de stage
-- appartenant a un AUTRE programme n a rien a faire ici. La contrainte porte
-- sur le couple, donc elle garantit la coherence sans qu aucun appelant ait a
-- y penser. Suppression volontairement NON cascadee : supprimer un terrain sur
-- lequel des personnes sont attendues doit echouer bruyamment, pas vider une
-- colonne en silence.
alter table public.people
  add constraint people_intended_placement_same_program
  foreign key (intended_placement_id, program_id)
  references public.placements (id, program_id);

-- Une intention est soit apprenant (et alors elle vise une promotion), soit
-- encadrant (et alors elle vise un terrain). `null` = ancien comportement,
-- pour ne rien casser des lignes deja en base.
alter table public.people
  add constraint people_intended_role_shape check (
    intended_role is null
    or (intended_role = 'learner' and intended_cohort_id is not null)
    or (intended_role = 'placement_supervisor' and intended_placement_id is not null)
  );

/* ================================================================== */
/* 2. L activation honore l intention                                  */
/* ================================================================== */

create or replace function public.handle_people_activation()
returns trigger
language plpgsql security definer
set search_path to 'public', 'auth', 'pg_temp' as $function$
declare
  activated_email text;
  matched record;
begin
  select lower(btrim(email)) into activated_email
  from auth.users
  where id = new.id;

  if activated_email is null then
    return new;
  end if;

  for matched in
    select id, program_id, intended_cohort_id, intended_role,
           intended_placement_id, origin, created_by
    from public.people
    where login_email = activated_email
      and status = 'invited'
      and activated_profile_id is null
  loop
    update public.people
    set status = 'activated',
        activated_profile_id = new.id
    where id = matched.id;

    -- VOIE APPRENANT -- inchangee. `coalesce` parce que les lignes creees
    -- avant cette migration ne portent pas d intention explicite et etaient,
    -- par construction, des apprenants.
    if matched.intended_cohort_id is not null
       and coalesce(matched.intended_role, 'learner') = 'learner' then
      insert into public.enrollments (person_id, program_id, cohort_id, status, created_at, updated_at)
      values (new.id, matched.program_id, matched.intended_cohort_id, 'active', now(), now())
      on conflict do nothing;

      insert into public.role_assignments (
        person_id, role, scope_kind, scope_id, program_id, granted_by
      )
      values (
        new.id, 'learner', 'cohort', matched.intended_cohort_id, matched.program_id, matched.created_by
      )
      on conflict do nothing;
    end if;

    -- VOIE ENCADRANT -- nouvelle. Le role est porte par le TERRAIN, jamais par
    -- la promotion : `placement_supervisor_scope` (21/08) l impose deja.
    if matched.intended_role = 'placement_supervisor'
       and matched.intended_placement_id is not null then
      insert into public.role_assignments (
        person_id, role, scope_kind, scope_id, program_id, granted_by
      )
      values (
        new.id, 'placement_supervisor', 'placement',
        matched.intended_placement_id, matched.program_id, matched.created_by
      )
      on conflict do nothing;

      -- LE CONTINUUM (decision de Stef, 10/09) : tous les CCA et assistants du
      -- service encadrent TOUS les groupes du terrain, sans chercher qui est
      -- affecte au 4O telle semaine. Un encadrant qui change de secteur en
      -- cours de stage ne coupe pas le suivi de ses etudiants, et son
      -- remplacant prend le relais sans geste d administration.
      insert into public.supervision_group_supervisors (group_id, person_id)
      select g.id, new.id
      from public.supervision_groups g
      where g.placement_id = matched.intended_placement_id
      on conflict do nothing;
    end if;
  end loop;

  return new;
end;
$function$;

/* ================================================================== */
/* 3. La synchronisation pose l intention                              */
/* ================================================================== */

create or replace function public.apply_encadrement_sync(
  p_source_id uuid,
  p_members jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program_id uuid;
  v_ajoutes jsonb := '[]'::jsonb;
  v_rapprochements jsonb := '[]'::jsonb;
  v_inchanges jsonb := '[]'::jsonb;
  v_absents jsonb := '[]'::jsonb;
  v_membre jsonb;
  v_email text;
  v_prenom text;
  v_nom text;
  v_people_id uuid;
  v_homonyme uuid;
  v_emails text[] := '{}';
  v_placement_id uuid;
begin
  select s.program_id, s.placement_id into v_program_id, v_placement_id
  from public.encadrement_sources s where s.id = p_source_id;

  if v_program_id is null then
    raise exception 'Source introuvable.';
  end if;
  if not public.can_administer_program(v_program_id) then
    raise exception 'Droits insuffisants sur ce programme.';
  end if;
  if jsonb_typeof(p_members) <> 'array' then
    raise exception 'La reponse de la source n''est pas une liste de membres.';
  end if;

  for v_membre in select * from jsonb_array_elements(p_members)
  loop
    /*
     * SEULS LES ENCADRANTS ENTRENT. Les internes arrivent avec
     * `encadrant: false` : Stef les laisse de cote pour l instant, et une ligne
     * `people` creee « au cas ou » serait une invitation en attente que
     * personne n a decidee.
     */
    continue when coalesce((v_membre->>'encadrant')::boolean, false) is not true;

    v_email := lower(btrim(coalesce(v_membre->>'email', '')));
    v_prenom := btrim(coalesce(v_membre->>'prenom', ''));
    v_nom := btrim(coalesce(v_membre->>'nom', ''));

    -- Une ligne sans adresse ne peut pas entrer : `login_email` est la cle.
    -- On la rapporte plutot que de la perdre en silence.
    if v_email = '' or v_prenom = '' or v_nom = '' then
      v_rapprochements := v_rapprochements || jsonb_build_object(
        'raison', 'incomplet', 'prenom', v_prenom, 'nom', v_nom, 'email', v_email);
      continue;
    end if;

    v_emails := v_emails || v_email;

    select p.id into v_people_id
    from public.people p
    where p.program_id = v_program_id and p.login_email = v_email;

    if v_people_id is not null then
      /*
       * DEJA CONNUE PAR SON ADRESSE. On rafraichit le nom -- un mariage, une
       * faute de frappe corrigee en amont -- mais on NE TOUCHE NI au statut ni
       * a `origin` : une personne saisie a la main puis retrouvee dans la
       * source reste une personne saisie a la main, et une invitation deja
       * partie ne redevient pas « en attente ».
       */
      update public.people
         set first_name = v_prenom, last_name = v_nom, updated_at = now()
       where id = v_people_id
         and (first_name <> v_prenom or last_name <> v_nom);
      v_inchanges := v_inchanges || jsonb_build_object(
        'id', v_people_id, 'prenom', v_prenom, 'nom', v_nom, 'email', v_email);
      continue;
    end if;

    /*
     * ADRESSE INCONNUE : ce nom existe-t-il deja sous une AUTRE adresse ?
     * Comparaison sur `lower(btrim())` seulement -- pas d'`unaccent`, qui n'est
     * pas garanti present et rapprocherait « Rene » de « René » sans le dire.
     */
    select p.id into v_homonyme
    from public.people p
    where p.program_id = v_program_id
      and lower(btrim(p.first_name)) = lower(v_prenom)
      and lower(btrim(p.last_name)) = lower(v_nom)
    limit 1;

    if v_homonyme is not null then
      v_rapprochements := v_rapprochements || jsonb_build_object(
        'raison', 'homonyme', 'people_id', v_homonyme,
        'prenom', v_prenom, 'nom', v_nom, 'email', v_email);
      continue;
    end if;

    -- L INTENTION DE ROLE, posee des le vivier : une personne rapportee par la
    -- source d equipe est un encadrant du terrain de cette source. Sans elle,
    -- l activation du compte ne saurait rien accorder (cf. le declencheur
    -- ci-dessus). Toujours PAS de compte et PAS de role ici : seulement
    -- l intention, qui ne prendra effet qu a l activation.
    insert into public.people
      (program_id, first_name, last_name, login_email, origin, status, created_by,
       intended_role, intended_placement_id)
    values (v_program_id, v_prenom, v_nom, v_email, 'sync', 'pending', auth.uid(),
            'placement_supervisor', v_placement_id)
    returning id into v_people_id;

    v_ajoutes := v_ajoutes || jsonb_build_object(
      'id', v_people_id, 'prenom', v_prenom, 'nom', v_nom, 'email', v_email);
  end loop;

  /*
   * LES ABSENTS : issus d une synchronisation precedente et plus rendus par la
   * source. RAPPORTES SEULEMENT. On ne regarde que `origin = 'sync'` : une
   * personne saisie a la main n a jamais dependu de cette source et n a pas a
   * disparaitre parce qu une API ne la connait pas.
   */
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'prenom', p.first_name, 'nom', p.last_name,
           'email', p.login_email, 'statut', p.status)), '[]'::jsonb)
    into v_absents
  from public.people p
  where p.program_id = v_program_id
    and p.origin = 'sync'
    and p.status <> 'cancelled'
    and not (p.login_email = any (v_emails));

  return jsonb_build_object(
    'membres_lus', jsonb_array_length(p_members),
    'ajoutes', v_ajoutes,
    'inchanges', v_inchanges,
    'a_rapprocher', v_rapprochements,
    'absents', v_absents
  );
end;
$$;

revoke all on function public.apply_encadrement_sync(uuid, jsonb) from public, anon;
grant execute on function public.apply_encadrement_sync(uuid, jsonb) to authenticated;

/* ================================================================== */
/* 4. Rattraper les lignes deja synchronisees                          */
/* ================================================================== */

-- Les 6 encadrants du 4O ont ete inseres AVANT cette migration : ils ne
-- portent aucune intention, et une nouvelle synchronisation ne les
-- retoucherait pas (ils y seraient « inchanges »). On les rattrape ici.
-- `distinct on` : si un programme portait un jour plusieurs sources, on prend
-- la plus ancienne plutot que d ecrire au hasard -- et le cas ne se pose pas
-- aujourd hui, il n existe qu une source.
update public.people p
set intended_role = 'placement_supervisor',
    intended_placement_id = v.placement_id,
    updated_at = now()
from (
  select distinct on (program_id) program_id, placement_id
  from public.encadrement_sources
  order by program_id, created_at
) v
where v.program_id = p.program_id
  and p.origin = 'sync'
  and p.intended_role is null
  and p.status <> 'cancelled';
