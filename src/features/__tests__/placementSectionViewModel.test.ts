import { describe, expect, it } from "vitest";
import {
  buildStageTrackingRows,
  type PlacementCohortRow,
} from "@/features/administration/placementSectionViewModel";

const row: PlacementCohortRow = {
  enrollmentId: "enr-1",
  learnerName: "Alice",
  placementName: "Écho — CHU",
  status: "completed",
  startsOn: "2026-01-05T00:00:00.000Z",
  endsOn: "2026-02-05T00:00:00.000Z",
};

describe("placementSectionViewModel", () => {
  it("ajoute l'étape carnet uniquement quand elle est prévue", () => {
    const withLog = buildStageTrackingRows({
      rows: [row],
      competencesExpected: 3,
      logbookExpected: true,
    });
    const withoutLog = buildStageTrackingRows({
      rows: [row],
      competencesExpected: 3,
      logbookExpected: false,
    });
    expect(withLog[0]?.steps).toHaveLength(3);
    expect(withoutLog[0]?.steps).toHaveLength(2);
  });

  it("ignore les apprenants non associés à un terrain", () => {
    const rows = buildStageTrackingRows({
      rows: [{ ...row, placementName: null, status: null }],
      competencesExpected: 2,
      logbookExpected: true,
    });
    expect(rows).toHaveLength(0);
  });

  it("bloque la validation finale quand les compétences sont incomplètes", () => {
    const rows = buildStageTrackingRows({
      rows: [{ ...row, status: "in_progress" }],
      competencesExpected: 40,
      logbookExpected: false,
    });
    expect(rows[0]?.steps[1]?.state).toBe("blocked");
  });
});
