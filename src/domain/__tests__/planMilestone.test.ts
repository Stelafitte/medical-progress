import { describe, expect, it } from "vitest";
import {
  milestoneDateFor,
  PLAN_MILESTONE_MAX_WEEK,
  validatePlanMilestone,
} from "@/domain/acquisitionPlan";

describe("ce qui empêche d'enregistrer un jalon", () => {
  it("accepte un jalon ponctuel", () => {
    expect(validatePlanMilestone({ label: "Valvulopathies", weekOffset: 4 })).toEqual([]);
  });

  it("accepte une période", () => {
    expect(
      validatePlanMilestone({ label: "Valvulopathies", weekOffset: 4, weekOffsetEnd: 6 }),
    ).toEqual([]);
  });

  it("accepte une période d'une seule semaine", () => {
    // Fin égale au début : ce n'est pas une erreur, c'est une semaine pleine.
    expect(
      validatePlanMilestone({ label: "Valvulopathies", weekOffset: 4, weekOffsetEnd: 4 }),
    ).toEqual([]);
  });

  it("refuse une fin antérieure au début", () => {
    expect(validatePlanMilestone({ label: "X", weekOffset: 6, weekOffsetEnd: 4 })).toEqual([
      "fin_avant_debut",
    ]);
  });

  it("refuse un intitulé vide, espaces compris", () => {
    expect(validatePlanMilestone({ label: "   ", weekOffset: 0 })).toEqual(["label_manquant"]);
  });

  it("refuse une semaine hors des bornes tenues par la base", () => {
    expect(validatePlanMilestone({ label: "X", weekOffset: -1 })).toEqual(["semaine_hors_bornes"]);
    expect(validatePlanMilestone({ label: "X", weekOffset: PLAN_MILESTONE_MAX_WEEK + 1 })).toEqual([
      "semaine_hors_bornes",
    ]);
  });

  it("accepte la semaine 0 : c'est la semaine d'accueil, pas une absence", () => {
    expect(validatePlanMilestone({ label: "Accueil", weekOffset: 0 })).toEqual([]);
  });

  it("signale la fin hors bornes sans prétendre en plus qu'elle précède le début", () => {
    const issues = validatePlanMilestone({ label: "X", weekOffset: 2, weekOffsetEnd: 999 });
    expect(issues).toEqual(["fin_hors_bornes"]);
  });
});

describe("la date d'un rang de semaine", () => {
  it("ajoute sept jours par semaine au début de la promotion", () => {
    expect(milestoneDateFor("2026-09-01", 0)).toBe("2026-09-01");
    expect(milestoneDateFor("2026-09-01", 4)).toBe("2026-09-29");
  });

  it("franchit les changements de mois sans se tromper", () => {
    expect(milestoneDateFor("2026-09-28", 1)).toBe("2026-10-05");
  });

  it("lit une date de cohorte donnée en ISO complète", () => {
    // `cohorts.starts_on` peut arriver avec une heure : la date rendue reste
    // une date, jamais un horodatage.
    expect(milestoneDateFor("2026-09-01T00:00:00Z", 2)).toBe("2026-09-15");
  });
});
