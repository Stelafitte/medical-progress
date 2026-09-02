import { describe, expect, it } from "vitest";
import {
  canRevertToDraft,
  cohortOpeningIssues,
  describeOpeningReport,
} from "@/domain/cohortOpening";

const SAIN = {
  status: "draft",
  milestoneCount: 29,
  outcomeCount: 366,
  lastMilestoneWeek: 10,
  promotionLastWeek: 10,
} as const;

describe("ouvrir une promotion", () => {
  it("laisse ouvrir un rétroplanning complet et dans les bornes", () => {
    expect(cohortOpeningIssues(SAIN)).toEqual([]);
  });

  it("refuse d'ouvrir une promotion déjà ouverte", () => {
    expect(cohortOpeningIssues({ ...SAIN, status: "open" })).toEqual([
      "promotion_pas_en_conception",
    ]);
  });

  it("refuse une promotion sans jalon", () => {
    // Le passeport de chaque étudiant serait vide : un écran sans rien à faire
    // ressemble à une panne, pas à un programme.
    expect(
      cohortOpeningIssues({ ...SAIN, milestoneCount: 0, outcomeCount: 0, lastMilestoneWeek: 0 }),
    ).toEqual(["aucun_jalon"]);
  });

  it("ne reproche pas DEUX fois le même manque", () => {
    // Sans jalon il n'y a évidemment aucun acquis : ajouter « aucun acquis »
    // ferait corriger deux fois ce qui se corrige une seule.
    const issues = cohortOpeningIssues({
      ...SAIN,
      milestoneCount: 0,
      outcomeCount: 0,
      lastMilestoneWeek: 0,
    });
    expect(issues).not.toContain("aucun_acquis");
  });

  it("refuse des jalons qui ne portent aucun acquis du tout", () => {
    expect(cohortOpeningIssues({ ...SAIN, outcomeCount: 0 })).toEqual(["aucun_acquis"]);
  });

  it("refuse un jalon posé après la fin du stage", () => {
    expect(cohortOpeningIssues({ ...SAIN, lastMilestoneWeek: 11 })).toEqual([
      "jalon_hors_promotion",
    ]);
  });

  it("accepte un jalon posé la toute dernière semaine", () => {
    // La dernière semaine du stage EST une semaine du stage.
    expect(cohortOpeningIssues({ ...SAIN, lastMilestoneWeek: 10 })).toEqual([]);
  });

  it("ne fabrique pas un refus à partir d'une donnée manquante", () => {
    // Durée inconnue : c'est le serveur qui tranchera, pas un écran qui devine.
    expect(cohortOpeningIssues({ status: "draft", milestoneCount: 29, outcomeCount: 366 })).toEqual(
      [],
    );
  });

  it("cumule les reproches indépendants", () => {
    expect(
      cohortOpeningIssues({ ...SAIN, status: "open", outcomeCount: 0, lastMilestoneWeek: 12 }),
    ).toEqual(["promotion_pas_en_conception", "aucun_acquis", "jalon_hors_promotion"]);
  });
});

describe("retirer le sceau", () => {
  it("ne se retire que depuis « ouverte »", () => {
    // Au-delà, la promotion a une histoire — déclarations, carnets — que ce
    // geste ne saurait pas défaire.
    expect(canRevertToDraft("open")).toBe(true);
    expect(canRevertToDraft("draft")).toBe(false);
    expect(canRevertToDraft("in_progress")).toBe(false);
    expect(canRevertToDraft("completed")).toBe(false);
    expect(canRevertToDraft("archived")).toBe(false);
  });
});

describe("le rapport d'ouverture", () => {
  it("annonce ce qui a été ouvert", () => {
    expect(
      describeOpeningReport({
        milestones: 29,
        outcomes: 366,
        emptyMilestones: 0,
        versionActivated: false,
      }),
    ).toBe("Promotion ouverte : 29 jalon(s), 366 acquis.");
  });

  it("se met au conditionnel à blanc", () => {
    expect(
      describeOpeningReport(
        { milestones: 29, outcomes: 366, emptyMilestones: 0, versionActivated: false },
        { dryRun: true },
      ),
    ).toBe("Ouvrirait la promotion sur 29 jalon(s) et 366 acquis.");
  });

  it("signale les jalons vides SANS en faire un refus", () => {
    // Un chapitre daté dont les acquis sont sortis du parcours reste une
    // intention lisible : on le montre, on ne décide pas à sa place.
    expect(
      describeOpeningReport({
        milestones: 29,
        outcomes: 366,
        emptyMilestones: 2,
        versionActivated: false,
      }),
    ).toBe(
      "Promotion ouverte : 29 jalon(s), 366 acquis. 2 jalon(s) ne portent aucun acquis retenu — daté sans contenu.",
    );
  });

  it("prévient que le modèle se fige, au bon temps", () => {
    expect(
      describeOpeningReport(
        { milestones: 29, outcomes: 366, emptyMilestones: 0, versionActivated: true },
        { dryRun: true },
      ),
    ).toContain("se figeraient");
    expect(
      describeOpeningReport({
        milestones: 29,
        outcomes: 366,
        emptyMilestones: 0,
        versionActivated: true,
      }),
    ).toContain("sont figés");
  });
});
