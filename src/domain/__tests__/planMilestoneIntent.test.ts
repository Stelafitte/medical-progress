import { describe, expect, it } from "vitest";
import { planMilestoneIntent, type PlanMilestone } from "@/domain/acquisitionPlan";
import type { CohortId, OutcomeId, ProgramId } from "@/domain/types";

const THEMES = [
  { id: "t-1", label: "Valvulopathies" },
  { id: "t-2", label: "Troubles du rythme" },
];

function saved(label: string, weekOffset: number, weekOffsetEnd?: number): PlanMilestone {
  return {
    id: `m-${label}`,
    cohortId: "c-1" as CohortId,
    programId: "p-1" as ProgramId,
    label,
    weekOffset,
    ...(weekOffsetEnd === undefined ? {} : { weekOffsetEnd }),
    official: false,
    position: 0,
    outcomeIds: [] as readonly OutcomeId[],
  };
}

describe("ce qu'un enregistrement de rétroplanning va faire", () => {
  it("crée un jalon pour un chapitre daté qui n'en avait pas", () => {
    const intent = planMilestoneIntent(THEMES, { "t-1": { kind: "week", from: "4" } }, []);
    expect(intent.toWrite).toEqual([{ themeId: "t-1", label: "Valvulopathies", weekOffset: 4 }]);
    expect(intent.toDelete).toEqual([]);
  });

  it("reprend le jalon existant au lieu d'en créer un second", () => {
    const intent = planMilestoneIntent(THEMES, { "t-1": { kind: "week", from: "6" } }, [
      saved("Valvulopathies", 4),
    ]);
    expect(intent.toWrite[0]?.milestoneId).toBe("m-Valvulopathies");
    expect(intent.toWrite[0]?.weekOffset).toBe(6);
  });

  it("SUPPRIME le jalon d'un chapitre repassé en « non daté »", () => {
    // Sans cela, « non daté » mentirait : l'échéance resterait dans le
    // passeport de l'étudiant sans que rien à l'écran ne le dise.
    const intent = planMilestoneIntent(THEMES, { "t-1": { kind: "undated" } }, [
      saved("Valvulopathies", 4),
    ]);
    expect(intent.toDelete.map((m) => m.id)).toEqual(["m-Valvulopathies"]);
    expect(intent.toWrite).toEqual([]);
  });

  it("supprime aussi quand la semaine a été effacée du champ", () => {
    const intent = planMilestoneIntent(THEMES, { "t-1": { kind: "week", from: "" } }, [
      saved("Valvulopathies", 4),
    ]);
    expect(intent.toDelete.map((m) => m.id)).toEqual(["m-Valvulopathies"]);
  });

  it("ne supprime rien quand le chapitre n'avait pas de jalon", () => {
    const intent = planMilestoneIntent(THEMES, { "t-1": { kind: "undated" } }, []);
    expect(intent.toDelete).toEqual([]);
    expect(intent.toWrite).toEqual([]);
  });

  it("garde la semaine 0 : c'est la semaine d'accueil, pas un champ vide", () => {
    const intent = planMilestoneIntent(THEMES, { "t-1": { kind: "week", from: "0" } }, [
      saved("Valvulopathies", 4),
    ]);
    expect(intent.toDelete).toEqual([]);
    expect(intent.toWrite[0]?.weekOffset).toBe(0);
  });

  it("porte la fin de période quand il y en a une", () => {
    const intent = planMilestoneIntent(
      THEMES,
      { "t-1": { kind: "period", from: "4", to: "6" } },
      [],
    );
    expect(intent.toWrite[0]?.weekOffsetEnd).toBe(6);
  });

  it("laisse la fin ABSENTE, pas undefined, sur une semaine unique", () => {
    // `exactOptionalPropertyTypes` : la distinction n'est pas cosmétique.
    const intent = planMilestoneIntent(THEMES, { "t-1": { kind: "week", from: "4" } }, []);
    expect(intent.toWrite[0] && "weekOffsetEnd" in intent.toWrite[0]).toBe(false);
  });

  it("NE SUPPRIME PAS un jalon orphelin, il le signale", () => {
    // Un chapitre renommé laisse un jalon que plus aucun libellé ne réclame.
    // L'effacer d'office ferait perdre une planification sur un renommage.
    const intent = planMilestoneIntent(THEMES, {}, [saved("Ancien nom du chapitre", 3)]);
    expect(intent.toDelete).toEqual([]);
    expect(intent.orphans.map((m) => m.label)).toEqual(["Ancien nom du chapitre"]);
  });

  it("respecte l'ordre des chapitres reçus", () => {
    const intent = planMilestoneIntent(
      THEMES,
      { "t-2": { kind: "week", from: "1" }, "t-1": { kind: "week", from: "9" } },
      [],
    );
    expect(intent.toWrite.map((w) => w.themeId)).toEqual(["t-1", "t-2"]);
  });
});
