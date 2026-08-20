import type { ProgramId } from "@/domain/types";
import type { AssessmentDefinition } from "@/domain/assessment";

export function assessmentFixturesFor(
  programId: ProgramId,
  ecosEnabled: boolean,
): readonly AssessmentDefinition[] {
  return [
    {
      id: `assessment-${programId}-1`,
      programId,
      title: "Évaluation théorique intermédiaire",
      sequence: 1,
      delivery: "platform",
      contentKinds: ["qcm"],
      status: "scheduled",
      startsAt: "2027-01-18T08:00:00.000Z",
      endsAt: "2027-01-18T10:00:00.000Z",
      resultMode: "platform",
      maximumScore: 20,
      passScore: 10,
    },
    {
      id: `assessment-${programId}-2`,
      programId,
      title: "Évaluation finale",
      sequence: 2,
      delivery: "in_person",
      contentKinds: ecosEnabled ? ["written", "ecos"] : ["written"],
      status: "draft",
      locationOrProvider: "À préciser",
      resultMode: "file_import",
      maximumScore: 20,
      passScore: 10,
    },
  ];
}
