import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_RESULT_IMPORT_REQUIRED_COLUMNS,
  QUESTION_BANK_CAPABILITIES,
  validateAssessment,
  type AssessmentDefinition,
} from "@/domain/assessment";
import type { ProgramId } from "@/domain/types";

const base: AssessmentDefinition = {
  id: "assessment-1",
  programId: "prog-dfasm" as ProgramId,
  title: "Évaluation finale",
  sequence: 1,
  delivery: "in_person",
  contentKinds: ["written", "ecos"],
  status: "scheduled",
  startsAt: "2027-06-01T08:00:00.000Z",
  endsAt: "2027-06-01T12:00:00.000Z",
  resultMode: "file_import",
  maximumScore: 20,
  passScore: 10,
};

describe("configuration générique des évaluations", () => {
  it("accepte une évaluation externe avec import de résultats", () => {
    expect(validateAssessment(base)).toEqual([]);
  });

  it("accepte une évaluation sans ECOS", () => {
    expect(validateAssessment({ ...base, contentKinds: ["qcm"] })).toEqual([]);
  });

  it("refuse une programmation incomplète ou inversée", () => {
    const { endsAt: _endsAt, ...withoutEnd } = base;
    expect(validateAssessment(withoutEnd).map((issue) => issue.code)).toContain("missing_schedule");
    expect(
      validateAssessment({ ...base, endsAt: "2027-06-01T07:00:00.000Z" }).map(
        (issue) => issue.code,
      ),
    ).toContain("invalid_schedule");
  });

  it("refuse un seuil supérieur au barème", () => {
    expect(validateAssessment({ ...base, passScore: 21 }).map((issue) => issue.code)).toContain(
      "invalid_score",
    );
  });

  it("prévoit un import identifiable et contrôlable", () => {
    expect(ASSESSMENT_RESULT_IMPORT_REQUIRED_COLUMNS).toEqual([
      "learner_identifier",
      "score",
      "maximum_score",
      "result_status",
    ]);
  });

  it("prévoit les médias nécessaires aux futures banques de QCM", () => {
    expect(QUESTION_BANK_CAPABILITIES.join(" ")).toContain("GIF animés");
    expect(QUESTION_BANK_CAPABILITIES.join(" ")).toContain("échocardiographie");
  });
});
