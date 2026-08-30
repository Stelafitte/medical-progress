/**
 * Contrats de portabilité smartphone vérifiés au niveau source :
 * navigation mobile explicite, absence de largeur fixe bloquante,
 * zones tactiles suffisantes et action de retour au profil par défaut.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const shell = read("src/components/layout/app-shell.tsx");
const programSwitcher = read("src/components/program-switcher.tsx");
const stageLogBook = read("src/features/stage/StageLogBook.tsx");
const mediaSection = read("src/features/administration/MediaLibrarySection.tsx");

describe("navigation mobile", () => {
  it("expose un menu latéral déclenché par un bouton accessible", () => {
    expect(shell).toContain("Ouvrir le menu de navigation");
    expect(shell).toContain('aria-label="Navigation mobile"');
  });

  it("permet de changer de programme depuis le menu mobile", () => {
    expect(shell).toContain('<ProgramSwitcher variant="full" />');
  });
});

describe("sélecteur de programme", () => {
  it("n'impose plus une largeur fixe incompatible avec 360 px", () => {
    expect(programSwitcher).not.toContain('className="w-[15rem] bg-card"');
    expect(programSwitcher).toContain("min-w-0");
    expect(programSwitcher).toContain("sm:w-[15rem]");
  });
});

describe("zones tactiles", () => {
  it("garantit une hauteur de cible suffisante dans la navigation", () => {
    expect(shell).toContain("min-h-11");
  });

  it("empile les actions du carnet de stage sur mobile", () => {
    expect(stageLogBook).toContain("flex-col gap-2 sm:flex-row");
    expect(stageLogBook).toContain("w-full gap-2 sm:w-auto");
  });
});

describe("retour au profil de démonstration par défaut", () => {
  it("propose une action explicite de réinitialisation", () => {
    expect(shell).toContain("resetDemoSession");
    expect(shell).toContain("Revenir au profil par défaut");
  });
});

describe("médiathèque responsive", () => {
  it("prévoit une variante non tabulaire pour les petits écrans", () => {
    expect(/md:hidden|sm:hidden|hidden md:|hidden sm:/.test(mediaSection)).toBe(true);
  });
});
