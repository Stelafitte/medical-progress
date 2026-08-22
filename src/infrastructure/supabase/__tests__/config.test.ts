import { describe, expect, it } from "vitest";
import { resolveSupabasePublicConfig } from "../config";

const key = "sb_publishable_abcdefghijklmnopqrstuvwxyz";

describe("configuration publique Supabase", () => {
  it("reste sur le backend mock par défaut", () => {
    expect(resolveSupabasePublicConfig({})).toEqual({
      configured: false,
      backend: "mock",
      reason:
        "VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY (ou l’ancienne VITE_SUPABASE_ANON_KEY) sont requises.",
    });
  });

  it("ne bascule sur Supabase que sur demande explicite", () => {
    const result = resolveSupabasePublicConfig({
      VITE_DATA_BACKEND: "supabase",
      VITE_SUPABASE_URL: "https://wbmkazfideylaixjkzyn.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    });
    expect(result).toEqual({
      configured: true,
      backend: "supabase",
      value: {
        url: "https://wbmkazfideylaixjkzyn.supabase.co",
        publishableKey: key,
      },
    });
  });

  it("conserve la compatibilité avec l'ancien nom de clé anon", () => {
    const result = resolveSupabasePublicConfig({
      VITE_SUPABASE_URL: "https://wbmkazfideylaixjkzyn.supabase.co",
      VITE_SUPABASE_ANON_KEY: key,
    });
    expect(result.configured && result.value.publishableKey).toBe(key);
  });

  it("préfère la clé publishable lorsque les deux noms sont présents", () => {
    const currentKey = `${key}_current`;
    const result = resolveSupabasePublicConfig({
      VITE_SUPABASE_URL: "https://wbmkazfideylaixjkzyn.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: currentKey,
      VITE_SUPABASE_ANON_KEY: `${key}_legacy`,
    });
    expect(result.configured && result.value.publishableKey).toBe(currentKey);
  });

  it("refuse une URL non HTTPS hors développement local", () => {
    const result = resolveSupabasePublicConfig({
      VITE_SUPABASE_URL: "http://example.org",
      VITE_SUPABASE_ANON_KEY: key,
    });
    expect(result.configured).toBe(false);
  });

  it("accepte Supabase local", () => {
    const result = resolveSupabasePublicConfig({
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: key,
    });
    expect(result.configured).toBe(true);
  });
});
