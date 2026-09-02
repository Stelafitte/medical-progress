import { describe, expect, it } from "vitest";
import {
  learningWeeks,
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

describe("les semaines d'apprentissage d'une promotion", () => {
  it("compte les semaines entamées, la dernière fût-elle incomplète", () => {
    // « Promotion 2026-2027 : centurie A », mesurée en base le 02/09 : 75
    // jours, soit dix semaines et cinq jours.
    const weeks = learningWeeks("2026-09-01", "2026-11-15");
    expect(weeks.days).toBe(75);
    expect(weeks.lastWeek).toBe(10);
    expect(weeks.count).toBe(11);
    expect(weeks.lastWeekPartial).toBe(true);
  });

  it("rend douze semaines pleines pour un stage de douze semaines", () => {
    const weeks = learningWeeks("2026-09-01", "2026-11-23");
    expect(weeks.count).toBe(12);
    expect(weeks.lastWeek).toBe(11);
    expect(weeks.lastWeekPartial).toBe(false);
  });

  it("rend une seule semaine pour une promotion d'un jour", () => {
    expect(learningWeeks("2026-09-01", "2026-09-01")).toMatchObject({
      lastWeek: 0,
      count: 1,
    });
  });

  it("ne casse pas sur une promotion dont la fin précède le début", () => {
    // La contrainte SQL l'interdit ; l'écran ne doit pas pour autant devenir
    // inutilisable si une donnée aberrante remonte.
    expect(learningWeeks("2026-11-15", "2026-09-01").count).toBe(1);
  });
});

describe("un jalon confronté aux dates de sa promotion", () => {
  const promotion = { lastWeek: 10 };

  it("signale une semaine posée après la fin de la promotion", () => {
    // Le cas réel du 02/09 : cinq jalons en semaine 11 sur un stage qui
    // s'arrête en semaine 10.
    expect(validatePlanMilestone({ label: "X", weekOffset: 11 }, promotion)).toEqual([
      "semaine_hors_promotion",
    ]);
  });

  it("accepte la dernière semaine de la promotion", () => {
    expect(validatePlanMilestone({ label: "X", weekOffset: 10 }, promotion)).toEqual([]);
  });

  it("signale une période dont la FIN déborde, même si elle commence dans le stage", () => {
    expect(
      validatePlanMilestone({ label: "X", weekOffset: 9, weekOffsetEnd: 12 }, promotion),
    ).toEqual(["fin_hors_promotion"]);
  });

  it("ne dit rien de plus quand la promotion n'est pas fournie", () => {
    // Un jalon se valide aussi hors de toute promotion : omettre l'argument
    // doit rendre exactement le contrôle d'avant.
    expect(validatePlanMilestone({ label: "X", weekOffset: 11 })).toEqual([]);
  });
});
