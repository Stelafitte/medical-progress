import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const pedagogy = read("src/features/administration/AdminPedagogy.tsx");
const assessment = read("src/features/administration/AssessmentConfigurationSection.tsx");
const assessmentDomain = read("src/domain/assessment.ts");

describe("configuration pédagogique générique", () => {
  it("emploie les onglets transversaux validés", () => {
    for (const label of ["Ressources théoriques", "Compétences", "Évaluations"]) {
      expect(pedagogy).toContain(`label: "${label}"`);
    }
    expect(pedagogy).not.toContain('label: "Médiathèque"');
    expect(pedagogy).not.toContain('label: "Évaluations et ECOS"');
  });

  it("réserve l'entraînement ECOS au DFASM dans Compétences", () => {
    expect(pedagogy).toContain('startsWith("DFASM")');
    expect(pedagogy).toContain("L'entraînement ECOS est un module réservé aux programmes DFASM");
    expect(pedagogy).toContain("<EcosMigrationSection");
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
