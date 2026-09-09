import { describe, expect, it } from "vitest";
import {
  appliquerDecalages,
  approvalRuleForImpact,
  createPlanChangeRequest,
  progressPercent,
  stageForProgress,
  trackForNature,
  validatePlanChangeDraft,
} from "@/domain/acquisitionPlan";
import type { MilestoneShift, PlanMilestoneId, PlanScheduleEntry } from "@/domain/acquisitionPlan";
import type { OutcomeProgress } from "@/domain/mastery";
import type { Evidence, Outcome } from "@/domain/types";

const outcome: Outcome = {
  id: "out-1",
  createdAt: "2026-01-01T00:00:00Z",
  provenance: { sourceSystem: "native" },
  programId: "prog-1",
  curriculumVersionId: "cv-1",
  code: "X-1",
  label: "Acquis test",
  description: "",
  nature: "real_competence",
  domain: "Test",
  targetMastery: "intermediate",
  retainedAt: "2026-01-01T00:00:00Z",
};

const progress = (over: Partial<OutcomeProgress>): OutcomeProgress => ({
  outcome,
  mastery: "not_started",
  countedEvidence: [],
  pendingEvidence: [],
  blockedBySelfDeclaration: false,
  meetsTarget: false,
  ...over,
});

const evidenceStub = {} as Evidence;

describe("plan d'acquisition", () => {
  it("distingue le plan connaissances du plan compétences", () => {
    expect(trackForNature("knowledge")).toBe("knowledge");
    expect(trackForNature("simulated_competence")).toBe("competence");
    expect(trackForNature("real_competence")).toBe("competence");
  });

  it("classe les éléments dans une colonne Kanban de façon déterministe", () => {
    expect(stageForProgress(progress({ meetsTarget: true }))).toBe("acquired");
    expect(stageForProgress(progress({ pendingEvidence: [evidenceStub] }))).toBe("to_validate");
    expect(stageForProgress(progress({ blockedBySelfDeclaration: true }))).toBe("to_validate");
    expect(stageForProgress(progress({ countedEvidence: [evidenceStub] }))).toBe("in_progress");
    expect(stageForProgress(progress({}))).toBe("to_plan");
  });

  it("calcule un avancement relatif borné au niveau cible", () => {
    expect(progressPercent("not_started", "intermediate")).toBe(0);
    expect(progressPercent("novice", "intermediate")).toBe(50);
    expect(progressPercent("autonomous", "intermediate")).toBe(100);
  });

  it("dérive la règle de validation de l'impact déclaré", () => {
    expect(approvalRuleForImpact("personal_pace")).toBe("auto_accept");
    expect(approvalRuleForImpact("official_deadline")).toBe("teacher_or_admin");
    expect(approvalRuleForImpact("clinical_competence")).toBe("placement_supervisor");
    // Sans stage assigné, exiger un encadrant rendrait la demande indécidable :
    // enseignant/administrateur statue provisoirement sur le calendrier.
    expect(approvalRuleForImpact("clinical_competence", { hasPlacementAssignment: false })).toBe(
      "teacher_or_admin",
    );
    expect(approvalRuleForImpact("clinical_competence", { hasPlacementAssignment: true })).toBe(
      "placement_supervisor",
    );
  });

  it("exige une justification et une modification demandée", () => {
    const errors = validatePlanChangeDraft({
      itemId: "out-1",
      justification: "   ",
      impact: "personal_pace",
    });
    expect(errors.map((e) => e.field)).toEqual(["justification", "requestedDate"]);

    expect(
      validatePlanChangeDraft({
        itemId: "out-1",
        justification: "Stage décalé",
        requestedDate: "2026-11-02",
        impact: "official_deadline",
      }),
    ).toHaveLength(0);
  });

  it("crée une demande simulée, jamais persistée", () => {
    const request = createPlanChangeRequest(
      {
        itemId: "out-1",
        justification: "Réorganisation personnelle",
        requestedPace: "Deux séances par semaine",
        impact: "personal_pace",
      },
      "2026-08-17T07:00:00Z",
      "req-1",
    );
    expect(request.simulated).toBe(true);
    expect(request.status).toBe("draft");
    expect(request.approvalRule).toBe("auto_accept");
  });
});

/* ------------------------------------------------------------------ */
/* Le plan personnel de l'apprenant (09/09)                            */
/* ------------------------------------------------------------------ */

const JALON = "mil-1" as PlanMilestoneId;
const AUTRE = "mil-2" as PlanMilestoneId;

const entree = (over: Partial<PlanScheduleEntry> = {}): PlanScheduleEntry => ({
  outcomeId: "out-1" as PlanScheduleEntry["outcomeId"],
  milestoneId: JALON,
  // Une fenetre de trois jours, deliberement PAS une semaine : c'est ce qui
  // rend visible une duree recalculee au lieu d'etre conservee.
  startsOn: "2026-10-01T12:00:00.000Z",
  dueOn: "2026-10-04T12:00:00.000Z",
  milestoneLabel: "Valvulopathies",
  official: false,
  ...over,
});

const decalage = (over: Partial<MilestoneShift> = {}): MilestoneShift => ({
  milestoneId: JALON,
  shiftedDueOn: "2026-10-18T12:00:00.000Z",
  ...over,
});

describe("decalages personnels du plan", () => {
  it("rend les entrees telles quelles quand aucun jalon n'est deplace", () => {
    const entrees = [entree()];
    expect(appliquerDecalages(entrees, [])).toBe(entrees);
  });

  it("deplace la fenetre EN CONSERVANT sa duree quand aucun debut n'est choisi", () => {
    const [resultat] = appliquerDecalages([entree()], [decalage()]);
    expect(resultat?.dueOn).toBe("2026-10-18T12:00:00.000Z");
    // Trois jours avant la nouvelle fin, et non « une semaine avant » : un jalon
    // court ne doit pas grandir a chaque deplacement.
    expect(resultat?.startsOn).toBe("2026-10-15T12:00:00.000Z");
  });

  it("prend les deux dates telles quelles quand l'apprenant a choisi sa fenetre", () => {
    const [resultat] = appliquerDecalages(
      [entree()],
      [decalage({ shiftedStartsOn: "2026-10-05T12:00:00.000Z" })],
    );
    expect(resultat?.startsOn).toBe("2026-10-05T12:00:00.000Z");
    expect(resultat?.dueOn).toBe("2026-10-18T12:00:00.000Z");
  });

  it("ne touche que le jalon vise", () => {
    const intacte = entree({
      milestoneId: AUTRE,
      outcomeId: "out-2" as PlanScheduleEntry["outcomeId"],
    });
    const [, resultat] = appliquerDecalages([entree(), intacte], [decalage()]);
    expect(resultat).toBe(intacte);
  });

  it("deplace TOUS les acquis portes par le meme jalon", () => {
    const resultat = appliquerDecalages(
      [entree(), entree({ outcomeId: "out-2" as PlanScheduleEntry["outcomeId"] })],
      [decalage()],
    );
    expect(resultat.map((e) => e.dueOn)).toEqual([
      "2026-10-18T12:00:00.000Z",
      "2026-10-18T12:00:00.000Z",
    ]);
  });
});
