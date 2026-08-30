/**
 * Contrat de cohérence : le pilotage réutilise les MÊMES blocs que les onglets
 * dédiés (stages, évaluations) en mode suivi, et l'espace apprenant / encadrant
 * reflète les créations d'administration de la session.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("blocs partagés du pilotage", () => {
  const pilot = read("src/features/administration/AdminProgramPilot.tsx");

  it("réutilise PlacementSection et AssessmentModalitySection", () => {
    expect(pilot).toContain("<PlacementSection");
    expect(pilot).toContain("<AssessmentModalitySection");
  });

  it("n'ouvre aucune création de modèle dans le pilotage", () => {
    expect(pilot.match(/showCreation=\{false\}/g)?.length).toBe(2);
  });

  it("ne recrée plus de liste de stages ad hoc", () => {
    expect(pilot).not.toContain("Périodes de stage de la promotion");
  });
});

describe("boucle apprenant et encadrant", () => {
  it("le passeport apprenant fusionne les créations d'administration", () => {
    const hook = read("src/features/dashboard/useLearnerPassport.ts");
    // Les acquis ne sont plus fusionnes depuis un store local : ils viennent
    // reellement de Supabase depuis le chantier #3. Les terrains de stage, eux,
    // sont encore crees en session, d'ou la fusion qui subsiste.
    expect(hook).toContain("data.outcomes.listOutcomes(activeProgram.id)");
    expect(hook).toContain("mergePlacements(storedPlacements");
  });

  it("le périmètre du responsable de stage voit les terrains créés", () => {
    const hook = read("src/features/supervision/useSupervision.ts");
    expect(hook).toContain("mergePlacements(storedPlacements, localPlacements)");
  });
});
