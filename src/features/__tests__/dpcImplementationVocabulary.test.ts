/**
 * Contrats de vocabulaire : le périmètre DPC parle d'implémentation d'un
 * programme de référence, jamais de « création » d'un programme DPC.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DPC_WIZARD_STEPS } from "@/domain/dpcProgramDraft";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const dpcRoute = read("src/routes/espace.administration.dpc.tsx");
const wizardRoute = read("src/routes/espace.administration.assistant-dpc.tsx");
const section = read("src/features/administration/DpcImplementationsSection.tsx");
const uiFiles = [dpcRoute, wizardRoute, section, read("src/features/administration/DpcProgramWizard.tsx")];

describe("vocabulaire", () => {
  it("n'emploie plus « Créer un programme DPC » dans l'interface", () => {
    for (const source of uiFiles) {
      expect(source).not.toContain("Créer un programme DPC");
      expect(source).not.toContain("Création d'un programme DPC");
    }
  });

  it("propose l'action « Implémenter un programme DPC »", () => {
    expect(dpcRoute).toContain("Implémenter un programme DPC");
  });

  it("nomme l'assistant « Assistant d'implémentation DPC »", () => {
    expect(wizardRoute).toContain("Assistant d'implémentation DPC");
  });

  it("emploie le vocabulaire de référence et d'implémentation", () => {
    for (const term of [
      "programme de référence",
      "implémentation",
      "cohorte",
      "calendrier",
      "Modules activés",
    ]) {
      expect(section.toLowerCase()).toContain(term.toLowerCase());
    }
  });

  it("distingue publication du programme de référence et ouverture d'une implémentation", () => {
    expect(section).toContain("Publier le programme de référence (simulé)");
    expect(section).toContain("Ouvrir l'implémentation (simulé)");
    expect(section).toContain("canOpenImplementation");
  });

  it("conserve les marqueurs simulés et n'effectue aucun envoi", () => {
    expect(section).toContain("<MockBadge");
    expect(section).not.toContain("fetch(");
    expect(section).not.toContain("joinUrl}");
  });
});

describe("étapes de l'assistant", () => {
  it("suit le parcours d'implémentation attendu", () => {
    expect(DPC_WIZARD_STEPS[0]!.title).toBe("Programme de référence");
    expect(DPC_WIZARD_STEPS.map((step) => step.title)).toContain(
      "Cohorte, modalités et calendrier",
    );
    expect(DPC_WIZARD_STEPS[DPC_WIZARD_STEPS.length - 1]!.title).toBe(
      "Contrôle avant ouverture",
    );
  });
});
