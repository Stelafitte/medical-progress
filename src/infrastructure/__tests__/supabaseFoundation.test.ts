import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const migrationDir = new URL("supabase/migrations/", root);
const migrationFiles = readdirSync(migrationDir).sort();
const migrations = migrationFiles.map((name) => read(`supabase/migrations/${name}`)).join("\n");

describe("socle Supabase versionné", () => {
  it("conserve des migrations ordonnées et additives", () => {
    // Une liste figee rouillait a chaque migration ajoutee, sans rien prouver
    // de plus. Ce qui compte : un horodatage unique par fichier, un ordre
    // chronologique strict, et le socle en tete.
    expect(migrationFiles.length).toBeGreaterThanOrEqual(4);
    for (const name of migrationFiles) {
      expect(name).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
    const stamps = migrationFiles.map((name) => name.slice(0, 14));
    expect(new Set(stamps).size).toBe(stamps.length);
    expect([...stamps].sort()).toEqual(stamps);
    expect(migrationFiles[0]).toBe("20260821090000_core_identity_programs.sql");
    expect(migrations.toLowerCase()).not.toContain("drop table");
    expect(migrations.toLowerCase()).not.toContain("drop type");
  });

  it("sépare le profil applicatif de l'identité Supabase", () => {
    const core = read(`supabase/migrations/${migrationFiles[0]}`);
    expect(core).toContain("references auth.users (id)");
    const profileBlock = core.slice(
      core.indexOf("create table public.profiles"),
      core.indexOf("create table public.programs"),
    );
    expect(profileBlock).not.toMatch(/^\s+(password|email)\s+/im);
  });

  it("active la RLS sur chaque table publique créée", () => {
    const tables = [...migrations.matchAll(/create table public\.([a-z_]+)/g)].map(
      (match) => match[1],
    );
    expect(tables.length).toBeGreaterThanOrEqual(15);
    for (const table of tables) {
      expect(migrations).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("ne donne aucun accès anonyme et réserve le claim au worker", () => {
    expect(migrations).not.toMatch(/grant\s+.+\s+to\s+anon/gi);
    expect(migrations).toContain(
      "grant execute on function public.claim_next_conversion_job(text) to service_role",
    );
    expect(migrations).toContain(
      "revoke all on function public.claim_next_conversion_job(text) from public, anon, authenticated",
    );
  });

  it("isole le PPTX source des artefacts apprenants", () => {
    const media = read(`supabase/migrations/${migrationFiles[1]}`);
    const security = read(`supabase/migrations/${migrationFiles[2]}`);
    expect(media).toContain("kind = 'source' and bucket_name = 'pptx-sources'");
    expect(media).toContain("kind <> 'source' and bucket_name = 'course-artifacts'");
    expect(security).toContain("kind <> 'source'");
    expect(security).toContain("bucket_id = 'pptx-sources'");
    expect(security).toContain("public.is_program_staff(a.program_id)");
  });

  it("crée uniquement des buckets privés et limite la taille des PPTX", () => {
    const security = read(`supabase/migrations/${migrationFiles[2]}`);
    expect(security).toContain("'pptx-sources'");
    expect(security).toContain("'course-artifacts'");
    expect(security).toContain("262144000");
    expect(security).not.toMatch(/'pptx-sources'[\s\S]{0,120}\btrue\b/);
  });

  it("ne contient aucun secret vraisemblable dans l'exemple d'environnement", () => {
    const env = read(".env.example");
    expect(env).toContain("replace-with-service-role-key");
    expect(env).not.toContain("eyJhbGciOi");
    expect(env).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
  });
});
