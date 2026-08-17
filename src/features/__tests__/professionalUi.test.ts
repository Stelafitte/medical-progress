/**
 * Contrats des espaces professionnels vérifiés au niveau source :
 * navigation distincte, protection des routes, absence d'envoi ou de stockage réel.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const routeFiles = readdirSync(new URL("../../routes", import.meta.url));

const navigation = read("src/components/layout/navigation.ts");

describe("navigation par rôle", () => {
  it("expose quatre espaces distincts", () => {
    for (const nav of [
      "LEARNER_NAV",
      "SUPERVISION_NAV",
      "PROGRAM_ADMIN_NAV",
      "PLATFORM_ADMIN_NAV",
    ]) {
      expect(navigation).toContain(nav);
    }
  });

  it("nomme explicitement les deux espaces professionnels", () => {
    expect(navigation).toContain("Espace responsable de stage");
    expect(navigation).toContain("Administration du programme");
    expect(navigation).toContain("Administration plateforme");
  });
});

describe("protection des routes", () => {
  const supervisionRoutes = routeFiles.filter(
    (f) => f.startsWith("espace.encadrement.") && f !== "espace.encadrement.tsx",
  );
  const adminRoutes = routeFiles.filter(
    (f) => f.startsWith("espace.administration.") && f !== "espace.administration.tsx",
  );

  it("chaque écran d'encadrement est gardé par canAccessSupervision", () => {
    expect(supervisionRoutes.length).toBeGreaterThanOrEqual(9);
    for (const file of supervisionRoutes) {
      const source = read(`src/routes/${file}`);
      expect(source).toContain("canAccessSupervision");
      expect(source).toContain("AccessRestricted");
    }
  });

  it("chaque écran d'administration est gardé par canAccessProgramAdministration", () => {
    expect(adminRoutes.length).toBeGreaterThanOrEqual(7);
    for (const file of adminRoutes) {
      const source = read(`src/routes/${file}`);
      expect(source).toContain("canAccessProgramAdministration");
      expect(source).toContain("AccessRestricted");
    }
  });

  it("l'administration plateforme est gardée séparément", () => {
    const source = read("src/routes/espace.plateforme.tsx");
    expect(source).toContain("canAccessPlatformAdministration");
    expect(source).not.toContain("canAccessProgramAdministration");
  });
});

describe("périmètre visible", () => {
  it("l'encadrant ne charge que ses affectations", () => {
    const hook = read("src/features/supervision/useSupervision.ts");
    expect(hook).toContain("listAssignmentsForSupervisor");
    expect(hook).toContain("scopedToSupervisedEnrollments");
  });

  it("l'administration ne charge que le programme actif", () => {
    const hook = read("src/features/administration/useProgramAdmin.ts");
    expect(hook).toContain("activeProgram.id");
    expect(hook).not.toContain("listPrograms()");
  });
});

describe("aucune opération réelle", () => {
  const files = [
    "src/features/supervision/SupervisionMessages.tsx",
    "src/features/administration/AdminCommunications.tsx",
    "src/features/administration/AdminDocuments.tsx",
    "src/features/administration/PlatformAdminView.tsx",
  ].map((p) => [p, read(p)] as const);

  it("n'utilise ni stockage navigateur ni requête réseau", () => {
    for (const [path, source] of files) {
      expect(source, path).not.toContain("localStorage");
      expect(source, path).not.toContain("sessionStorage");
      expect(source, path).not.toContain("fetch(");
    }
  });

  it("affiche explicitement l'absence d'envoi réel", () => {
    expect(read("src/domain/administration.ts")).toContain("Aucun envoi réel");
    expect(read("src/features/administration/AdminCommunications.tsx")).toContain(
      "NO_REAL_SEND_FR",
    );
  });

  it("marque la conservation comme à définir avant backend", () => {
    expect(read("src/features/administration/AdminGovernance.tsx")).toContain("RETENTION_TBD_FR");
  });
});

describe("validation humaine et signature", () => {
  it("la signature de bilan est annoncée comme simulée", () => {
    const reports = read("src/features/supervision/SupervisionReports.tsx");
    expect(reports).toContain("signature simulée");
    expect(reports).toContain("canSignPlacementReport");
  });

  it("aucune compétence réelle sans confirmation humaine", () => {
    const competences = read("src/features/supervision/SupervisionCompetences.tsx");
    expect(competences).toContain("canConfirmRealCompetence");
    expect(competences).toContain("validation humaine");
  });

  it("la validation groupée exige la revue de la synthèse", () => {
    const logs = read("src/features/supervision/SupervisionLogs.tsx");
    expect(logs).toContain("evaluateBulkValidation");
    expect(logs).toContain("Synthèse des");
  });
});
