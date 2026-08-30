import { describe, expect, it } from "vitest";
import {
  buildLearnerTrackingRows,
  summarizeLearnerTracking,
} from "@/features/administration/learnerTrackingViewModel";
import {
  buildKnowledgeFromInput,
  validateNewKnowledge,
  EMPTY_NEW_KNOWLEDGE_INPUT,
} from "@/domain/knowledgeDraft";
import type { AssessmentDefinition } from "@/domain/assessment";
import type {
  CurriculumVersionId,
  Enrollment,
  Outcome,
  Person,
  ProgramId,
} from "@/domain/types";

const people = [
  { id: "p2", fullName: "Zoé Martin" },
  { id: "p1", fullName: "Alice Durand" },
] as unknown as readonly Person[];

const enrollments = [
  { id: "e2", personId: "p2", cohortId: "c1", status: "active" },
  { id: "e1", personId: "p1", cohortId: "c1", status: "active" },
] as unknown as readonly Enrollment[];

const outcomes = [
  { id: "o1", code: "K1", label: "Bases", nature: "knowledge" },
  { id: "o2", code: "C1", label: "Simu", nature: "simulated_competence" },
  { id: "o3", code: "R1", label: "Réel", nature: "real_competence" },
] as unknown as readonly Outcome[];

const assessments = [
  { id: "a1", title: "T1" },
  { id: "a2", title: "T2" },
] as unknown as readonly AssessmentDefinition[];

function build() {
  return buildLearnerTrackingRows({
    enrollments,
    people,
    outcomes,
    logs: [],
    assessments,
    expectedLogsPerLearner: 2,
  });
}

describe("suivi croisé des apprenants", () => {
  it("trie par nom et couvre les quatre axes", () => {
    const rows = build();
    expect(rows.map((r) => r.personName)).toEqual(["Alice Durand", "Zoé Martin"]);
    expect(rows[0]?.theory.total).toBe(1);
    expect(rows[0]?.competence.total).toBe(2);
    expect(rows[0]?.assessment.total).toBe(2);
  });

  it("est déterministe entre deux dérivations (Classes, Pilotage, Connaissances)", () => {
    expect(build()).toEqual(build());
  });

  it("compte 0 % de stage sans carnet validé mais des carnets attendus", () => {
    const rows = build();
    expect(rows[0]?.placement).toEqual({ done: 0, total: 2, percent: 0 });
    expect(summarizeLearnerTracking(rows).placementPercent).toBe(0);
  });

  it("ignore les axes non attendus dans la moyenne globale", () => {
    const rows = buildLearnerTrackingRows({
      enrollments,
      people,
      outcomes,
      logs: [],
      assessments: [],
      expectedLogsPerLearner: 0,
    });
    expect(rows[0]?.assessment.total).toBe(0);
    expect(rows[0]?.globalPercent).toBe(
      Math.round((rows[0]!.theory.percent + rows[0]!.competence.percent) / 2),
    );
  });

  it("résume le groupe", () => {
    const summary = summarizeLearnerTracking(build());
    expect(summary.learners).toBe(2);
    expect(summary.globalPercent).toBeGreaterThanOrEqual(0);
  });
});

describe("création d'une connaissance", () => {
  it("exige un code et un intitulé", () => {
    expect(validateNewKnowledge(EMPTY_NEW_KNOWLEDGE_INPUT)).toEqual([
      "code-required",
      "label-required",
    ]);
  });

  it("refuse un niveau attendu « non commencée »", () => {
    expect(
      validateNewKnowledge({
        ...EMPTY_NEW_KNOWLEDGE_INPUT,
        code: "k1",
        label: "Ultrasons",
        targetMastery: "not_started",
      }),
    ).toEqual(["target-invalid"]);
  });

  it("construit une connaissance normalisée et déterministe", () => {
    const outcome = buildKnowledgeFromInput(
      { ...EMPTY_NEW_KNOWLEDGE_INPUT, code: " k-08 ", label: "  Ultrasons ", domain: "" },
      {
        programId: "prog-1" as ProgramId,
        curriculumVersionId: "cv-1" as CurriculumVersionId,
        now: "2027-01-01T00:00:00.000Z",
        sequence: 3,
      },
    );
    expect(outcome.code).toBe("K-08");
    expect(outcome.label).toBe("Ultrasons");
    expect(outcome.nature).toBe("knowledge");
    expect(outcome.domain).toBe("Non classé");
    expect(outcome.id).toBe("out-knowledge-local-3");
  });
});
