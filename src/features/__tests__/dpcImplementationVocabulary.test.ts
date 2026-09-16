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
const wizard = read("src/features/administration/DpcProgramWizard.tsx");
const uiFiles = [dpcRoute, wizardRoute, section, wizard];

describe("vocabulaire", () => {
  it("n'emploie plus « Créer un programme DPC » dans l'interface", () => {
    for (const source of uiFiles) {
      expect(source).not.toContain("Créer un programme DPC");
      expect(source).not.toContain("Création d'un programme DPC");
    }
  });

  it("propose l'action principale « Importer et implémenter un programme DPC »", () => {
    expect(dpcRoute).toContain("Importer et implémenter un programme DPC");
    expect(dpcRoute).toContain("Importez le programme DPC et ses documents associés.");
  });

  it("n'impose plus de publier le programme de référence comme action indépendante", () => {
    for (const source of uiFiles) {
      expect(source).not.toContain("Publier le programme de référence");
    }
  });

  it("propose la réutilisation d'un programme importé comme option secondaire", () => {
    expect(dpcRoute).toContain("Réutiliser un programme déjà importé");
    expect(section).toContain("Réutiliser ce programme déjà importé (simulé)");
  });

  it("affiche la traçabilité de version dans une section secondaire", () => {
    expect(section).toContain("Traçabilité de la version");
    expect(wizard).toContain("Traçabilité de la version");
    expect(wizard).toContain("draft.checksum");
  });

  it("nomme l'assistant par l'import puis l'implémentation", () => {
    expect(wizardRoute).toContain("Importer et implémenter un programme DPC");
  });

  it("emploie le vocabulaire de référence et d'implémentation", () => {
    for (const term of [
      "programme de référence",
      "implémentation",
      "cohorte",
      "calendrier",
      "importé",
    ]) {
      expect(section.toLowerCase()).toContain(term.toLowerCase());
    }
  });

  it("distingue publication du programme de référence et ouverture d'une implémentation", () => {
    expect(section).toContain("Ouvrir l'implémentation (simulé)");
    expect(section).toContain("canOpenImplementation");
  });

  it("n'affiche plus de marqueur de chantier et n'effectue aucun envoi", () => {
    /* Stef, 16/09 : « le mot maquette apparait dans beaucoup d'onglets, traque
       le et supprime le ». Le marqueur visuel a disparu de tous les ecrans ; ce
       que le contrat garde, c'est l'absence d'envoi reel. */
    expect(section).not.toContain("MockBadge");
    expect(section).not.toContain("fetch(");
    expect(section).not.toContain("joinUrl}");
  });
});

describe("étapes de l'assistant", () => {
  it("suit le parcours d'implémentation attendu", () => {
    expect(DPC_WIZARD_STEPS[0]!.title).toBe("Importer les documents");
    expect(DPC_WIZARD_STEPS[0]!.description).toMatch(/Word ou PDF/);
    expect(DPC_WIZARD_STEPS.map((step) => step.title)).toContain("Programmer l'implémentation");
    expect(DPC_WIZARD_STEPS[DPC_WIZARD_STEPS.length - 1]!.title).toBe("Contrôle final");
  });
});
