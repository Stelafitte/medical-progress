-- APPLIQUER UNE SYNCHRONISATION D EQUIPE D ENCADREMENT.
--
-- LA LOGIQUE EST ICI, PAS DANS LA FONCTION EDGE. Celle-ci ne fait que le
-- reseau : appeler UMCV, lire la reponse. Tout ce qui DECIDE -- rapprocher,
-- inserer, proposer -- vit en SQL, pour trois raisons : c est eprouvable au
-- banc d essai avant d etre execute, c est atomique, et une fonction edge se
-- redeploie a la main depuis un tableau de bord alors qu une fonction SQL suit
-- les migrations.
--
-- ⚠️ ELLE N ECRIT QUE DANS LE VIVIER. Elle ne cree aucun compte -- `auth.users`
-- ne se fabrique pas depuis une fonction applicative -- et elle n accorde aucun
-- role. Elle remplit `people` (statut `pending`), et l invitation reste un
-- geste humain.
--
-- ⚠️ ELLE NE RETIRE PERSONNE. Les absents sont RAPPORTES, jamais revoques
-- (decision de Stef) : un encadrant qui quitte le service a valide des carnets
-- et repondu dans des fils, et une date changee dans une AUTRE application ne
-- doit pas pouvoir couper quelqu un en plein stage.
--
-- ⚠️ ET ELLE NE RAPPROCHE JAMAIS SUR LE NOM TOUTE SEULE (decision de Stef).
-- L adresse est la seule cle sure. Quand un nom connu revient avec une adresse
-- inconnue, on le SIGNALE -- « est-ce la meme personne ? » -- et quelqu un
-- tranche. Rapprocher automatiquement deux « Martin » finirait par fusionner
-- deux personnes, et une fusion ne se defait pas.

create function public.apply_encadrement_sync(
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

revoke all on function public.apply_encadrement_sync(uuid, jsonb) from public, anon;
grant execute on function public.apply_encadrement_sync(uuid, jsonb) to authenticated;
