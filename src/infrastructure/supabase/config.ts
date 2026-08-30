export type DataBackend = "mock" | "supabase";

export interface SupabasePublicConfig {
  readonly url: string;
  readonly publishableKey: string;
}

export type SupabaseConfigResult =
  | { readonly configured: true; readonly backend: DataBackend; readonly value: SupabasePublicConfig }
  | { readonly configured: false; readonly backend: DataBackend; readonly reason: string };

function validSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Lit uniquement les variables VITE_ publiques. Une clé service_role ne doit
 * jamais être référencée, importée ou injectée dans le bundle navigateur.
 */
export function resolveSupabasePublicConfig(
  env: Record<string, string | boolean | undefined>,
): SupabaseConfigResult {
  const backend: DataBackend =
    env["VITE_DATA_BACKEND"] === "supabase" ? "supabase" : "mock";
  const url =
    typeof env["VITE_SUPABASE_URL"] === "string" ? env["VITE_SUPABASE_URL"].trim() : "";
  const publishableKeyValue =
    env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? env["VITE_SUPABASE_ANON_KEY"];
  const publishableKey =
    typeof publishableKeyValue === "string" ? publishableKeyValue.trim() : "";

  if (!url || !publishableKey) {
    return {
      configured: false,
      backend,
      reason:
        "VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY (ou l’ancienne VITE_SUPABASE_ANON_KEY) sont requises.",
    };
  }
  if (!validSupabaseUrl(url)) {
    return { configured: false, backend, reason: "VITE_SUPABASE_URL est invalide." };
  }
  if (publishableKey.length < 20) {
    return { configured: false, backend, reason: "La clé publique Supabase est invalide." };
  }
  return { configured: true, backend, value: { url, publishableKey } };
}

export const supabasePublicConfig = resolveSupabasePublicConfig(import.meta.env);
