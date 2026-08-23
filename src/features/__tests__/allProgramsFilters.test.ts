import { describe, expect, it } from "vitest";
import type { AdministeredProgramCard } from "@/features/administration/adminProgramViewModel";
import {
  EMPTY_ALL_PROGRAMS_FILTERS,
  countByLifecycle,
  filterProgramCards,
  hasActiveFilters,
  programCategory,
  programLifecycle,
  programTrack,
  toggleFilterValue,
} from "@/features/administration/allProgramsFilters";
import type { Cohort, Program, ProgramKind } from "@/domain/types";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function cohort(id: string, startsOn: string, endsOn: string): Cohort {
  return {
    id,
    programId: "prg-1",
    curriculumVersionId: "cv-1",
    label: id,
    academicYear: "2026",
    startsOn,
    endsOn,
    learnerCount: 10,
  } as Cohort;
}

function card(kind: ProgramKind, cohorts: readonly Cohort[]): AdministeredProgramCard {
  const program = { id: "prg-1", code: "X", name: "X", kind } as Program;
  return {
    program,
    cohortCount: cohorts.length,
    cohorts,
    activeCohort: cohorts[0],
    phase: undefined,
    progressPercent: 0,
    nextDeadline: undefined,
    learnerCount: 0,
  };
}

describe("filtres de la vue Tous les programmes", () => {
  it("rattache le DFASM à la formation initiale et le reste à la continue", () => {
    expect(programTrack("dfasm")).toBe("initial");
    expect(programTrack("diu")).toBe("continuing");
    expect(programTrack("dpc")).toBe("continuing");
  });

  it("dérive l'état du programme de ses cohortes", () => {
    expect(programLifecycle(card("diu", []), NOW)).toBe("construction");
    expect(
      programLifecycle(card("diu", [cohort("c", "2026-09-01", "2027-01-01")]), NOW),
    ).toBe("launching");
    expect(
      programLifecycle(card("diu", [cohort("c", "2026-01-01", "2026-12-01")]), NOW),
    ).toBe("running");
    expect(
      programLifecycle(card("diu", [cohort("c", "2026-01-01", "2026-03-01")]), NOW),
    ).toBe("closed");
    expect(
      programLifecycle(card("diu", [cohort("c", "2023-01-01", "2023-03-01")]), NOW),
    ).toBe("archived");
  });

  it("ne filtre rien sans filtre actif", () => {
    const cards = [card("dfasm", []), card("diu", [])];
    expect(hasActiveFilters(EMPTY_ALL_PROGRAMS_FILTERS)).toBe(false);
    expect(filterProgramCards(cards, EMPTY_ALL_PROGRAMS_FILTERS, NOW)).toHaveLength(2);
  });

  it("combine filière, état et fenêtre de dates", () => {
    const initial = card("dfasm", [cohort("a", "2026-01-01", "2026-12-01")]);
    const continuing = card("diu", [cohort("b", "2027-01-01", "2027-06-01")]);
    const cards = [initial, continuing];

    expect(
      filterProgramCards(cards, { ...EMPTY_ALL_PROGRAMS_FILTERS, tracks: ["initial"] }, NOW),
    ).toEqual([initial]);
    expect(
      filterProgramCards(
        cards,
        { ...EMPTY_ALL_PROGRAMS_FILTERS, lifecycles: ["launching"] },
        NOW,
      ),
    ).toEqual([continuing]);
    expect(
      filterProgramCards(
        cards,
        { ...EMPTY_ALL_PROGRAMS_FILTERS, from: "2027-02-01", to: "2027-03-01" },
        NOW,
      ),
    ).toEqual([continuing]);
  });

  it("compte les programmes par état et bascule les valeurs", () => {
    const counts = countByLifecycle([card("diu", []), card("dfasm", [])], NOW);
    expect(counts.construction).toBe(2);
    expect(toggleFilterValue(["initial"], "initial")).toEqual([]);
    expect(toggleFilterValue([], "initial")).toEqual(["initial"]);
  });
});

describe("catégories de programme", () => {
  it("dérive le niveau DFASM et les parcours de formation continue", () => {
    const kindOf = (name: string, kind: ProgramKind) =>
      programCategory({ id: "p", code: name, name, kind } as Program);
    expect(kindOf("DFASM 2 Cardiologie", "dfasm")).toBe("dfasm2");
    expect(kindOf("Cardiologie", "dfasm")).toBe("dfasm1");
    expect(kindOf("DIU d'Échocardiographie", "diu")).toBe("diu");
    expect(kindOf("Master Santé", "other")).toBe("master");
    expect(kindOf("Parcours congrès ESC", "other")).toBe("congress");
    expect(kindOf("Certification périodique", "other")).toBe("periodic_certification");
  });

  it("filtre les blocs sur les catégories sélectionnées", () => {
    const cards = [card("dfasm", []), card("diu", [])];
    const filtered = filterProgramCards(
      cards,
      { ...EMPTY_ALL_PROGRAMS_FILTERS, categories: ["diu"] },
      NOW,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.program.kind).toBe("diu");
  });
});
