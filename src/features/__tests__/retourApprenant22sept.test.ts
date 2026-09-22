import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("retours de Stef sur l'espace étudiant (22/09)", () => {
  it("un inscrit entre seul dans le groupe unique de sa promotion, avec son carnet", () => {
    const sql = read("supabase/migrations/20260922080000_rattachement_auto_groupe.sql");
    expect(sql).toContain("create trigger enrollments_rattacher_groupe");
    expect(sql).toContain("if v_nb <> 1 then");
    expect(sql).toContain("insert into public.stage_logs");
    expect(sql).toContain("on conflict (enrollment_id, placement_id) do nothing");
  });

  it("l'accueil ouvre sur la date du jour et le retard sur le programme préconisé", () => {
    const vue = read("src/features/dashboard/DashboardView.tsx");
    expect(vue).toContain("Aujourd'hui, {dateFr(aujourdhui.toISOString())}");
    expect(vue).toContain("Par rapport au programme préconisé");
    expect(vue).toContain("À rattraper en premier");
  });

  it("« Mes évaluations » range par nature, en blocs titrés, colorés, repliables", () => {
    const vue = read("src/features/evaluations/MesEvaluations.tsx");
    for (const t of ['titre: "QCM"', 'titre: "Dossiers progressifs"', 'titre: "ECOS"']) {
      expect(vue).toContain(t);
    }
    expect(vue).toContain("repliable");
    expect(read("src/features/evaluations/ui-apprenant.tsx")).toContain("aria-expanded={ouvert}");
  });
});
