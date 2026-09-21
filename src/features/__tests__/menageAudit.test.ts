/**
 * Le ménage de l'audit du 21/09 : plus aucune donnée de démonstration servie
 * en production, plus de boutons « simulé » sur les écrans réels.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");
const A = "src/features/administration/";

describe("aucune fixture en production", () => {
  const supa = read("src/infrastructure/supabase/supabaseDataAccess.ts");
  it("neutralise les espaces que Supabase ne réimplémente pas", () => {
    for (const ligne of [
      "audit: { listRecentEvents: async () => [] }",
      "statistics: { listCohortStatistics: async () => [] }",
      "aiCredits: { listEntries: async () => [], getBudget: async () => undefined }",
    ]) {
      expect(supa).toContain(ligne);
    }
    expect(supa).toContain("dpc: {");
    expect(supa).toContain("clinicalAudits: {");
    expect(supa).toContain("contentAi: {");
  });
});

describe("écrans débarrassés du simulé", () => {
  it("retire les statistiques de démonstration de la navigation", () => {
    const nav = read("src/components/layout/navigation.ts");
    expect(nav).not.toContain('to: "/espace/statistiques"');
    expect(nav).not.toContain('to: "/espace/plateforme/statistiques"');
    expect(read(`${A}AdminDashboard.tsx`)).not.toContain('title="Statistiques pluriannuelles"');
  });

  it("remplace le paramétrage plateforme simulé par les utilisateurs et les réglages réels", () => {
    const route = read("src/routes/espace.plateforme.pilotage.tsx");
    expect(route).toContain("PlatformUsersView");
    expect(read(`${A}PlatformUsersView.tsx`)).not.toContain("(simulé)");
  });

  it("ne montre plus de crédits IA ni de journal fictifs côté plateforme", () => {
    const overview = read(`${A}PlatformOverview.tsx`);
    expect(overview).not.toContain("aiCredits");
    expect(overview).not.toContain("listRecentEvents");
    const programmes = read(`${A}PlatformProgramsView.tsx`);
    expect(programmes).not.toContain("(simulé)");
    expect(programmes).not.toContain("listCohortStatistics");
  });

  it("retire les boutons simulés des supports, des stages et des documents", () => {
    expect(read(`${A}PptxConverterDialog.tsx`)).not.toContain("Mettre en ligne (simulé)");
    expect(read(`${A}MediaDetailDialog.tsx`)).not.toContain("Action simulée");
    expect(read(`${A}AdminStages.tsx`)).not.toContain("<StageLogTemplatesSection");
    expect(read(`${A}PlacementSection.tsx`)).not.toContain("non branché)");
    const docs = read(`${A}AdminDocuments.tsx`);
    expect(docs).not.toContain("Démonstration");
    expect(docs).not.toContain('title="Attestations et exports"');
  });

  it("dit la vérité quand l'association d'une promotion n'écrit rien", () => {
    expect(read(`${A}AdminProgramDesigner.tsx`)).toContain(
      "Aucun stage n'est retenu : aucun groupe d'encadrement n'a été créé.",
    );
  });

  it("borne les compteurs de la vue d'ensemble à la promotion observée", () => {
    const dash = read(`${A}AdminDashboard.tsx`);
    expect(dash).toContain("stagesDeLaPromotion");
    expect(dash).toContain("carnetsDeLaPromotion");
    expect(dash).not.toContain(">\n                        Traiter");
  });
});
