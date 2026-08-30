import { describe, expect, it } from "vitest";
import {
  allowedProgrammingActions,
  buildLearnerActivityRows,
  buildSuggestedNotifications,
  nextProgrammingState,
  summarizeGroupActivity,
} from "@/features/administration/pilotSectionsViewModel";
import type { StageLog } from "@/domain/stageLog";
import type { Enrollment, Person } from "@/domain/types";

const enrollment = (id: string, personId: string): Enrollment =>
  ({ id, personId, programId: "p1", cohortId: "c1", status: "active" }) as unknown as Enrollment;

const person = (id: string, fullName: string): Person =>
  ({ id, fullName }) as unknown as Person;

const log = (enrollmentId: string, status: StageLog["status"], entries: number): StageLog =>
  ({
    id: `${enrollmentId}-${status}`,
    enrollmentId,
    status,
    entries: Array.from({ length: entries }, (_, i) => ({ occurredAt: `2026-0${i + 1}-01` })),
    validations: [],
  }) as unknown as StageLog;

describe("programmation de la promotion", () => {
  it("n'autorise que des transitions explicites", () => {
    expect(nextProgrammingState("planned", "activate")).toBe("active");
    expect(nextProgrammingState("planned", "pause")).toBeNull();
    expect(allowedProgrammingActions("active")).toEqual(["pause", "close"]);
  });
});

describe("activité et marqueurs", () => {
  const rows = buildLearnerActivityRows({
    enrollments: [enrollment("e1", "u1"), enrollment("e2", "u2")],
    people: [person("u1", "Alice"), person("u2", "Bruno")],
    logs: [log("e1", "validated", 2), log("e2", "submitted", 1)],
    alerts: [],
    expectedLogsPerLearner: 1,
  });

  it("dérive un avancement et un marqueur par apprenant", () => {
    expect(rows.map((r) => r.personName)).toEqual(["Alice", "Bruno"]);
    expect(rows[0]?.marker).toBe("on_track");
    expect(rows[0]?.progressPercent).toBe(100);
    expect(rows[1]?.marker).toBe("awaiting_validation");
  });

  it("résume le groupe et propose des notifications issues des marqueurs", () => {
    const summary = summarizeGroupActivity(rows);
    expect(summary.learners).toBe(2);
    expect(summary.awaitingValidation).toBe(1);
    const notifications = buildSuggestedNotifications(rows);
    expect(notifications.map((n) => n.marker)).toContain("awaiting_validation");
  });
});
