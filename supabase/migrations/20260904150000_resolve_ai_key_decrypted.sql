/* ==================================================================
   CORRECTIF — `resolve_program_ai_key` lisait la valeur CHIFFREE.

   Trouve le 04/09 au premier appel reel : `vault.secrets.secret` contient
   le chiffre, pas le clair. La fonction envoyait donc un blob chiffre a
   OpenAI comme jeton d'autorisation, et l'appel echouait avec
   « Invalid header value ».

   Le clair est expose par la VUE `vault.decrypted_secrets`, colonne
   `decrypted_secret`. C'est la seule difference, et elle est essentielle.

   ON EN PROFITE POUR NETTOYER LA CLE (`btrim`) : un espace ou un retour a la
   ligne colle par megarde en fin de cle produit exactement la meme erreur
   d'en-tete HTTP, et le message ne le dit pas.

   Le reste ne bouge pas : toujours `security definer`, toujours reservee a
   `service_role`, toujours conditionnee a `program_ai_settings.enabled`.
   ================================================================== */

create or replace function public.resolve_program_ai_key(p_program_id uuid)
returns table (provider public.ai_provider, model text, api_key text)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  return query
    select c.provider, c.model, btrim(v.decrypted_secret)
    from public.program_ai_settings s
    join public.program_ai_credentials c
      on c.program_id = s.program_id and c.provider = s.active_provider
    join vault.decrypted_secrets v on v.id = c.secret_id
    where s.program_id = p_program_id and s.enabled;
end;
$$;

revoke all on function public.resolve_program_ai_key(uuid) from public, anon, authenticated;
grant execute on function public.resolve_program_ai_key(uuid) to service_role;
