import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalCohort,
  listLocalCohorts,
  resetLocalCohorts,
} from "@/application/cohortDraftStore";
import { EMPTY_NEW_COHORT_INPUT } from "@/domain/cohortDraft";
import type { CurriculumVersionId, ProgramId } from "@/domain/types";

const args = {
  programId: "prog-diu" as ProgramId,
  curriculumVersionId: "cv-diu-1" as CurriculumVersionId,
  now: "2026-08-23T00:00:00.000Z",
} as const;

const input = {
  ...EMPTY_NEW_COHORT_INPUT,
  label: "Promotion 2026-2027",
  startsOn: "2026-10-01",
  endsOn: "2027-06-30",
};

describe("classes créées localement", () => {
  beforeEach(() => resetLocalCohorts());

  it("une classe créée est visible par tous les écrans (liste unique)", () => {
    const cohort = createLocalCohort({ ...args, input });
    expect(cohort?.label).toBe("Promotion 2026-2027");
    expect(listLocalCohorts()).toHaveLength(1);
  });

  it("refuse une saisie invalide sans muter la liste", () => {
    expect(createLocalCohort({ ...args, input: EMPTY_NEW_COHORT_INPUT })).toBeNull();
    expect(listLocalCohorts()).toHaveLength(0);
  });

  it("attribue des identifiants distincts aux créations successives", () => {
    const a = createLocalCohort({ ...args, input });
    const b = createLocalCohort({ ...args, input: { ...input, label: "Autre" } });
    expect(a?.id).not.toBe(b?.id);
  });
});
