import { describe, expect, it } from "vitest";
import { academicYearFor, EMPTY_NEW_COHORT_INPUT, validateNewCohort } from "@/domain/cohortDraft";

const valid = {
  ...EMPTY_NEW_COHORT_INPUT,
  label: "  Promotion 2026-2027 ",
  startsOn: "2026-10-01",
  endsOn: "2027-06-30",
};

describe("création de classe — validation", () => {
  it("exige un nom et des dates", () => {
    expect(validateNewCohort(EMPTY_NEW_COHORT_INPUT)).toEqual(["label-required", "dates-required"]);
  });

  it("refuse une fin antérieure au début", () => {
    expect(validateNewCohort({ ...valid, endsOn: "2026-09-01" })).toEqual(["dates-order"]);
  });

  it("accepte une saisie complète", () => {
    expect(validateNewCohort(valid)).toEqual([]);
  });
});

describe("création de classe — année universitaire par défaut", () => {
  it("déduit l'année universitaire à la bascule de septembre", () => {
    expect(academicYearFor("2026-10-01")).toBe("2026-2027");
    expect(academicYearFor("2027-01-15")).toBe("2026-2027");
  });
});
