import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const migrationDir = new URL("supabase/migrations/", root);
const migrationFiles = readdirSync(migrationDir).sort();
const migrations = migrationFiles.map((name) => read(`supabase/migrations/${name}`)).join("\n");

describe("socle Supabase versionné", () => {
  it("conserve des migrations ordonnées et additives", () => {
    expect(migrationFiles).toEqual([
      "20260821090000_core_identity_programs.sql",
      "20260821091000_learning_resources_and_pptx.sql",
      "20260821092000_rls_and_private_storage.sql",
      "20260821140000_program_domain_alignment.sql",
    ]);
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
