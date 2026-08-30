import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig, type SupabasePublicConfig } from "./config";

let browserClient: SupabaseClient | undefined;

export function createBrowserSupabaseClient(config: SupabasePublicConfig): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: { headers: { "x-application-name": "campus-sante-augmente" } },
  });
}

/**
 * Retourne undefined tant que l'environnement n'est pas configuré. Ce choix
 * conserve la maquette fonctionnelle et empêche une bascule implicite.
 */
export function getBrowserSupabaseClient(): SupabaseClient | undefined {
  if (!supabasePublicConfig.configured) return undefined;
  browserClient ??= createBrowserSupabaseClient(supabasePublicConfig.value);
  return browserClient;
}
