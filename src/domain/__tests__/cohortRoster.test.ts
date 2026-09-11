import { describe, expect, it } from "vitest";
import {
  ROSTER_TEMPLATE_CSV,
  buildCohortExportCsv,
  buildRosterPreview,
  detectColumnMapping,
  parseDelimitedRoster,
} from "@/domain/cohortRoster";

describe("import de promotion", () => {
  it("reconnaît les en-têtes usuels, accentués ou non", () => {
    const mapping = detectColumnMapping(["Nom", "Prenom", "E-mail", "Matricule", "Groupe"]);
    expect(mapping).toMatchObject({
      lastName: 0,
      firstName: 1,
      email: 2,
      studentNumber: 3,
      group: 4,
    });
  });

  it("détecte le séparateur et ignore les lignes vides", () => {
    const parsed = parseDelimitedRoster("Nom,Prenom,Email\n\nBenali,Karim,k@ex.org\n");
    expect(parsed.delimiter).toBe(",");
    expect(parsed.rows).toHaveLength(1);
  });

  it("accepte le modèle fourni", () => {
    const preview = buildRosterPreview({ text: ROSTER_TEMPLATE_CSV });
    expect(preview.missingRequiredColumns).toEqual([]);
    expect(preview.readyCount).toBe(2);
    expect(preview.canImport).toBe(true);
  });

  it("classe doublons internes, inscriptions existantes et erreurs", () => {
    const text = [
      "Nom;Prénom;Email",
      "Benali;Karim;karim@ex.org",
      "Benali;Karim;KARIM@ex.org",
      "Duval;Léa;lea@ex.org",
      "Nguyen;;nguyen@ex.org",
      "Roux;Paul;pas-un-email",
    ].join("\n");

    const preview = buildRosterPreview({ text, existingEmails: ["lea@ex.org"] });
    expect(preview.readyCount).toBe(1);
    expect(preview.duplicateCount).toBe(1);
    expect(preview.alreadyEnrolledCount).toBe(1);
    expect(preview.invalidCount).toBe(2);
    expect(preview.canImport).toBe(true);
  });

  it("bloque l'import quand une colonne obligatoire manque", () => {
    const preview = buildRosterPreview({ text: "Nom;Groupe\nBenali;A" });
    expect(preview.missingRequiredColumns).toContain("email");
    expect(preview.canImport).toBe(false);
  });
});

describe("export de promotion", () => {
  it("sérialise en CSV en échappant les séparateurs", () => {
    const csv = buildCohortExportCsv([
      {
        fullName: "Benali; Karim",
        email: "karim@ex.org",
        cohortLabel: "Promotion 2026",
        academicYear: "2026-2027",
        enrollmentStatus: "active",
      },
    ]);
    const [header, row] = csv.split("\n");
    expect(header).toContain("Nom complet");
    expect(row).toContain('"Benali; Karim"');
  });
});

describe("lecture adaptative : le fichier arrive comme il veut", () => {
  it("retrouve l'en-tête quand le fichier commence par un titre et une ligne de service", () => {
    const parsed = parseDelimitedRoster(
      [
        "Liste des étudiants DFASM1 - Cardiologie",
        "Export du 31/08/2026 - Scolarité",
        "Nom;Prénom;Email",
        "Benali;Karim;k@ex.org",
      ].join("\n"),
    );
    expect(parsed.headerLine).toBe(3);
    expect(parsed.headers).toEqual(["Nom", "Prénom", "Email"]);
    expect(parsed.rows).toHaveLength(1);
  });

  it("choisit le séparateur régulier, pas celui qui apparaît le plus une fois", () => {
    // Le libellé du terrain contient des virgules : la virgule découpe
    // beaucoup, mais irrégulièrement. Le point-virgule est le vrai séparateur.
    const parsed = parseDelimitedRoster(
      [
        "Nom;Prénom;Terrain",
        "Benali;Karim;CHU Nord, Cardiologie, USIC",
        "Duval;Léa;CHU Sud, Échocardiographie",
      ].join("\n"),
    );
    expect(parsed.delimiter).toBe(";");
    expect(parsed.rows[0]).toHaveLength(3);
  });

  it("sépare nom et prénom d'une colonne unique quand les capitales le disent", () => {
    const preview = buildRosterPreview({
      text: ["Étudiant;Email", "DUPONT Jean;j@ex.org", "Léa DUVAL;l@ex.org"].join("\n"),
    });
    expect(preview.candidates[0]).toMatchObject({ lastName: "DUPONT", firstName: "Jean" });
    expect(preview.candidates[1]).toMatchObject({ lastName: "DUVAL", firstName: "Léa" });
    expect(preview.nameOrderAssumed).toBe(false);
    expect(preview.readyCount).toBe(2);
  });

  it("comprend « Nom, Prénom » sans hésiter", () => {
    const preview = buildRosterPreview({
      text: ["Nom complet;Email", "Dupont, Jean;j@ex.org"].join("\n"),
    });
    expect(preview.candidates[0]).toMatchObject({ lastName: "Dupont", firstName: "Jean" });
    expect(preview.candidates[0]!.nameOrderAssumed).toBeUndefined();
  });

  it("suppose l'ordre « NOM Prénom » sans signal, et le dit au lieu de le taire", () => {
    const preview = buildRosterPreview({
      text: ["Nom complet;Email", "Dupont Jean;j@ex.org"].join("\n"),
    });
    expect(preview.candidates[0]).toMatchObject({
      lastName: "Dupont",
      firstName: "Jean",
      nameOrderAssumed: true,
    });
    expect(preview.nameOrderAssumed).toBe(true);
    expect(preview.issues.some((i) => i.message.includes("supposé"))).toBe(true);
  });

  it("garde la particule avec le nom", () => {
    const preview = buildRosterPreview({
      text: ["Nom complet;Email", "de la Fontaine Jean;j@ex.org"].join("\n"),
    });
    expect(preview.candidates[0]!.lastName).toBe("de la Fontaine");
    expect(preview.candidates[0]!.firstName).toBe("Jean");
  });
});

describe("motif d'adresse : fabriqué, donc signalé", () => {
  const FILE = [
    "Nom;Prénom;N° étudiant",
    "Benoît;Léa;20250114",
    "O'Brien;Jean-Pierre;20250115",
  ].join("\n");

  it("compose les adresses quand le fichier n'en porte aucune", () => {
    const preview = buildRosterPreview({
      text: FILE,
      emailPattern: "{prenom}.{nom}@etu.u-bordeaux.fr",
    });
    expect(preview.candidates[0]!.email).toBe("lea.benoit@etu.u-bordeaux.fr");
    // Apostrophe supprimée, tiret conservé : l'adresse reste valide.
    expect(preview.candidates[1]!.email).toBe("jean-pierre.obrien@etu.u-bordeaux.fr");
    expect(preview.derivedEmailCount).toBe(2);
    expect(preview.candidates[0]!.emailDerived).toBe(true);
    expect(preview.readyCount).toBe(2);
  });

  it("marque chaque adresse composée d'un avertissement, jamais en silence", () => {
    const preview = buildRosterPreview({ text: FILE, emailPattern: "{p}{nom}@ex.org" });
    expect(preview.candidates[0]!.email).toBe("lbenoit@ex.org");
    expect(
      preview.issues.filter((i) => i.level === "warning" && i.message.includes("composée")),
    ).toHaveLength(2);
  });

  it("refuse l'import sans colonne e-mail ET sans motif", () => {
    const preview = buildRosterPreview({ text: FILE });
    expect(preview.missingRequiredColumns).toContain("email");
    expect(preview.canImport).toBe(false);
  });

  it("ne recompose jamais une adresse déjà présente dans le fichier", () => {
    const preview = buildRosterPreview({
      text: ["Nom;Prénom;Email", "Benali;Karim;karim@chu.fr"].join("\n"),
      emailPattern: "{prenom}.{nom}@ex.org",
    });
    expect(preview.candidates[0]!.email).toBe("karim@chu.fr");
    expect(preview.derivedEmailCount).toBe(0);
  });
});
