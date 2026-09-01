import { describe, expect, it } from "vitest";
import {
  academicYearFor,
  EMPTY_NEW_COHORT_INPUT,
  validateNewCohort,
  cohortFormInputFrom,
  toDateInputValue,
} from "@/domain/cohortDraft";

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

describe("reprendre une classe existante", () => {
  // Le piege : `Cohort.startsOn` est normalisee en date-heure ISO par
  // l'adaptateur Supabase, alors qu'un <input type="date"> n'accepte que
  // « AAAA-MM-JJ ». Passee telle quelle, la valeur affiche un champ VIDE, sans
  // erreur ni message : l'utilisateur croit que la classe n'a pas de dates.
  it("ramene les dates ISO au format attendu par un champ date", () => {
    expect(toDateInputValue("2026-09-01T00:00:00.000Z")).toBe("2026-09-01");
    expect(toDateInputValue("2026-09-01")).toBe("2026-09-01");
  });

  it("prepare le formulaire depuis une classe, sans rien perdre", () => {
    const input = cohortFormInputFrom({
      label: "Promotion 2026-2027 : centurie A",
      academicYear: "2026-2027",
      startsOn: "2026-09-01T00:00:00.000Z",
      endsOn: "2026-11-15T00:00:00.000Z",
    });
    expect(input).toEqual({
      label: "Promotion 2026-2027 : centurie A",
      academicYear: "2026-2027",
      startsOn: "2026-09-01",
      endsOn: "2026-11-15",
    });
    // Et ce que le formulaire rend doit rester valide aux yeux du meme
    // validateur que la creation : un seul outil, une seule regle.
    expect(validateNewCohort(input)).toEqual([]);
  });
});
