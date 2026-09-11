/*
 * L'EQUIPE D'ENCADREMENT PASSE AU RESPONSABLE DE STAGE (11/09).
 *
 * CE QUI CHANGE, ET POUR QUI. Brancher la source d'equipe d'un service et
 * appliquer sa synchronisation etaient reserves a `can_administer_program`.
 * Decision de Stef le 11/09 : c'est le RESPONSABLE DE STAGE qui tient l'equipe
 * de son terrain -- il sait qui encadre, l'administrateur du programme ne le
 * sait pas. L'ENCADRANT, lui, reste dehors : injecter des personnes dans le
 * vivier d'un programme est un geste de gouvernance, pas un geste de terrain.
 *
 * UNE FONCTION PLUTOT QUE QUATRE COPIES. Le droit etait ecrit quatre fois --
 * deux policies, deux fonctions. Une regle repetee quatre fois se corrige
 * trois fois et demie : `can_manage_encadrement` la porte une seule fois.
 *
 * ⚠️ CE N'EST PAS `is_program_staff`, ET IL NE FAUT PAS L'Y FONDRE. Cette
 * derniere couvre aussi l'enseignant et l'encadrant, qui n'ont rien a faire
 * ici ; le commentaire d'origine du 10/09 le disait deja pour l'encadrant, et
 * il reste vrai. On elargit d'UN ROLE NOMME, pas d'une categorie.
 *
 * ⚠️ LE JETON RESTE ILLISIBLE POUR TOUS : `resolve_encadrement_source` demeure
 * revoquee jusqu'a `authenticated` comprise. Le responsable de stage peut
 * poser un jeton, jamais le relire.
 *
 * ⚠️ LE CORPS DES DEUX FONCTIONS EST REPRIS MOT POUR MOT de leurs migrations
 * d'origine (20260910160000 et 20260910180000) : SEULE la ligne de garde
 * change. Les reecrire de memoire aurait ete le vrai risque de cette
 * migration -- elles manipulent le coffre et le vivier.
 */

create or replace function public.can_manage_encadrement(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $can_manage$
  select public.can_administer_program(p_program_id) or exists (
    select 1 from public.role_assignments ra
    where ra.person_id = auth.uid()
      and ra.program_id = p_program_id
      and ra.role = 'placement_manager'
      and ra.revoked_at is null
  );
$can_manage$;

revoke all on function public.can_manage_encadrement(uuid) from public, anon;
grant execute on function public.can_manage_encadrement(uuid) to authenticated;

drop policy if exists encadrement_sources_select on public.encadrement_sources;
create policy encadrement_sources_select on public.encadrement_sources
for select to authenticated
using (public.can_manage_encadrement(program_id));

drop policy if exists encadrement_sync_runs_select on public.encadrement_sync_runs;
create policy encadrement_sync_runs_select on public.encadrement_sync_runs
for select to authenticated
using (
  exists (
    select 1 from public.encadrement_sources s
    where s.id = encadrement_sync_runs.source_id
      and public.can_manage_encadrement(s.program_id)
  )
);

create or replace function public.set_encadrement_source(
  p_program_id uuid,
  p_placement_id uuid,
  p_label text,
  p_endpoint_url text,
  p_token text
) returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing_id uuid;
  v_existing_secret uuid;
  v_secret_id uuid;
  v_url text;
begin
  if not public.can_manage_encadrement(p_program_id) then
    raise exception 'Droits insuffisants sur ce programme.';
  end if;
  if p_token is null or length(btrim(p_token)) < 8 then
    raise exception 'Jeton absent ou trop court.';
  end if;
  if p_endpoint_url is null or p_endpoint_url not like 'https://%' then
    raise exception 'L''adresse doit commencer par https://.';
  end if;

  /*
   * ON ACCEPTE L URL COMPLETE ET ON EN RETIRE LE JETON.
   *
   * L ecran laisse coller « l URL complete ou juste le jeton » : la forme la
   * plus naturelle est donc justement celle qui contient le secret. On coupe le
   * dernier segment s il EST le jeton, puis on refuse tout ce qui le contient
   * encore. Se contenter de documenter « mettez l URL de base » aurait produit
   * un jour une ligne avec le jeton dedans, et personne ne l aurait vue.
   */
  v_url := btrim(p_endpoint_url);
  v_url := regexp_replace(v_url, '/+$', '');
  if right(v_url, length(btrim(p_token)) + 1) = '/' || btrim(p_token) then
    v_url := left(v_url, length(v_url) - length(btrim(p_token)) - 1);
  end if;
  if position(btrim(p_token) in v_url) > 0 then
    raise exception 'L''adresse ne doit pas contenir le jeton.';
  end if;

  select s.id, s.secret_id into v_existing_id, v_existing_secret
  from public.encadrement_sources s
  where s.program_id = p_program_id and s.label = btrim(p_label);

  if v_existing_secret is null then
    v_secret_id := vault.create_secret(
      btrim(p_token),
      'encadrement_source:' || p_program_id::text || ':' || btrim(p_label),
      'Jeton d acces a une source d equipe d encadrement'
    );
  else
    perform vault.update_secret(v_existing_secret, btrim(p_token));
    v_secret_id := v_existing_secret;
  end if;

  if v_existing_id is null then
    insert into public.encadrement_sources
      (program_id, placement_id, label, endpoint_url, secret_id, token_hint, created_by)
    values (p_program_id, p_placement_id, btrim(p_label), v_url,
            v_secret_id, right(btrim(p_token), 4), auth.uid())
    returning id into v_existing_id;
  else
    update public.encadrement_sources
       set placement_id = p_placement_id,
           endpoint_url = v_url,
           secret_id = v_secret_id,
           token_hint = right(btrim(p_token), 4),
           updated_at = now()
     where id = v_existing_id;
  end if;

  return v_existing_id;
end;
$$;

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
begin
  select s.program_id into v_program_id
  from public.encadrement_sources s where s.id = p_source_id;

  if v_program_id is null then
    raise exception 'Source introuvable.';
  end if;
  if not public.can_manage_encadrement(v_program_id) then
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

    insert into public.people
      (program_id, first_name, last_name, login_email, origin, status, created_by)
    values (v_program_id, v_prenom, v_nom, v_email, 'sync', 'pending', auth.uid())
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
