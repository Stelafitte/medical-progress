import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readEcosGridRows, readEcosGridText, readMaxPoints, readNumber } from "@/domain/ecosGridImport";
import { readXlsxRows } from "@/infrastructure/xlsx/readXlsxRows";

function fixture(name: string): ArrayBuffer {
  const buffer = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe("readNumber / readMaxPoints", () => {
  it("lit les nombres à la française et à l'anglaise", () => {
    expect(readNumber("2,5")).toBe(2.5);
    expect(readNumber("2.5")).toBe(2.5);
    expect(readNumber(" 5 pts")).toBe(5);
    expect(readNumber("")).toBeUndefined();
    expect(readNumber("n/a")).toBeUndefined();
  });

  it("prend le plus grand nombre d'un barème écrit en cotation ou en échelle", () => {
    expect(readMaxPoints("5")).toBe(5);
    expect(readMaxPoints("5 / 2 / 0")).toBe(5);
    expect(readMaxPoints("0–4")).toBe(4);
    expect(readMaxPoints("0-4")).toBe(4);
    expect(readMaxPoints("")).toBeUndefined();
  });
});

describe("readEcosGridRows", () => {
  it("garde les items dans l'ordre, écarte TOTAL et recalcule le score", () => {
    const reading = readEcosGridRows([
      ["Item", "Barème", "Note obtenue"],
      ["Description de la dyspnée", "5", "5"],
      ["Anamnèse", "4", "3"],
      ["TOTAL", "9", "99"],
    ]);
    expect(reading.errors).toEqual([]);
    expect(reading.items).toEqual([
      { label: "Description de la dyspnée", maxPoints: 5, points: 5 },
      { label: "Anamnèse", maxPoints: 4, points: 3 },
    ]);
    expect(reading.score).toBe(8);
    expect(reading.maxScore).toBe(9);
    expect(reading.skipped).toHaveLength(1);
    expect(reading.skipped[0]).toContain("TOTAL");
  });

  it("retrouve l'en-tête sous un titre et tolère des colonnes dans un autre ordre", () => {
    const reading = readEcosGridRows([
      ["Grille de notation — ECOS cardio cas 4"],
      [],
      ["Note obtenue", "Item", "Barème"],
      ["2", "Recherche syncope", "5"],
    ]);
    expect(reading.errors).toEqual([]);
    expect(reading.items).toEqual([{ label: "Recherche syncope", maxPoints: 5, points: 2 }]);
  });

  it("refuse une note hors barème et une note manquante, sans deviner", () => {
    const reading = readEcosGridRows([
      ["Item", "Barème", "Note obtenue"],
      ["Trop haut", "5", "6"],
      ["Sans note", "5", ""],
      ["Correct", "5", "5"],
    ]);
    expect(reading.errors).toHaveLength(2);
    expect(reading.errors[0]).toContain("hors du barème");
    expect(reading.errors[1]).toContain("manquante");
    // La ligne correcte est lue, mais l'écran doit bloquer tant que `errors` n'est pas vide.
    expect(reading.items).toHaveLength(1);
  });

  it("signale une grille vide ou sans colonnes reconnues", () => {
    expect(readEcosGridRows([]).errors[0]).toContain("vide");
    const noNumbers = readEcosGridRows([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(noNumbers.items).toEqual([]);
    expect(noNumbers.errors.length).toBeGreaterThan(0);
  });
});

describe("readEcosGridText — tableau du DEBRIEF collé depuis ChatGPT", () => {
  it("lit un tableau markdown avec la cotation « 5 / 2 / 0 » et l'échelle « 0–4 »", () => {
    const text = [
      "| Item | Barème | Note obtenue |",
      "| --- | --- | --- |",
      "| Description de la dyspnée à l’effort | 5 / 2 / 0 | 5 |",
      "| Anamnèse | 0–4 | 3 |",
      "| TOTAL | 9 | 8 |",
    ].join("\n");
    const reading = readEcosGridText(text);
    expect(reading.errors).toEqual([]);
    expect(reading.items).toEqual([
      { label: "Description de la dyspnée à l’effort", maxPoints: 5, points: 5 },
      { label: "Anamnèse", maxPoints: 4, points: 3 },
    ]);
  });

  it("lit un tableau copié avec des tabulations", () => {
    const text = "Item\tBarème\tNote obtenue\nRecueil des FDR CV\t5\t2\n";
    const reading = readEcosGridText(text);
    expect(reading.errors).toEqual([]);
    expect(reading.items).toEqual([{ label: "Recueil des FDR CV", maxPoints: 5, points: 2 }]);
  });
});

describe("readXlsxRows + readEcosGridRows — le fichier du GPT", () => {
  it("lit le classeur tel que le GPT le rend (chaînes en ligne, préfixe x:, feuille Légende ignorée)", async () => {
    const rows = await readXlsxRows(fixture("grille_gpt_cas4.xlsx"));
    expect(rows[0]).toEqual(["Item", "Barème", "Note obtenue"]);
    const reading = readEcosGridRows(rows);
    expect(reading.errors).toEqual([]);
    expect(reading.items).toHaveLength(21);
    expect(reading.items[0]).toEqual({
      label: "Description de la dyspnée à l’effort",
      maxPoints: 5,
      points: 5,
    });
    expect(reading.items[20]).toEqual({ label: "Explorations envisagées", maxPoints: 4, points: 3 });
    expect(reading.maxScore).toBe(101);
    expect(reading.score).toBe(73);
    expect(reading.skipped.some((s) => s.includes("TOTAL"))).toBe(true);
  });

  it("lit aussi un classeur écrit par Excel (chaînes partagées, décimales)", async () => {
    const rows = await readXlsxRows(fixture("grille_excel.xlsx"));
    const reading = readEcosGridRows(rows);
    expect(reading.errors).toEqual([]);
    expect(reading.items).toEqual([
      { label: "Description de la dyspnée à l’effort", maxPoints: 5, points: 5 },
      { label: "Anamnèse", maxPoints: 4, points: 2.5 },
    ]);
  });

  it("refuse un fichier qui n'est pas un zip", async () => {
    await expect(readXlsxRows(new TextEncoder().encode("pas un classeur").buffer)).rejects.toThrow(
      /xlsx/,
    );
  });
});
