import { describe, expect, it } from "vitest";
import {
  chronologicalThemeOrder,
  milestoneGantt,
  type PlanMilestone,
} from "@/domain/acquisitionPlan";
import type { CohortId, OutcomeId, ProgramId } from "@/domain/types";

function saved(
  label: string,
  weekOffset: number,
  options: { weekOffsetEnd?: number; official?: boolean; outcomes?: number } = {},
): PlanMilestone {
  return {
    id: `m-${label}`,
    cohortId: "c-1" as CohortId,
    programId: "p-1" as ProgramId,
    label,
    weekOffset,
    ...(options.weekOffsetEnd === undefined ? {} : { weekOffsetEnd: options.weekOffsetEnd }),
    official: options.official ?? false,
    position: 0,
    outcomeIds: Array.from(
      { length: options.outcomes ?? 0 },
      (_, index) => `o-${label}-${index}` as OutcomeId,
    ),
  };
}

const THEMES = [
  { id: "t-1", label: "Valvulopathies", position: 0 },
  { id: "t-2", label: "Insuffisance cardiaque", position: 1 },
  { id: "t-3", label: "Péricardite", position: 2 },
];

describe("l'ordre chronologique des chapitres", () => {
  it("classe les chapitres par la semaine de leur jalon enregistré", () => {
    const order = chronologicalThemeOrder(THEMES, [
      saved("Péricardite", 2),
      saved("Valvulopathies", 9),
      saved("Insuffisance cardiaque", 5),
    ]);
    expect(order.map((theme) => theme.id)).toEqual(["t-3", "t-2", "t-1"]);
  });

  it("renvoie les chapitres sans jalon à la fin, dans l'ordre du référentiel", () => {
    // Ils n'ont pas de place dans une chronologie : les intercaler mêlerait
    // deux logiques de tri dans une même liste.
    const order = chronologicalThemeOrder(THEMES, [saved("Péricardite", 7)]);
    expect(order.map((theme) => theme.id)).toEqual(["t-3", "t-1", "t-2"]);
  });

  it("départage deux jalons de la même semaine par l'ordre du référentiel", () => {
    const order = chronologicalThemeOrder(THEMES, [
      saved("Péricardite", 3),
      saved("Valvulopathies", 3),
    ]);
    expect(order.map((theme) => theme.id)).toEqual(["t-1", "t-3", "t-2"]);
  });
});

describe("le rétroplanning en barres", () => {
  it("fait partir l'échelle de la semaine 0, même si rien n'y est posé", () => {
    // Un rétroplanning qui ne commence qu'en semaine 3 doit SE VOIR comme tel.
    const gantt = milestoneGantt([saved("Valvulopathies", 3)], "2026-09-01");
    expect(gantt.bars[0]?.weekStart).toBe(3);
    expect(gantt.lastWeek).toBe(3);
  });

  it("donne une fin à un jalon ponctuel et les dates de la promotion", () => {
    const gantt = milestoneGantt([saved("Valvulopathies", 4, { outcomes: 12 })], "2026-09-01");
    const bar = gantt.bars[0];
    expect(bar?.weekEnd).toBe(4);
    expect(bar?.startsOn).toBe("2026-09-29");
    expect(bar?.endsOn).toBe("2026-09-29");
    expect(bar?.outcomeCount).toBe(12);
  });

  it("conserve la fin d'un jalon étalé sur une période", () => {
    const gantt = milestoneGantt(
      [saved("Valvulopathies", 2, { weekOffsetEnd: 5, official: true })],
      "2026-09-01",
    );
    expect(gantt.bars[0]?.weekEnd).toBe(5);
    expect(gantt.bars[0]?.endsOn).toBe("2026-10-06");
    expect(gantt.bars[0]?.official).toBe(true);
    expect(gantt.lastWeek).toBe(5);
  });

  it("trie les barres par semaine, puis par intitulé", () => {
    const gantt = milestoneGantt(
      [saved("Péricardite", 5), saved("Athérome", 5), saved("Valvulopathies", 1)],
      "2026-09-01",
    );
    expect(gantt.bars.map((bar) => bar.label)).toEqual([
      "Valvulopathies",
      "Athérome",
      "Péricardite",
    ]);
  });

  it("étend l'échelle jusqu'à la fin de la promotion, même sans jalon à la fin", () => {
    const gantt = milestoneGantt([saved("Valvulopathies", 2)], "2026-09-01", 10);
    expect(gantt.lastWeek).toBe(10);
  });

  it("garde VISIBLE un jalon posé après la fin de la promotion", () => {
    // Une échelle qui s'arrêterait à la fin du stage ferait disparaître
    // précisément les barres à corriger.
    const gantt = milestoneGantt([saved("Valvulopathies", 11)], "2026-09-01", 10);
    expect(gantt.lastWeek).toBe(11);
  });

  it("garde une échelle non nulle quand il n'y a rien à montrer", () => {
    // Une échelle de largeur zéro rendrait toute barre invisible.
    const gantt = milestoneGantt([], "2026-09-01");
    expect(gantt.bars).toEqual([]);
    expect(gantt.lastWeek).toBe(1);
  });
});
