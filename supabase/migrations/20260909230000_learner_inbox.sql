-- « MES MESSAGES » CESSE D ETRE UNE FICTION.
--
-- CE QUI ETAIT AFFICHE. Trois messages ECRITS EN DUR dans
-- `LearnerMessagesView.tsx` — « Ouverture du module Doppler », « Convocation a
-- l atelier de simulation », datés d aout 2026 — servis a un vrai etudiant en
-- production. Pas une table vide, pas un ecran a construire : du contenu
-- inventé, plausible, indiscernable d un vrai message. C est la pire forme de
-- maquette, et la lecon du 09/09 vaut ici a l envers : un vide credible est
-- pire qu une phrase, mais un CONTENU credible et faux est pire que tout.
--
-- CE QUI EXISTE DEJA, DEPUIS LE 04/09. `communication_campaigns` (l objet et le
-- corps), `communication_deliveries` (une ligne par destinataire), et un envoi
-- reel deja passe. La donnee est la. L index `communication_deliveries_person_idx`
-- a meme ete pose pour cette lecture-la.
--
-- LE TROU EXACT, MESURE AU BANC (cas R0). L etudiant lit ses PROPRES lignes de
-- `communication_deliveries` — la policy du 04/09 le prevoit — mais
-- `communication_campaigns_select` est cadree sur `is_program_staff`. Resultat :
-- 2 livraisons visibles, 0 campagne. Il voit QU ON lui a ecrit, jamais CE QU ON
-- lui a ecrit.

-- BANC D ESSAI (PostgreSQL 16, 09/09) : 17 cas, tous verts. Le trou constate
-- avant migration (2 livraisons / 0 campagne) ; la recursion des deux policies
-- reproduite puis coupee ; la boite telle que l ecran la lira ; « marquer lu »
-- idempotent ; le message d autrui et un identifiant inexistant refuses par le
-- MEME message, sans que la ligne d autrui bouge ; le personnel du programme
-- garde exactement l acces qu il avait (2 campagnes, 3 livraisons) ; un tiers ne
-- voit rien et ne peut rien marquer ; droits d execution ; et aucun droit
-- d ecriture directe sur la trace.

begin;

/* ================================================================== */
/* 1. Lu / non lu                                                      */
/* ================================================================== */

-- SUR LA LIVRAISON ET NON SUR LA CAMPAGNE. Une campagne part a cent personnes ;
-- « lu » est un fait qui appartient a UNE personne. La livraison est deja la
-- ligne (campagne x personne), c est exactement la maille cherchee.
--
-- NULLABLE, SANS DEFAUT : `null` veut dire non lu. Un booleen `read` a `false`
-- par defaut dirait la meme chose en perdant QUAND, et l heure de lecture est
-- ce qui permettra un jour de dire « recu il y a trois jours, jamais ouvert ».
alter table public.communication_deliveries
  add column read_at timestamptz;

comment on column public.communication_deliveries.read_at is
  'Quand le destinataire a ouvert ce message. NULL = non lu.';

/* ================================================================== */
/* 2. ⚠️ LE PIEGE : DEUX POLICIES QUI SE REGARDENT                     */
/* ================================================================== */

-- MESURE AU BANC, CAS R1 A R3, ET LE RESULTAT EST PIRE QUE PREVU.
--
-- La policy des livraisons interroge DEJA les campagnes (pour le personnel du
-- programme). Ajouter naivement, sur les campagnes, une policy qui interroge
-- les livraisons ferme la boucle :
--
--   ERROR: infinite recursion detected in policy for relation "communication_campaigns"
--   ERROR: infinite recursion detected in policy for relation "communication_deliveries"
--
-- La SECONDE erreur est celle qui compte : la lecture des livraisons, qui
-- fonctionnait, se met a echouer aussi. On ne serait pas passe de « boite vide »
-- a « boite pleine » mais de « boite vide » a « ecran en erreur », pour tout le
-- monde, personnel du programme compris.
--
-- LA SORTIE EST UNE FONCTION `security definer` : son corps ne repasse pas par
-- la RLS, donc la boucle est coupee. C est le meme montage que
-- `administers_person`, posee le 04/09 dans cette meme migration pour la meme
-- raison — et le meme motif que la lecon du 08/09, a ceci pres qu ici le
-- `definer` n ouvre RIEN : il ne rend qu un booleen, et seulement sur
-- `auth.uid()`, jamais sur une personne passee en argument.
create or replace function public.is_message_recipient(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.communication_deliveries d
    where d.campaign_id = p_campaign_id
      and d.person_id = auth.uid()
  );
$$;

revoke all on function public.is_message_recipient(uuid) from public, anon;
grant execute on function public.is_message_recipient(uuid) to authenticated;

-- UNE POLICY DE PLUS, ET NON LA POLICY EXISTANTE REECRITE. Les policies `select`
-- s additionnent en OU : le personnel garde exactement l acces qu il avait, et
-- une eventuelle erreur ici ne peut que REFUSER, jamais elargir ce que le
-- personnel voyait deja.
create policy communication_campaigns_select_recipient on public.communication_campaigns
  for select to authenticated
  using (public.is_message_recipient(id));

/* ================================================================== */
/* 3. Marquer comme lu                                                 */
/* ================================================================== */

-- UNE RPC, PARCE QU IL N Y A AUCUN DROIT D ECRITURE SUR CETTE TABLE — et il ne
-- doit pas y en avoir : `communication_deliveries` est une TRACE d envoi. Une
-- policy `update` ouverte au destinataire lui donnerait, au meme mouvement, la
-- possibilite de reecrire `status`, `to_email` ou `failure_reason` de sa propre
-- ligne. La fonction ne touche qu une colonne.
--
-- IDEMPOTENTE : relire un message deja lu ne repousse pas l heure. « Quand
-- l a-t-il ouvert la premiere fois » est la question qui a un sens.
create or replace function public.mark_message_read(p_delivery_id uuid)
returns public.communication_deliveries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.communication_deliveries;
begin
  update public.communication_deliveries d
     set read_at = coalesce(d.read_at, now())
   where d.id = p_delivery_id
     and d.person_id = auth.uid()
  returning * into v_row;

  -- UN SEUL MESSAGE POUR DEUX CAS — livraison inexistante, ou livraison
  -- d autrui — ET C EST DELIBERE : distinguer les deux dirait a un curieux si
  -- un identifiant existe.
  if v_row.id is null then
    raise exception 'Message introuvable.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.mark_message_read(uuid) from public, anon;
grant execute on function public.mark_message_read(uuid) to authenticated;

commit;
