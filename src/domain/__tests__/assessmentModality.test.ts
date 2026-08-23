import { describe, expect, it } from "vitest";
import {
  EMPTY_NEW_MODALITY_INPUT,
  buildModalityFromInput,
  mergeModalities,
  splitSessions,
  validateNewModality,
  type AssessmentSession,
} from "@/domain/assessmentModality";
import type { ProgramId } from "@/domain/types";

const programId = "prog-1" as ProgramId;

describe("modalités d'évaluation", () => {
  it("exige un nom", () => {
    expect(validateNewModality(EMPTY_NEW_MODALITY_INPUT)).toContain("name-required");
  });

  it("refuse un sous-type incohérent avec le type", () => {
    const issues = validateNewModality({
      ...EMPTY_NEW_MODALITY_INPUT,
      name: "Test",
      mode: "in_person",
      subtype: "qcm",
    });
    expect(issues).toEqual(["subtype-mismatch"]);
  });

  it("horodate création et mise à jour", () => {
    const modality = buildModalityFromInput(
      { ...EMPTY_NEW_MODALITY_INPUT, name: " Oral final ", subtype: "oral" },
      { programId, now: "2027-02-01T10:00:00.000Z", sequence: 1 },
    );
    expect(modality.name).toBe("Oral final");
    expect(modality.createdAt).toBe("2027-02-01T10:00:00.000Z");
    expect(modality.updatedAt).toBe("2027-02-01T10:00:00.000Z");
  });

  it("fusionne sans doublon de nom", () => {
    const stored = buildModalityFromInput(
      { ...EMPTY_NEW_MODALITY_INPUT, name: "QCM", mode: "online", subtype: "qcm" },
      { programId, now: "2027-01-01T00:00:00.000Z", sequence: 1 },
    );
    const local = { ...stored, id: "other" };
    expect(mergeModalities([stored], [local])).toHaveLength(1);
  });

  it("sépare sessions passées et à venir", () => {
    const sessions: readonly AssessmentSession[] = [
      { id: "a", modalityId: "m", cohortId: "c", scheduledFor: "2027-01-01T00:00:00.000Z", participants: 3 },
      { id: "b", modalityId: "m", cohortId: "c", scheduledFor: "2027-05-01T00:00:00.000Z", participants: 3 },
    ];
    const { completed, upcoming } = splitSessions(sessions, new Date("2027-03-01T00:00:00.000Z"));
    expect(completed.map((s) => s.id)).toEqual(["a"]);
    expect(upcoming.map((s) => s.id)).toEqual(["b"]);
  });
});
