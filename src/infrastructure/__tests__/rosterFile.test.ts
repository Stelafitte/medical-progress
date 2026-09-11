import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildRosterPreview } from "@/domain/cohortRoster";
import { readRosterFile } from "@/infrastructure/text/rosterFile";

function fileFrom(name: string, bytes: Uint8Array): File {
  return new File([bytes.slice()], name);
}

/** Classeur minimal, tel qu'Excel l'écrit : chaînes partagées + une feuille. */
function workbook(rows: readonly (readonly string[])[]): Uint8Array {
  const shared: string[] = [];
  const indexOf = (value: string) => {
    const at = shared.indexOf(value);
    if (at >= 0) return at;
    shared.push(value);
    return shared.length - 1;
  };
  const column = (i: number) => String.fromCharCode(65 + i);

  const sheetRows = rows
    .map((cells, r) => {
      const body = cells
        .map((value, c) =>
          value === "" ? "" : `<c r="${column(c)}${r + 1}" t="s"><v>${indexOf(value)}</v></c>`,
        )
        .join("");
      return `<row r="${r + 1}">${body}</row>`;
    })
    .join("");

  const sheet = `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`;
  const strings =
    `<?xml version="1.0"?><sst count="${shared.length}">` +
    shared
      .map((v) => `<si><t>${v.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`)
      .join("") +
    `</sst>`;

  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/sharedStrings.xml": strToU8(strings),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

describe("lecture d'un fichier de promotion", () => {
  it("lit un .xlsx sans bibliothèque tierce, et rend du texte délimité", async () => {
    const bytes = workbook([
      ["Nom", "Prénom", "Email"],
      ["Benali", "Karim", "karim@ex.org"],
      ["Duval", "Léa", "lea@ex.org"],
    ]);
    const read = await readRosterFile(fileFrom("promo.xlsx", bytes));

    expect(read.source).toBe("xlsx");
    expect(read.sheetName).toBe("xl/worksheets/sheet1.xml");

    const preview = buildRosterPreview({ text: read.text });
    expect(preview.readyCount).toBe(2);
    expect(preview.candidates[1]).toMatchObject({ firstName: "Léa", email: "lea@ex.org" });
  });

  it("replace les cellules vides à leur colonne, sans décaler la ligne", async () => {
    const bytes = workbook([
      ["Nom", "Prénom", "N° étudiant", "Email"],
      ["Benali", "Karim", "", "karim@ex.org"],
    ]);
    const read = await readRosterFile(fileFrom("promo.xlsx", bytes));
    const preview = buildRosterPreview({ text: read.text });

    expect(preview.candidates[0]).toMatchObject({
      lastName: "Benali",
      firstName: "Karim",
      email: "karim@ex.org",
    });
  });

  it("échappe les cellules qui contiennent le séparateur", async () => {
    const bytes = workbook([
      ["Nom", "Prénom", "Email", "Terrain"],
      ["Benali", "Karim", "k@ex.org", "CHU Nord; Cardiologie"],
    ]);
    const read = await readRosterFile(fileFrom("promo.xlsx", bytes));

    // Le point-virgule est protégé par des guillemets dans le texte produit...
    expect(read.text).toContain('"CHU Nord; Cardiologie"');

    // ...et relu sans être coupé en deux colonnes.
    const preview = buildRosterPreview({ text: read.text });
    expect(preview.candidates[0]!.placementWish).toBe("CHU Nord; Cardiologie");
  });

  it("lit un CSV encodé en Windows-1252 sans abîmer les accents", async () => {
    // « Benoît » tel qu'Excel français l'écrit : 0xEE pour « î ».
    const latin1 = Uint8Array.from([
      ...strToU8("Nom;Prenom;Email\nBeno"),
      0xee,
      ...strToU8("t;L"),
      0xe9,
      ...strToU8("a;lea@ex.org\n"),
    ]);
    const read = await readRosterFile(fileFrom("promo.csv", latin1));

    expect(read.encoding).toBe("windows-1252");
    expect(read.text).toContain("Benoît");

    const preview = buildRosterPreview({ text: read.text });
    expect(preview.candidates[0]).toMatchObject({ lastName: "Benoît", firstName: "Léa" });
  });

  it("garde l'UTF-8 quand le fichier est déjà correct", async () => {
    const read = await readRosterFile(
      fileFrom("promo.csv", strToU8("Nom;Prenom;Email\nBenoît;Léa;lea@ex.org\n")),
    );
    expect(read.encoding).toBe("utf-8");
    expect(read.text).toContain("Benoît");
  });
});
