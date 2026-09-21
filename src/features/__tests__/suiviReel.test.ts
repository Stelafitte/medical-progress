import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildLearnerTrackingRows } from "@/features/administration/learnerTrackingViewModel";
import { buildLearnerCompetenceRows } from "@/features/administration/competenceTrackingViewModel";

const outcomes = [
  { id: "k1", nature: "knowledge" },
  { id: "k2", nature: "knowledge" },
  { id: "c1", nature: "real_competence" },
] as never;
const enrollments = [
  { id: "e1", cohortId: "c", personId: "p1", status: "active" },
  { id: "e2", cohortId: "c", personId: "p2", status: "active" },
] as never;

describe("le suivi de la promotion ne ment plus (21/09)", () => {
  it("sans déclaration ni connexion, tout est à zéro : aucun chiffre inventé", () => {
    const rows = buildLearnerTrackingRows({
      enrollments,
      people: [],
      outcomes,
      logs: [],
      expectedLogsPerLearner: 0,
    });
    for (const row of rows) {
      expect(row.theory.done).toBe(0);
      expect(row.competence.done).toBe(0);
      expect(row.assessment.total).toBe(0);
      expect(row.lastSignInAt).toBeUndefined();
    }
  });

  it("compte les vraies déclarations, et seule une validation vaut compétence acquise", () => {
    const declarations = new Map([
      [
        "e1",
        [
          { enrollmentId: "e1", outcomeId: "k1", declaredLevel: "novice" },
          {
            enrollmentId: "e1",
            outcomeId: "c1",
            declaredLevel: "proficient",
            validatedAt: "2026-09-20",
          },
        ],
      ],
      ["e2", [{ enrollmentId: "e2", outcomeId: "c1", declaredLevel: "novice" }]],
    ]) as never;
    const rows = buildLearnerTrackingRows({
      enrollments,
      people: [],
      outcomes,
      logs: [],
      expectedLogsPerLearner: 0,
      declarations,
      lastSignInByPerson: new Map([["p1", "2026-09-20T10:00:00Z"]]),
    });
    const e1 = rows.find((r) => r.enrollmentId === "e1")!;
    const e2 = rows.find((r) => r.enrollmentId === "e2")!;
    expect(e1.theory).toMatchObject({ done: 1, total: 2 });
    expect(e1.competence).toMatchObject({ done: 1, total: 1 });
    expect(e2.competence).toMatchObject({ done: 0, total: 1 });
    expect(e2.awaitingValidation).toBe(1);
    expect(e1.lastSignInAt).toBe("2026-09-20T10:00:00Z");
    expect(buildLearnerCompetenceRows(enrollments, outcomes)[0]!.validated).toBe(0);
  });

  it("le hachage « maquette » a disparu des deux fichiers", () => {
    for (const f of ["learnerTrackingViewModel.ts", "competenceTrackingViewModel.ts"]) {
      const src = readFileSync(`src/features/administration/${f}`, "utf8");
      expect(src).not.toContain("stableHash");
      expect(src).not.toContain("simulatedCompetenceState");
    }
  });
});
