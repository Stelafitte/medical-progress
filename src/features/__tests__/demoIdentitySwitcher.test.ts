/**
 * Le sélecteur d'identités de démonstration doit dépendre du TYPE de session
 * (session.isSimulated) et non du mode de build : l'aperçu privé est compilé en
 * production, donc IS_DEV / import.meta.env.DEV y est faux.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const shell = read("src/components/layout/app-shell.tsx");
const session = read("src/application/session.tsx");

const switcherBlock = shell.slice(
  shell.indexOf("Changer de profil de démonstration") - 400,
  shell.indexOf("DropdownMenuRadioGroup>") + 40,
);

describe("sélecteur de profil de démonstration", () => {
  it("porte le libellé attendu", () => {
    expect(shell).toContain("Changer de profil de démonstration");
    expect(shell).not.toContain("Profil de démonstration (dev)");
  });

  it("est conditionné par isSimulated et non par IS_DEV", () => {
    expect(switcherBlock).toContain("{isSimulated ?");
    expect(switcherBlock).not.toContain("IS_DEV");
    expect(shell).toContain("isSimulated,");
  });

  it("n'utilise ni paramètre d'URL ni drapeau ad hoc pour s'afficher", () => {
    expect(switcherBlock).not.toMatch(/searchParams|location\.search|localStorage/);
  });

  it("disparaîtra avec une session réelle (invariant typé booléen)", () => {
    expect(session).toMatch(/readonly isSimulated: boolean;/);
  });

  it("indique l'absence de rôle dans le programme actif", () => {
    expect(switcherBlock).toContain("rolesInActiveProgram.length === 0");
    expect(switcherBlock).toContain("aucun rôle dans");
  });
});
