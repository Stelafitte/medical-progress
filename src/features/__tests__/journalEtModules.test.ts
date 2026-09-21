import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { horodatageFr, libelleEvenement } from "@/domain/auditJournal";

const read = (p: string) => readFileSync(p, "utf8");

describe("journal d'audit lu en base (21/09)", () => {
  it("traduit les événements connus et garde les inconnus tels quels", () => {
    expect(libelleEvenement("role_assignment.granted")).toBe("Droit accordé");
    expect(libelleEvenement("cohort.archived")).toBe("Promotion archivée");
    expect(libelleEvenement("autre.chose")).toBe("autre.chose");
  });

  it("horodate en français et tolère une date invalide", () => {
    expect(horodatageFr("2026-09-21T12:05:00Z")).toMatch(/21\/09\/2026/);
    expect(horodatageFr("pas une date")).toBe("pas une date");
  });

  it("passe par la fonction bornée, jamais par la table, et écarte les ouvertures de cours", () => {
    const sql = read("supabase/migrations/20260921150000_journal_audit_lecture.sql");
    expect(sql).toContain("can_administer_program(p_program_id)");
    expect(sql).toContain("is_platform_admin()");
    expect(sql).toContain("a.event_type <> 'course_opened'");
    expect(sql).toContain("from public, anon");
    const supa = read("src/infrastructure/supabase/supabaseDataAccess.ts");
    expect(supa).toContain('client.rpc("list_audit_events"');
    expect(read("src/features/administration/useProgramAdmin.ts")).toContain(
      "listRecentEvents(50, activeProgram.id)",
    );
  });
});

describe("module stages réglable (21/09)", () => {
  it("écrit par une fonction gardée et tracée", () => {
    const sql = read("supabase/migrations/20260921160000_module_stages_reglable.sql");
    expect(sql).toContain("can_administer_program(p_program_id)");
    expect(sql).toContain("'program.placements_module'");
    expect(sql).not.toContain("dpc_enabled =");
    expect(sql).not.toContain("audits_enabled =");
  });

  it("est proposé dans Gestion des stages", () => {
    expect(read("src/features/administration/AdminStages.tsx")).toContain(
      "<PlacementsModuleToggle",
    );
  });
});
