import { describe, expect, it } from "vitest";
import {
  approvalRuleForImpact,
  createPlanChangeRequest,
  progressPercent,
  stageForProgress,
  trackForNature,
  validatePlanChangeDraft,
} from "@/domain/acquisitionPlan";
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
