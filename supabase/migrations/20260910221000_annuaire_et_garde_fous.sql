/* ==================================================================
   L ANNUAIRE DES DESTINATAIRES, ET LES GARDE-FOUS DES RAPPELS.

   Demande de Stef, 10/09 : un onglet ou l on voit toutes les promotions, les
   etudiants de chacune, les encadrants et les responsables de terrain, ou l on
   coche, et d ou l on declenche trois gestes -- premiere connexion, message
   libre, rappels automatiques.

   ⚠️ LA MESURE QUI A DECIDE DE LA FORME DE CETTE MIGRATION. La base contient
   UN apprenant inscrit et UN encadrant. Elle contient aussi VINGT-SEPT lignes
   dans `people` -- 19 saisies a la main, 6 venues de la synchronisation UMCV,
   2 deja invitees. Un annuaire qui ne lirait que `enrollments` afficherait donc
   deux personnes, et l ecran serait vide le jour de son ouverture. Les gens a
   qui Stef veut ecrire -- surtout pour une premiere connexion -- sont
   precisement ceux qui n ont PAS encore de compte.
   D ou la regle de cet annuaire : LE VIVIER ET LES INSCRITS DANS LA MEME LISTE,
   et c est l ETAT DE LA LIGNE qui dira quel geste s applique.

   CE QUE CETTE MIGRATION NE CREE PAS, ET POURQUOI.
   Aucune table de campagne, aucune table de trace, aucune table de regle : tout
   existe depuis le 04/09 (`communication_campaigns`, `communication_deliveries`
   avec son `dedupe_key` unique partiel, `communication_preferences`,
   `message_templates`, `notification_rules`). En creer d autres aurait fabrique
   une deuxieme verite sur la meme depense. Ce qui manquait n etait pas le
   stockage : c etait la DISCIPLINE D ENVOI, et une porte d entree cote client.
   ================================================================== */

/* ==================================================================
   1. L INTENTION PEUT DESORMAIS VISER UN RESPONSABLE DE TERRAIN
   ================================================================== */

-- La contrainte du 10/09 matin ne connaissait que deux intentions. Un
-- responsable de terrain se prepare dans le vivier exactement comme un
-- encadrant : il vise un terrain, pas une promotion.
alter table public.people drop constraint if exists people_intended_role_shape;
alter table public.people
  add constraint people_intended_role_shape check (
    intended_role is null
    or (intended_role = 'learner' and intended_cohort_id is not null)
    or (intended_role = 'placement_supervisor' and intended_placement_id is not null)
    or (intended_role = 'placement_manager' and intended_placement_id is not null)
  );

/* ⚠️ CE QUE CETTE MIGRATION NE FAIT DELIBEREMENT PAS : elle n ajoute PAS
   'placement_manager' a `is_program_staff`. Cette fonction est la porte de
   lecture de presque toutes les policies du depot ; y glisser un role neuf le
   jour ou il est cree ouvrirait d un coup des dizaines de tables a une
   population dont personne n a encore decrit les besoins. Le role existe, il
   s attribue, il se contacte. Ce qu il a le droit de VOIR sera decide devant un
   ecran, pas ici. */

/* ==================================================================
   2. LA DISCIPLINE D ENVOI DES RAPPELS

   POURQUOI DES COLONNES ET NON DU JSONB. `notification_rules.trigger` decrit
   CE QUI declenche (un jalon depasse, une semaine de carnet close) : son
   vocabulaire bouge, il reste en JSONB. Les champs ci-dessous decrivent
   COMMENT on envoie -- a quelle frequence, dans quelle plage horaire, combien
   de fois au maximum. Cela ne bouge pas, cela se compare, cela se lit dans une
   requete, et surtout cela doit etre VERIFIABLE d un coup d oeil quand on se
   demande pourquoi un etudiant a recu trois messages.

   ⚠️ `dry_run_until` EST LE GARDE-FOU PRINCIPAL, ET IL EST OBLIGATOIRE A LA
   CREATION (defaut : sept jours). Tant que `now() < dry_run_until`, la regle
   CALCULE ses cibles, ecrit son journal, et n envoie RIEN. Un moteur de
   relances qu on arme sans l avoir vu tourner ecrit a trente personnes la
   premiere nuit -- et on ne recupere pas un message parti.
   ================================================================== */

alter table public.notification_rules
  add column if not exists dry_run_until timestamptz not null default now() + interval '7 days',
  add column if not exists min_days_between integer not null default 7,
  add column if not exists max_per_occurrence integer not null default 3,
  add column if not exists send_window_start time not null default '08:00',
  add column if not exists send_window_end time not null default '19:00',
  add column if not exists send_on_weekend boolean not null default false,
  add column if not exists last_run_at timestamptz;

alter table public.notification_rules
  add constraint notification_rules_min_days_sane
    check (min_days_between between 1 and 365),
  add constraint notification_rules_max_occurrence_sane
    check (max_per_occurrence between 1 and 10),
  add constraint notification_rules_window_ordered
    check (send_window_end > send_window_start);

/* Le fuseau n est PAS duplique ici : `programs.time_zone` le porte deja, et
   deux fuseaux pour la meme regle finiraient par diverger. La plage horaire
   ci-dessus se lit dans le fuseau du programme. */

/* ------------------------------------------------------------------
   LE JOURNAL DES EXECUTIONS.

   Une ligne par passage, en essai comme en reel. C est ce qui permet de
   repondre a « qu est-ce qui serait parti cette nuit » AVANT d armer, et a
   « pourquoi personne n a rien recu » APRES. `detail` porte le sort de chaque
   cible : retenue, ecartee, et pour quelle raison.
   ------------------------------------------------------------------ */
create table public.notification_rule_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.notification_rules (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  dry_run boolean not null,
  matched integer not null default 0,
  sent integer not null default 0,
  skipped integer not null default 0,
  detail jsonb not null default '[]'::jsonb,
  error text
);

create index notification_rule_runs_rule_idx
  on public.notification_rule_runs (rule_id, started_at desc);

alter table public.notification_rule_runs enable row level security;
revoke all on public.notification_rule_runs from public, anon, authenticated;
grant select on public.notification_rule_runs to authenticated;

/* Meme porte que la regle elle-meme : si on peut lire la regle, on peut lire
   ce qu elle a fait. Aucune policy d ecriture -- l ordonnanceur ecrit en
   service_role, comme toutes les Edge Functions du depot. */
create policy notification_rule_runs_select on public.notification_rule_runs
  for select to authenticated
  using (
    exists (
      select 1 from public.notification_rules r
      where r.id = notification_rule_runs.rule_id
        and public.is_program_staff(r.program_id)
    )
  );

/* ==================================================================
   3. MASQUAGE D ADRESSE

   Repris a l identique de `maskEmail` dans send-campaign : assez pour
   reconnaitre une adresse, inutilisable pour constituer un fichier. Le meme
   masque des deux cotes evite qu un administrateur voie deux formes
   differentes de la meme adresse selon l ecran.
   ================================================================== */
create or replace function public.mask_email(p_email text)
returns text language sql immutable as $fn$
  select case
    when p_email is null or position('@' in p_email) = 0 then '***'
    when length(split_part(p_email, '@', 1)) <= 2
      then left(split_part(p_email, '@', 1), 1) || '***@' || split_part(p_email, '@', 2)
    else left(split_part(p_email, '@', 1), 1) || '***'
         || right(split_part(p_email, '@', 1), 1) || '@' || split_part(p_email, '@', 2)
  end
$fn$;

revoke all on function public.mask_email(text) from public, anon;
grant execute on function public.mask_email(text) to authenticated;

/* ==================================================================
   4. L ANNUAIRE

   ⚠️ POURQUOI UNE FONCTION `security definer` ET PAS TROIS REQUETES DANS LE
   NAVIGATEUR. L etat d un compte ne vit pas dans `public` : `auth.users` porte
   l adresse et la derniere connexion, et la RLS ne les rend qu a leur
   titulaire. Sans cette fonction, l ecran ne pourrait afficher ni « jamais
   connecte », ni « sans adresse » -- c est-a-dire exactement les deux etats
   qui decident du geste a poser. C est la meme raison qui a fait exister
   `send-campaign` cote serveur.

   ET POURQUOI ELLE NE REND JAMAIS L ADRESSE EN CLAIR, MEME A UN
   ADMINISTRATEUR : un ecran qui affiche 27 adresses est un fichier d adresses
   qu il suffit de copier. Le masque suffit a reconnaitre une ligne.

   L AUTORISATION EST CELLE DU RESTE DE L ADMINISTRATION : `is_program_staff`.
   Pas un test de role ecrit a la main, qui aurait pu diverger.
   ================================================================== */
create or replace function public.program_directory(p_program_id uuid)
returns table (
  row_key text,
  kind public.role_name,
  person_id uuid,
  staging_id uuid,
  full_name text,
  group_id uuid,
  group_label text,
  account_state text,
  email_masked text,
  opted_out boolean,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $fn$
begin
  if not public.is_program_staff(p_program_id) then
    raise exception 'Programme hors de votre perimetre.' using errcode = '42501';
  end if;

  return query
  /* --- a. LES APPRENANTS INSCRITS, par promotion ------------------- */
  select
    'enrollment:' || e.id::text,
    'learner'::public.role_name,
    e.person_id,
    null::uuid,
    coalesce(nullif(btrim(pr.full_name), ''), 'Sans nom'),
    c.id,
    c.label,
    case
      when u.id is null then 'no_account'
      when coalesce(u.email, '') = '' then 'no_address'
      when u.last_sign_in_at is null then 'never_signed_in'
      else 'active'
    end,
    public.mask_email(u.email),
    coalesce(cp.opted_out, false),
    u.last_sign_in_at
  from public.enrollments e
  join public.cohorts c on c.id = e.cohort_id
  left join public.profiles pr on pr.id = e.person_id
  left join auth.users u on u.id = e.person_id
  left join public.communication_preferences cp
    on cp.person_id = e.person_id and cp.channel = 'email'
  where e.program_id = p_program_id
    and e.status <> 'withdrawn'

  union all

  /* --- b. LES ENCADRANTS ET LES RESPONSABLES DE TERRAIN ------------
     La source est `role_assignments` et non `supervision_group_supervisors` :
     c est l attribution de role qui donne l acces, donc c est elle qui dit qui
     EST encadrant. Un groupe de supervision dit seulement de qui il s occupe. */
  select
    'role:' || ra.person_id::text || ':' || ra.role::text,
    ra.role,
    ra.person_id,
    null::uuid,
    coalesce(nullif(btrim(pr.full_name), ''), 'Sans nom'),
    pl.id,
    coalesce(pl.name, 'Terrain non precise'),
    case
      when u.id is null then 'no_account'
      when coalesce(u.email, '') = '' then 'no_address'
      when u.last_sign_in_at is null then 'never_signed_in'
      else 'active'
    end,
    public.mask_email(u.email),
    coalesce(cp.opted_out, false),
    u.last_sign_in_at
  from public.role_assignments ra
  left join public.placements pl
    on pl.id = ra.scope_id and ra.scope_kind = 'placement'
  left join public.profiles pr on pr.id = ra.person_id
  left join auth.users u on u.id = ra.person_id
  left join public.communication_preferences cp
    on cp.person_id = ra.person_id and cp.channel = 'email'
  where ra.program_id = p_program_id
    and ra.revoked_at is null
    and ra.role in ('placement_supervisor', 'placement_manager')

  union all

  /* --- c. LE VIVIER : ceux qui n ont pas encore de compte -----------
     `intended_role` porte deja l intention depuis le 10/09 matin, et
     `intended_cohort_id` / `intended_placement_id` disent a quel bloc la ligne
     appartient. Une ligne annulee ou deja activee n est pas ici : activee, elle
     est remontee par (a) ou (b) ; annulee, elle n a rien a faire dans un
     ecran d envoi. */
  select
    'staged:' || pe.id::text,
    coalesce(pe.intended_role, 'learner'::public.role_name),
    null::uuid,
    pe.id,
    btrim(pe.first_name || ' ' || pe.last_name),
    coalesce(pe.intended_cohort_id, pe.intended_placement_id),
    coalesce(c.label, pl.name, 'Sans rattachement'),
    case pe.status when 'invited' then 'invited' else 'staged' end,
    public.mask_email(pe.login_email),
    false,
    null::timestamptz
  from public.people pe
  left join public.cohorts c on c.id = pe.intended_cohort_id
  left join public.placements pl on pl.id = pe.intended_placement_id
  where pe.program_id = p_program_id
    and pe.status in ('pending', 'invited')
    and pe.cancelled_at is null

  order by 2, 7, 5;
end;
$fn$;

revoke all on function public.program_directory(uuid) from public, anon;
grant execute on function public.program_directory(uuid) to authenticated;

/* ==================================================================
   5. LA PORTE D ECRITURE D UNE CAMPAGNE

   ⚠️ POURQUOI UNE FONCTION ET NON UNE POLICY `for insert`. Le 04/09 a pose une
   regle explicite : AUCUNE policy d ecriture sur les campagnes, parce que
   l ecriture appartient a ce qui a vu le resultat SMTP. Ouvrir un `insert`
   aujourd hui pour que l ecran puisse creer un brouillon reviendrait a revenir
   sur cette regle pour une raison de confort. Une fonction `security definer`
   preserve l invariant : le navigateur peut creer un BROUILLON, et rien
   d autre. Le passage a `running` puis `completed` reste le monopole de
   `send-campaign`.

   `requires_collective_confirmation` reste a `true` : c est le garde-fou 428
   de la fonction d envoi, et il ne se desarme que par un geste explicite
   (chapitre 6).
   ================================================================== */
create or replace function public.create_communication_campaign(
  p_program_id uuid,
  p_subject text,
  p_body text,
  p_audience jsonb,
  p_template_id uuid default null,
  p_max_recipients integer default 200
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Aucune session.' using errcode = '42501';
  end if;
  if not public.is_program_staff(p_program_id) then
    raise exception 'Programme hors de votre perimetre.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_subject), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'Un message sans objet ou sans corps ne part pas.';
  end if;
  if jsonb_typeof(p_audience) <> 'object' or not (p_audience ? 'kind') then
    raise exception 'Audience invalide : la cle "kind" est requise.';
  end if;

  insert into public.communication_campaigns
    (program_id, template_id, channel, audience, subject, body,
     status, created_by, max_recipients, requires_collective_confirmation)
  values
    (p_program_id, p_template_id, 'email', p_audience, btrim(p_subject), p_body,
     'draft', auth.uid(), greatest(1, p_max_recipients), true)
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.create_communication_campaign(
  uuid, text, text, jsonb, uuid, integer) from public, anon;
grant execute on function public.create_communication_campaign(
  uuid, text, text, jsonb, uuid, integer) to authenticated;

/* ==================================================================
   6. LA CONFIRMATION D ENVOI COLLECTIF

   `send-campaign` refuse (428) tout envoi a plus d une personne tant que
   `collective_confirmation_at` est nul. Il fallait un geste pour le poser.
   Il est SEPARE de la creation a dessein : confirmer un envoi collectif doit
   etre un second clic, apres avoir vu le nombre reel de destinataires rendu
   par le mode essai. Confirmer en creant aurait rendu le garde-fou decoratif.
   ================================================================== */
create or replace function public.confirm_communication_campaign(p_campaign_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_program uuid;
  v_status public.comm_campaign_status;
  v_at timestamptz;
begin
  select program_id, status into v_program, v_status
  from public.communication_campaigns where id = p_campaign_id;

  if v_program is null then
    raise exception 'Campagne introuvable.' using errcode = '42501';
  end if;
  if not public.is_program_staff(v_program) then
    raise exception 'Campagne hors de votre perimetre.' using errcode = '42501';
  end if;
  if v_status <> 'draft' then
    raise exception 'Seul un brouillon se confirme (etat actuel : %).', v_status;
  end if;

  update public.communication_campaigns
    set collective_confirmation_at = now(), approved_by = auth.uid()
    where id = p_campaign_id
    returning collective_confirmation_at into v_at;

  return v_at;
end;
$fn$;

revoke all on function public.confirm_communication_campaign(uuid) from public, anon;
grant execute on function public.confirm_communication_campaign(uuid) to authenticated;
