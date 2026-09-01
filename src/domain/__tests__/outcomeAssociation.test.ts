import { describe, expect, it } from "vitest";
import { outcomeAssociationItems, sortOutcomesForAssociation } from "@/domain/outcomeAssociation";
import type {
  CurriculumVersionId,
  Outcome,
  OutcomeId,
  OutcomeTheme,
  OutcomeThemeId,
  ProgramId,
} from "@/domain/types";

const PROGRAM = "prog-1" as ProgramId;
const VERSION = "ver-1" as CurriculumVersionId;

function theme(id: string, label: string, position: number): OutcomeTheme {
  return {
    id: id as OutcomeThemeId,
    createdAt: "2026-09-01T00:00:00Z",
    provenance: { sourceSystem: "native" },
    programId: PROGRAM,
    label,
    description: "",
    position,
  };
}

function outcome(partial: Partial<Outcome> & { code: string }): Outcome {
  return {
    id: `o-${partial.code}` as OutcomeId,
    createdAt: "2026-09-01T00:00:00Z",
    provenance: { sourceSystem: "native" },
    programId: PROGRAM,
    curriculumVersionId: VERSION,
    label: `Intitulé ${partial.code}`,
    description: "",
    nature: "knowledge",
    domain: "",
    targetMastery: "intermediate",
    retainedAt: null,
    ...partial,
  };
}

const THEMES = [
  theme("t-b", "Item 232 — Fibrillation atriale", 2),
  theme("t-a", "Item 231 — ECG", 1),
];

describe("ordonner les acquis d'une liste d'association", () => {
  it("suit la position du CHAPITRE, pas l'ordre alphabétique de son libellé", () => {
    const sorted = sortOutcomesForAssociation(
      [
        outcome({ code: "K-2", themeId: "t-b" as OutcomeThemeId, position: 1 }),
        outcome({ code: "K-1", themeId: "t-a" as OutcomeThemeId, position: 1 }),
      ],
      THEMES,
    );
    expect(sorted.map((o) => o.code)).toEqual(["K-1", "K-2"]);
  });

  it("respecte la position à l'intérieur d'un chapitre", () => {
    const sorted = sortOutcomesForAssociation(
      [
        outcome({ code: "K-9", themeId: "t-a" as OutcomeThemeId, position: 3 }),
        outcome({ code: "K-8", themeId: "t-a" as OutcomeThemeId, position: 1 }),
      ],
      THEMES,
    );
    expect(sorted.map((o) => o.code)).toEqual(["K-8", "K-9"]);
  });

  it("range les acquis sans chapitre APRÈS ceux qui en ont un", () => {
    const sorted = sortOutcomesForAssociation(
      [outcome({ code: "K-0" }), outcome({ code: "K-1", themeId: "t-a" as OutcomeThemeId })],
      THEMES,
    );
    expect(sorted.map((o) => o.code)).toEqual(["K-1", "K-0"]);
  });

  it("compare les codes numériquement quand rien d'autre ne départage", () => {
    // "K-10" après "K-9" : un tri de chaînes ferait l'inverse.
    const sorted = sortOutcomesForAssociation(
      [outcome({ code: "K-10" }), outcome({ code: "K-9" })],
      THEMES,
    );
    expect(sorted.map((o) => o.code)).toEqual(["K-9", "K-10"]);
  });
});

describe("projeter un acquis en ligne de liste", () => {
  it("porte le chapitre et le rang, pour que la liste se replie et se filtre", () => {
    const [item] = outcomeAssociationItems(
      [outcome({ code: "K-1", themeId: "t-a" as OutcomeThemeId, knowledgeRank: "A" })],
      THEMES,
    );
    expect(item?.groupLabel).toBe("Item 231 — ECG");
    expect(item?.rank).toBe("A");
    expect(item?.label).toBe("K-1 — Intitulé K-1");
  });

  it("n'invente pas de rang là où il n'y en a pas", () => {
    // `exactOptionalPropertyTypes` : la clé doit être ABSENTE, pas undefined.
    const [item] = outcomeAssociationItems(
      [outcome({ code: "C-1", nature: "real_competence" })],
      THEMES,
    );
    expect(item && "rank" in item).toBe(false);
    expect(item && "groupLabel" in item).toBe(false);
  });

  it("dit « retenu » d'après retainedAt et de rien d'autre", () => {
    const items = outcomeAssociationItems(
      [
        outcome({ code: "K-1", retainedAt: "2026-09-01T00:00:00Z" }),
        outcome({ code: "K-2", retainedAt: null }),
      ],
      THEMES,
    );
    expect(items.map((i) => i.retained)).toEqual([true, false]);
  });

  it("nomme le chapitre manquant plutôt que de perdre le repli", () => {
    const [item] = outcomeAssociationItems(
      [outcome({ code: "K-1", themeId: "t-inconnu" as OutcomeThemeId })],
      THEMES,
    );
    expect(item?.groupLabel).toBe("Chapitre inconnu");
  });
});
