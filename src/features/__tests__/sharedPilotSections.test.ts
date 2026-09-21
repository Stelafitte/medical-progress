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

  /*
   * LE MÉNAGE DU 21/09 (Stef : « trois listes des mêmes étudiants »). Le
   * pilotage n'incruste plus le bloc des stages (il a son onglet) ni la
   * consultation des évaluations : il garde UNE liste d'étudiants, la matrice,
   * et l'atelier des évaluations en écriture, borné à la promotion.
   */
  it("n'affiche qu'une seule liste des étudiants", () => {
    expect(pilot).not.toContain("<PlacementSection");
    expect(pilot).not.toContain("LearnerManagementPanel");
    expect(pilot).not.toContain("Intervenants et rôles");
    expect(pilot.match(/<LearnerTrackingSection/g)?.length).toBe(1);
  });

  it("garde l'atelier des évaluations en écriture, sans doublon en lecture", () => {
    expect(pilot.match(/<AssessmentModalitySection/g)?.length).toBe(1);
    expect(pilot).not.toContain("editable={false}");
  });

  it("la matrice porte le carnet de stage réel", () => {
    const matrice = read("src/features/administration/LearnerTrackingSection.tsx");
    expect(matrice).toContain("Carnet de stage");
    expect(matrice).toContain("sans groupe");
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
