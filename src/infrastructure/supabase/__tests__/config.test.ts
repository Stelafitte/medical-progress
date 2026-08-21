import { describe, expect, it } from "vitest";
import { resolveSupabasePublicConfig } from "../config";

const key = "sb_publishable_abcdefghijklmnopqrstuvwxyz";

describe("configuration publique Supabase", () => {
  it("reste sur le backend mock par défaut", () => {
    expect(resolveSupabasePublicConfig({})).toEqual({
      configured: false,
      backend: "mock",
      reason: "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont requises.",
    });
  });

  it("ne bascule sur Supabase que sur demande explicite", () => {
    const result = resolveSupabasePublicConfig({
      VITE_DATA_BACKEND: "supabase",
      VITE_SUPABASE_URL: "https://wbmkazfideylaixjkzyn.supabase.co",
      VITE_SUPABASE_ANON_KEY: key,
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
