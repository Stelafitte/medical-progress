import { describe, expect, it } from "vitest";
import {
  ECOS_EVIDENCE_RULE_FR,
  LEGACY_SOURCE_PROJECT_ID,
  LEGACY_SOURCE_SYSTEM,
  MIGRATION_STEPS,
  inventoryProgress,
  projectEcosResultToEvidence,
} from "@/domain/ecosMigration";
import { ecosScenarios, legacyEcosInventory } from "@/infrastructure/mock/ecosFixtures";

describe("inventaire ECOS legacy", () => {
  it("recense les écrans, domaines, composants et fonctions constatés", () => {
    const names = legacyEcosInventory.map((i) => i.sourceModule);
    for (const expected of [
      "EcosAdminList",
      "EcosAdminEditor",
      "EcosList",
      "EcosPreview",
      "EcosSession",
      "ecosScenario",
      "ecosCaseConfig",
      "ecosLifecycle",
      "ecosUi",
      "ecosVoices",
      "ecosAvatars",
      "ecosRealtimePricing",
      "ecos-config-check",
      "ecos-realtime-session",
      "ecos-end-session",
      "ecos-debrief",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("couvre les quatre catégories et une décision explicite par module", () => {
    const categories = new Set(legacyEcosInventory.map((i) => i.category));
    expect(categories).toEqual(new Set(["screen", "domain", "component", "function"]));
    for (const item of legacyEcosInventory) {
      expect(["keep", "adapt", "replace"]).toContain(item.decision);
      expect(item.destination.length).toBeGreaterThan(0);
      expect(item.destination).not.toContain(LEGACY_SOURCE_PROJECT_ID);
    }
  });

  it("agrège la progression sans perdre d'élément", () => {
    const p = inventoryProgress(legacyEcosInventory);
    expect(p.total).toBe(legacyEcosInventory.length);
    expect(p.byDecision.keep + p.byDecision.adapt + p.byDecision.replace).toBe(p.total);
  });

  it("conserve la provenance legacy sans couplage runtime", () => {
    expect(LEGACY_SOURCE_SYSTEM).toBe("dfasm-learnhub");
    expect(LEGACY_SOURCE_PROJECT_ID).toBe("e3860f5b-091d-4d36-ae37-c2899be8ecdd");
  });
});

describe("workflow de migration", () => {
  it("respecte l'ordre Inventorier → Mapper → Adapter → Tester → Importer", () => {
    expect(MIGRATION_STEPS.map((s) => s.key)).toEqual([
      "inventory",
      "map",
      "adapt",
      "test",
      "import",
    ]);
  });

  it("laisse l'étape d'import non réalisée (aucun import réel)", () => {
    expect(MIGRATION_STEPS.at(-1)!.done).toBe(false);
  });
});

describe("scénarios ECOS mock et production de preuve", () => {
  it("expose des scénarios avec grille, compétences liées et mode", () => {
    expect(ecosScenarios.length).toBeGreaterThan(0);
    for (const s of ecosScenarios) {
      expect(s.grading.length).toBeGreaterThan(0);
      expect(s.outcomeIds.length).toBeGreaterThan(0);
      expect(["text", "voice", "text_and_voice"]).toContain(s.mode);
      expect(s.durationMinutes).toBeGreaterThan(0);
    }
  });

  it("ne produit qu'une compétence simulée, jamais une compétence réelle", () => {
    const projection = projectEcosResultToEvidence();
    expect(projection.outcomeNature).toBe("simulated_competence");
    expect(projection.selfDeclared).toBe(false);
    expect(projection.requiresHumanValidationForRealCompetence).toBe(true);
    expect(ECOS_EVIDENCE_RULE_FR).toContain("jamais une compétence réelle");
  });
});
