import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const knowledge = read("src/features/administration/AdminKnowledgeBase.tsx");
const evaluations = read("src/features/administration/AdminAssessments.tsx");
const assessment = read("src/features/administration/AssessmentConfigurationSection.tsx");
const assessmentDomain = read("src/domain/assessment.ts");

describe("configuration pédagogique générique", () => {
  it("répartit les contenus dans les onglets transversaux validés", () => {
    for (const tab of ["Dépôt et catalogue", "Connaissances visées", "Exploitation IA"]) {
      expect(knowledge).toContain(tab);
    }
    for (const tab of ["Modalités et QCM", "Simulation et ECOS", "Résultats et notes"]) {
      expect(evaluations).toContain(tab);
    }
    expect(knowledge).not.toContain("Médiathèque</");
  });

  it("réserve l'entraînement ECOS au DFASM dans Évaluations", () => {
    expect(evaluations).toContain('startsWith("DFASM")');
    expect(evaluations).toContain("L'entraînement ECOS est un module réservé aux programmes DFASM");
    expect(evaluations).toContain("<EcosMigrationSection");
  });

  it("place les ECOS certificatifs parmi les contenus d'évaluation", () => {
    expect(assessment).toContain("ECOS est une modalité d'évaluation");
    expect(assessment).toContain("ASSESSMENT_CONTENT_LABELS_FR");
  });

  it("prévoit les évaluations hors plateforme et l'import de résultats", () => {
    expect(assessmentDomain).toContain('external: "Hors plateforme"');
    expect(assessment).toContain("Importer des résultats externes");
    expect(assessment).toContain("CSV, TSV et XLSX");
  });

  it("annonce sans simuler une banque QCM multimédia déjà fonctionnelle", () => {
    expect(assessment).toContain("Banques de questions — trajectoire");
    expect(assessmentDomain).toContain("GIF animés et boucles d'échocardiographie");
    expect(assessment).toContain("Fondation prévue");
  });
});
