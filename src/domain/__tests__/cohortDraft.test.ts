import { describe, expect, it } from "vitest";
import {
  academicYearFor,
  buildCohortFromInput,
  EMPTY_NEW_COHORT_INPUT,
  mergeCohorts,
  validateNewCohort,
} from "@/domain/cohortDraft";
import type { Cohort, CohortId, CurriculumVersionId, ProgramId } from "@/domain/types";

const ctx = {
  programId: "prog-diu" as ProgramId,
  curriculumVersionId: "cv-diu-1" as CurriculumVersionId,
  now: "2026-08-23T00:00:00.000Z",
  sequence: 1,
} as const;

const valid = {
  ...EMPTY_NEW_COHORT_INPUT,
  label: "  Promotion 2026-2027 ",
  startsOn: "2026-10-01",
  endsOn: "2027-06-30",
  learners: "40",
};

describe("création de classe — validation", () => {
  it("exige un nom et des dates", () => {
    expect(validateNewCohort(EMPTY_NEW_COHORT_INPUT)).toEqual([
      "label-required",
      "dates-required",
    ]);
  });

  it("refuse une fin antérieure au début", () => {
    expect(validateNewCohort({ ...valid, endsOn: "2026-09-01" })).toEqual(["dates-order"]);
  });

  it("refuse un effectif non numérique", () => {
    expect(validateNewCohort({ ...valid, learners: "quarante" })).toEqual(["learners-invalid"]);
  });

  it("accepte une saisie complète", () => {
    expect(validateNewCohort(valid)).toEqual([]);
  });
});

describe("création de classe — construction", () => {
  it("produit une classe rattachée au programme, de façon déterministe", () => {
    const cohort = buildCohortFromInput(valid, ctx);
    expect(cohort).toEqual(buildCohortFromInput(valid, ctx));
    expect(cohort.id).toBe("coh-local-1");
    expect(cohort.label).toBe("Promotion 2026-2027");
    expect(cohort.programId).toBe(ctx.programId);
    expect(cohort.learnerCount).toBe(40);
    expect(cohort.academicYear).toBe("2026-2027");
    expect(cohort.provenance.sourceSystem).toBe("native");
  });

  it("déduit l'année universitaire à la bascule de septembre", () => {
    expect(academicYearFor("2026-10-01")).toBe("2026-2027");
    expect(academicYearFor("2027-01-15")).toBe("2026-2027");
  });
});

describe("liste unique de classes", () => {
  it("fusionne dépôt et création locale sans doublon", () => {
    const stored: Cohort = { ...buildCohortFromInput(valid, ctx), id: "coh-a" as CohortId };
    const local = buildCohortFromInput({ ...valid, label: "Locale" }, { ...ctx, sequence: 2 });
    expect(mergeCohorts([stored], [stored, local]).map((c) => c.id)).toEqual([
      "coh-a",
      "coh-local-2",
    ]);
  });
});
