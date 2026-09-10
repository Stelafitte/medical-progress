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
    expect(navigation).toContain("Supervision des stages");
    expect(navigation).toContain("Administration des programmes");
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
    /* SEPT, ET PLUS NEUF (10/09) : « Cas et questions » et « Alertes » ont ete
       supprimes -- le premier n'avait aucun contenu, le second devenait une
       seconde boite que personne n'ouvre. Le compte reste verrouille pour que
       la disparition d'un onglet passe par une decision, pas par un oubli. */
    expect(supervisionRoutes.length).toBeGreaterThanOrEqual(7);
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
      // Les anciennes URL conservées ne rendent rien : elles redirigent vers
      // l'onglet courant, lui-même gardé.
      if (source.includes("throw redirect(")) {
        expect(source).toContain("/espace/administration/");
        continue;
      }
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
    expect(read("src/features/administration/AccessGrantSection.tsx")).toContain(
      "RETENTION_TBD_FR",
    );
  });
});

/*
 * CES TROIS CONTRATS GARDAIENT LA MAQUETTE (« signature simulée »,
 * `canSignPlacementReport`, `evaluateBulkValidation`) : ils verifiaient que les
 * ecrans d'encadrement ANNONÇAIENT ne rien faire. Depuis le 10/09 ils font, et
 * la garde change de sens -- elle verifie desormais que le geste passe par la
 * base, et par la seule fonction habilitee. Ce qui doit rester impossible n'a
 * pas change : une competence confirmee sans decision humaine, une connaissance
 * validee, un stage clos sans ecriture.
 */
describe("validation humaine et decision", () => {
  it("le bilan de fin de stage écrit une vraie décision, jamais une signature simulée", () => {
    const reports = read("src/features/supervision/SupervisionReports.tsx");
    expect(reports).toContain("validateStageLogBlock");
    expect(reports).not.toContain("signature simulée");
  });

  it("aucune compétence réelle sans confirmation humaine", () => {
    const competences = read("src/features/supervision/SupervisionCompetences.tsx");
    /* La confirmation est un geste humain explicite, porte par la fonction
       `validate_outcome_declaration` : aucun chemin ne valide en masse. */
    expect(competences).toContain("validateOutcomeDeclaration");
    /* Les connaissances theoriques sont hors champ. Le filtre vit dans
       `competencesDuProgramme`, une seule fois, pour que les quatre ecrans
       d'encadrement ne puissent pas en donner quatre versions -- et la base le
       refuse de toute façon. */
    expect(competences).toContain("competencesDuProgramme");
    expect(read("src/features/supervision/useSupervision.ts")).toContain(
      'nature !== "knowledge"',
    );
  });

  it("la décision de carnet porte sur une période de présence", () => {
    const logs = read("src/features/supervision/SupervisionLogs.tsx");
    expect(logs).toContain("PresenceCalendar");
    const calendrier = read("src/features/supervision/PresenceCalendar.tsx");
    expect(calendrier).toContain("validateStageLogBlock");
    expect(calendrier).toContain("coversFrom");
  });
});
