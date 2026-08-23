/**
 * Contrats de l'écran « Personnes et inscriptions » vérifiés au niveau source :
 * marqueurs de simulation, absence d'appel non filtré, confirmations, accès.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");

const view = read("src/features/administration/PeopleEnrollmentsView.tsx");
const route = read("src/routes/espace.administration.personnes.tsx");
const nav = read("src/components/layout/navigation.ts");
const domain = read("src/domain/directory.ts");

describe("marqueurs de simulation", () => {
  it("affiche « Données simulées » et rappelle l'absence d'écriture serveur", () => {
    expect(view).toContain('"Données simulées"');
    expect(view).toContain("aucune écriture serveur");
    expect(view).toContain("aucun e-mail ni invitation réels");
  });

  it("indique explicitement que XLSX n'est pas pris en charge, sans simuler un succès", () => {
    expect(view).toContain("XLSX non pris en charge dans cette maquette");
    expect(view).toContain("Aucun import n'a été simulé.");
  });

  it("annonce le raccordement futur de la progression via une action désactivée", () => {
    expect(view).toContain("Progression (à raccorder)");
  });
});

describe("périmètre et permissions", () => {
  it("n'utilise ni listPeople() ni listAllRoleAssignments()", () => {
    expect(view).not.toContain("listPeople(");
    expect(view).not.toContain("listAllRoleAssignments(");
  });

  it("passe par une sélection contextualisée du programme", () => {
    expect(view).toContain("selectProgramDirectory(");
    expect(domain).toContain("côté serveur");
  });

  it("protège la route par l'administration DU programme", () => {
    expect(route).toContain("session.canAccessProgramAdministration");
    expect(route).toContain("AccessRestricted");
    expect(route).toContain('{ name: "robots", content: "noindex" }');
  });

  it("reste accessible depuis les classes d'apprenants, sans entrée de menu dédiée", () => {
    const classes = read("src/features/administration/AdminLearnerClasses.tsx");
    expect(classes).toContain('to="/espace/administration/personnes"');
    expect(nav).not.toContain('to: "/espace/administration/personnes"');
    expect(nav).toContain('label: "Classes d\'apprenants"');
  });
});

describe("confirmations et absence de suppression", () => {
  it("demande une confirmation avant import, retrait et archivage", () => {
    expect(view.match(/AlertDialogAction/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(view).toContain("Confirmer l'import local");
    expect(view).toContain("Confirmer le retrait");
    expect(view).toContain("Confirmer l'archivage");
  });

  it("ne supprime jamais une personne dans le domaine", () => {
    expect(domain).not.toContain("deletePerson");
    expect(domain).toContain("aucune suppression");
  });

  it("garantit des cibles tactiles de 44 px sur les actions", () => {
    expect(view.match(/min-h-11/g)?.length ?? 0).toBeGreaterThan(10);
  });
});
