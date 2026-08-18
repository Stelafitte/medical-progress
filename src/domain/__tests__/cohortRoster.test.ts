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
