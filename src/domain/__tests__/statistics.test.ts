import { describe, expect, it } from "vitest";
import {
  buildTrend,
  compareCohorts,
  scopedToPlacements,
  summarizeHistory,
  type CohortStatisticsSnapshot,
} from "@/domain/statistics";
import { canAccessStatistics } from "@/domain/access";
import type { RoleAssignment } from "@/domain/types";
import { cohortStatistics } from "@/infrastructure/mock/statisticsFixtures";

const snap = (
  overrides: Partial<CohortStatisticsSnapshot> & Pick<CohortStatisticsSnapshot, "id">,
): CohortStatisticsSnapshot => ({
  programId: "prog-x",
  cohortId: "coh-x",
  academicYear: "2024-2025",
  cohortLabel: "Promotion",
  status: "closed",
  learnerCount: 10,
  completionRate: 0.5,
  knowledgeRate: 0.6,
  simulatedRate: 0.5,
  realRate: 0.4,
  validatedEvidenceCount: 100,
  pendingValidationCount: 0,
  placementCompletionRate: 0.8,
  medianDaysToFirstRealCompetence: 90,
  placementIds: ["pla-a"],
  ...overrides,
});

describe("statistiques pluriannuelles", () => {
  it("conserve chaque année et calcule l'écart année sur année", () => {
    const trend = buildTrend([
      snap({ id: "b", academicYear: "2025-2026", completionRate: 0.6 }),
      snap({ id: "a", academicYear: "2024-2025", completionRate: 0.5 }),
    ]);
    expect(trend.map((t) => t.academicYear)).toEqual(["2024-2025", "2025-2026"]);
    expect(trend[0]!.completionDelta).toBeNull();
    expect(trend[1]!.completionDelta).toBeCloseTo(0.1, 3);
  });

  it("compare l'année en cours à la moyenne des promotions clôturées", () => {
    const summary = summarizeHistory([
      snap({ id: "a", academicYear: "2024-2025", completionRate: 0.7 }),
      snap({ id: "b", academicYear: "2025-2026", completionRate: 0.9 }),
      snap({ id: "c", academicYear: "2026-2027", completionRate: 0.3, status: "in_progress" }),
    ]);
    expect(summary.yearsCovered).toBe(3);
    expect(summary.cumulativeLearnerCount).toBe(30);
    expect(summary.meanCompletionRate).toBeCloseTo(0.8, 3);
    expect(summary.bestYear).toBe("2025-2026");
    expect(summary.deltaToHistoricalMean).toBeCloseTo(-0.5, 3);
  });

  it("restreint le périmètre d'un encadrant à ses stages", () => {
    const all = [snap({ id: "a" }), snap({ id: "b", placementIds: ["pla-b"] })];
    expect(scopedToPlacements(all, ["pla-b"]).map((s) => s.id)).toEqual(["b"]);
    expect(scopedToPlacements(all, [])).toEqual([]);
  });

  it("produit une comparaison chiffrée entre deux promotions", () => {
    const rows = compareCohorts(
      snap({ id: "a", completionRate: 0.5 }),
      snap({ id: "b", completionRate: 0.65 }),
    );
    const completion = rows.find((r) => r.label === "Taux de réussite")!;
    expect(completion.delta).toBeCloseTo(0.15, 3);
  });

  it("garde un historique de plusieurs promotions par programme", () => {
    const diu = cohortStatistics.filter((s) => s.programId === "prog-diu-echo");
    expect(diu.length).toBeGreaterThanOrEqual(4);
    expect(new Set(diu.map((s) => s.academicYear)).size).toBe(diu.length);
  });

  it("ouvre l'outil statistique aux encadrants et profils supérieurs, pas aux apprenants", () => {
    const learner: RoleAssignment[] = [
      {
        personId: "p1",
        role: "learner",
        scope: { kind: "cohort", programId: "prog-a", cohortId: "coh-a" },
        grantedAt: "2026-01-01T00:00:00Z",
        provenance: { sourceSystem: "native" },
      },
    ];
    const supervisor: RoleAssignment[] = [
      {
        personId: "p2",
        role: "placement_supervisor",
        scope: { kind: "placement", programId: "prog-a", placementId: "pla-a" },
        grantedAt: "2026-01-01T00:00:00Z",
        provenance: { sourceSystem: "native" },
      },
    ];
    expect(canAccessStatistics(learner, "prog-a")).toBe(false);
    expect(canAccessStatistics(supervisor, "prog-a")).toBe(true);
    expect(canAccessStatistics(supervisor, "prog-b")).toBe(false);
  });
});
