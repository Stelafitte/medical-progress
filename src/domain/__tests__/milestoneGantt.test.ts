import { describe, expect, it } from "vitest";
import {
  chronologicalThemeOrder,
  dragMilestoneTiming,
  milestoneGanttBars,
  type MilestoneTiming,
  type PlanMilestone,
} from "@/domain/acquisitionPlan";
import type { CohortId, ProgramId } from "@/domain/types";

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
    outcomeIds: [],
  };
}

const THEMES = [
  { id: "t-1", label: "Valvulopathies", position: 0 },
  { id: "t-2", label: "Insuffisance cardiaque", position: 1 },
  { id: "t-3", label: "Péricardite", position: 2 },
];

const week = (from: number): MilestoneTiming => ({ kind: "week", from: String(from) });
const period = (from: number, to: number): MilestoneTiming => ({
  kind: "period",
  from: String(from),
  to: String(to),
});

function bars(
  timings: Record<string, MilestoneTiming>,
  options: {
    existing?: readonly PlanMilestone[];
    counts?: ReadonlyMap<string, number>;
    promotionLastWeek?: number;
    themes?: readonly { id: string; label: string }[];
  } = {},
) {
  return milestoneGanttBars({
    themes: options.themes ?? THEMES,
    timings,
    existing: options.existing ?? [],
    outcomeCounts: options.counts ?? new Map(),
    cohortStartsOn: "2026-09-01",
    ...(options.promotionLastWeek === undefined
      ? {}
      : { promotionLastWeek: options.promotionLastWeek }),
  });
}

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
  it("respecte l'ordre des chapitres reçus, sans en refaire un", () => {
    // Deux tris indépendants finiraient par diverger, et la troisième barre
    // cesserait de correspondre au troisième chapitre de la liste.
    const gantt = bars({ "t-1": week(9), "t-2": week(1), "t-3": week(5) });
    expect(gantt.bars.map((bar) => bar.themeId)).toEqual(["t-1", "t-2", "t-3"]);
  });

  it("ne dessine ni les chapitres non datés ni les semaines pas encore saisies", () => {
    // Une semaine vide placerait la barre en semaine 0, qui est une vraie valeur.
    const gantt = bars({
      "t-1": { kind: "undated" },
      "t-2": { kind: "week", from: "" },
      "t-3": week(4),
    });
    expect(gantt.bars.map((bar) => bar.themeId)).toEqual(["t-3"]);
  });

  it("donne une fin à un jalon ponctuel, et les dates de la promotion", () => {
    const gantt = bars({ "t-1": week(4) }, { counts: new Map([["t-1", 12]]) });
    const bar = gantt.bars[0];
    expect(bar?.weekEnd).toBe(4);
    expect(bar?.startsOn).toBe("2026-09-29");
    expect(bar?.endsOn).toBe("2026-09-29");
    expect(bar?.outcomeCount).toBe(12);
  });

  it("conserve la fin d'un jalon étalé sur une période", () => {
    const gantt = bars({ "t-1": period(2, 5) });
    expect(gantt.bars[0]?.weekEnd).toBe(5);
    expect(gantt.bars[0]?.endsOn).toBe("2026-10-06");
    expect(gantt.lastWeek).toBe(5);
  });

  it("marque « non enregistré » ce qui n'est pas en base, ou plus à sa place", () => {
    const gantt = bars(
      { "t-1": week(4), "t-2": week(3) },
      { existing: [saved("Valvulopathies", 9)] },
    );
    // Valvulopathies : enregistré en semaine 9, saisi en 4 → déplacé.
    expect(gantt.bars[0]?.unsaved).toBe(true);
    // Insuffisance cardiaque : jamais enregistré.
    expect(gantt.bars[1]?.unsaved).toBe(true);
  });

  it("ne marque rien quand la saisie correspond exactement à la base", () => {
    const gantt = bars(
      { "t-1": week(4), "t-3": period(6, 8) },
      { existing: [saved("Valvulopathies", 4), saved("Péricardite", 6, 8)] },
    );
    expect(gantt.bars.every((bar) => bar.unsaved)).toBe(false);
    expect(gantt.bars.some((bar) => bar.unsaved)).toBe(false);
  });

  it("étend l'échelle jusqu'à la fin de la promotion, même sans jalon à la fin", () => {
    expect(bars({ "t-1": week(2) }, { promotionLastWeek: 10 }).lastWeek).toBe(10);
  });

  it("garde VISIBLE un jalon posé après la fin de la promotion", () => {
    // Une échelle qui s'arrêterait à la fin du stage ferait disparaître
    // précisément les barres à corriger.
    expect(bars({ "t-1": week(11) }, { promotionLastWeek: 10 }).lastWeek).toBe(11);
  });

  it("garde une échelle non nulle quand il n'y a rien à montrer", () => {
    const gantt = bars({});
    expect(gantt.bars).toEqual([]);
    expect(gantt.lastWeek).toBe(1);
  });
});

describe("tirer une barre du rétroplanning", () => {
  const bounds = { lastWeek: 10 };

  it("déplace un jalon ponctuel de la distance parcourue", () => {
    expect(dragMilestoneTiming(week(3), { kind: "move", deltaWeeks: 2 }, bounds)).toEqual(week(5));
  });

  it("déplace une période SANS la déformer contre le bord du stage", () => {
    // Un doigt trop appuyé ne doit pas raccourcir silencieusement une période
    // de trois semaines : elle s'arrête, elle ne se rétrécit pas.
    expect(dragMilestoneTiming(period(7, 9), { kind: "move", deltaWeeks: 5 }, bounds)).toEqual(
      period(8, 10),
    );
    expect(dragMilestoneTiming(period(2, 4), { kind: "move", deltaWeeks: -9 }, bounds)).toEqual(
      period(0, 2),
    );
  });

  it("transforme un jalon ponctuel en période quand on tire son extrémité", () => {
    expect(dragMilestoneTiming(week(4), { kind: "end", deltaWeeks: 3 }, bounds)).toEqual(
      period(4, 7),
    );
    expect(dragMilestoneTiming(week(4), { kind: "start", deltaWeeks: -2 }, bounds)).toEqual(
      period(2, 4),
    );
  });

  it("redonne une semaine unique quand les deux bouts se rejoignent", () => {
    // Une période d'une seule semaine EST un jalon ponctuel : la distinguer
    // laisserait en base un week_offset_end invisible à l'écran.
    expect(dragMilestoneTiming(period(4, 7), { kind: "end", deltaWeeks: -3 }, bounds)).toEqual(
      week(4),
    );
  });

  it("empêche une extrémité de traverser l'autre", () => {
    expect(dragMilestoneTiming(period(4, 7), { kind: "start", deltaWeeks: 9 }, bounds)).toEqual(
      week(7),
    );
    expect(dragMilestoneTiming(period(4, 7), { kind: "end", deltaWeeks: -9 }, bounds)).toEqual(
      week(4),
    );
  });

  it("ne bouge pas ce qui n'a pas de barre", () => {
    const undated: MilestoneTiming = { kind: "undated" };
    const empty: MilestoneTiming = { kind: "week", from: "" };
    expect(dragMilestoneTiming(undated, { kind: "move", deltaWeeks: 3 }, bounds)).toBe(undated);
    expect(dragMilestoneTiming(empty, { kind: "move", deltaWeeks: 3 }, bounds)).toBe(empty);
  });
});
