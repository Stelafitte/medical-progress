import { describe, expect, it } from "vitest";
import { groupByTheme, HORS_CHAPITRE_KEY } from "../outcomeGrouping";
import type { OutcomeTheme, OutcomeThemeId } from "../types";

const theme = (id: string, label: string, position: number): OutcomeTheme => ({
  id: id as OutcomeThemeId,
  createdAt: "2026-01-01T00:00:00Z",
  provenance: { sourceSystem: "native" },
  programId: "prog-test",
  label,
  description: "",
  position,
});

interface Ligne {
  code: string;
  themeId?: OutcomeThemeId;
}

const themes = [theme("t-2", "Chapitre 2", 2), theme("t-1", "Chapitre 1", 1)];
const idDe = (l: Ligne) => l.themeId;

describe("regroupement par chapitre", () => {
  it("classe les chapitres dans l'ordre du Concepteur, pas dans celui des lignes", () => {
    const groupes = groupByTheme<Ligne>(
      [
        { code: "B", themeId: "t-2" as OutcomeThemeId },
        { code: "A", themeId: "t-1" as OutcomeThemeId },
      ],
      themes,
      idDe,
    );
    expect(groupes.map((g) => g.label)).toEqual(["Chapitre 1", "Chapitre 2"]);
  });

  /** Les acquis non rangés doivent rester visibles — mais jamais en tête. */
  it("place « Hors chapitre » en dernier", () => {
    const groupes = groupByTheme<Ligne>(
      [{ code: "X" }, { code: "A", themeId: "t-1" as OutcomeThemeId }],
      themes,
      idDe,
    );
    expect(groupes.map((g) => g.key)).toEqual(["t-1", HORS_CHAPITRE_KEY]);
  });

  it("ne produit pas de groupe « Hors chapitre » quand tout est rangé", () => {
    const groupes = groupByTheme<Ligne>(
      [{ code: "A", themeId: "t-1" as OutcomeThemeId }],
      themes,
      idDe,
    );
    expect(groupes).toHaveLength(1);
    expect(groupes[0]?.key).toBe("t-1");
  });

  /** Un themeId qui ne correspond à aucun chapitre connu n'efface pas la ligne. */
  it("range sous « Hors chapitre » un acquis dont le chapitre est inconnu", () => {
    const groupes = groupByTheme<Ligne>(
      [{ code: "A", themeId: "t-inconnu" as OutcomeThemeId }],
      themes,
      idDe,
    );
    expect(groupes).toHaveLength(1);
    expect(groupes[0]?.key).toBe(HORS_CHAPITRE_KEY);
    expect(groupes[0]?.items).toHaveLength(1);
  });

  it("conserve toutes les lignes", () => {
    const lignes: Ligne[] = [
      { code: "A", themeId: "t-1" as OutcomeThemeId },
      { code: "B", themeId: "t-1" as OutcomeThemeId },
      { code: "C", themeId: "t-2" as OutcomeThemeId },
      { code: "D" },
    ];
    const groupes = groupByTheme<Ligne>(lignes, themes, idDe);
    expect(groupes.flatMap((g) => g.items.map((i) => i.code)).sort()).toEqual(["A", "B", "C", "D"]);
  });
});
