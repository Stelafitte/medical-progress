import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataAccess } from "@/application/ports/repositories";
import { mockDataAccess } from "@/infrastructure/mock/mockDataAccess";
import { getBrowserSupabaseClient } from "@/infrastructure/supabase/client";
import {
  supabasePublicConfig,
  type SupabaseConfigResult,
} from "@/infrastructure/supabase/config";
import { createSupabaseDataAccess } from "@/infrastructure/supabase/supabaseDataAccess";

let selectedDataAccess: DataAccess | undefined;

export function selectDataAccess(
  config: SupabaseConfigResult,
  client?: SupabaseClient,
): DataAccess {
  if (config.backend === "mock") return mockDataAccess;
  if (!config.configured) throw new Error(config.reason);
  if (!client) throw new Error("Le client Supabase n’est pas disponible.");
  return createSupabaseDataAccess(client);
}

export function getSelectedDataAccess(): DataAccess {
  if (selectedDataAccess) return selectedDataAccess;
  const client =
    supabasePublicConfig.backend === "supabase" ? getBrowserSupabaseClient() : undefined;
  return (selectedDataAccess = selectDataAccess(supabasePublicConfig, client));
}
