/**
 * Vérifie que la progression est DÉRIVÉE des preuves du repository mock,
 * et jamais stockée comme un état déclaratif.
 */
import { describe, expect, it } from "vitest";
import { mockDataAccess } from "../mockDataAccess";
import { computeOutcomeProgress, summarizeProgress } from "@/domain/mastery";

async function passportFor(programId: string) {
  const enrollments = await mockDataAccess.people.listEnrollments("per-learner");
  const enrollment = enrollments.find((e) => e.programId === programId)!;
  const outcomes = await mockDataAccess.outcomes.listOutcomes(programId);
  const evidence = await mockDataAccess.evidence.listEvidenceForEnrollment(enrollment.id);
  const progress = outcomes.map((o) => computeOutcomeProgress(o, evidence));
  return { outcomes, evidence, progress, summary: summarizeProgress(progress) };
}

describe("progression dérivée des preuves (données mock)", () => {
  it("expose une implémentation explicitement non persistante", () => {
    expect(mockDataAccess.isMock).toBe(true);
  });

  it("calcule une progression cohérente pour le DIU d'Échocardiographie", async () => {
    const { outcomes, summary, progress } = await passportFor("prog-diu-echo");
    expect(outcomes.length).toBeGreaterThan(0);
    expect(summary.total).toBe(outcomes.length);
    expect(summary.atTarget + summary.inProgress + summary.notStarted).toBe(summary.total);
    expect(summary.percentAtTarget).toBeGreaterThanOrEqual(0);
    expect(summary.percentAtTarget).toBeLessThanOrEqual(100);
    for (const item of progress) {
      expect(item.countedEvidence.every((e) => e.outcomeId === item.outcome.id)).toBe(true);
    }
  });

  it("tombe à zéro si aucune preuve n'est fournie", async () => {
    const outcomes = await mockDataAccess.outcomes.listOutcomes("prog-diu-echo");
    const summary = summarizeProgress(outcomes.map((o) => computeOutcomeProgress(o, [])));
    expect(summary.atTarget).toBe(0);
    expect(summary.notStarted).toBe(summary.total);
    expect(summary.percentAtTarget).toBe(0);
  });

  it("aucune compétence réelle acquise sans validation d'un tiers", async () => {
    const { progress } = await passportFor("prog-diu-echo");
    for (const item of progress.filter((p) => p.outcome.nature === "real_competence")) {
      for (const ev of item.countedEvidence) {
        expect(ev.selfDeclared).toBe(false);
        expect(ev.validations.some((v) => v.decision === "validated")).toBe(true);
      }
    }
  });

  it("les rôles contextualisés du mock couvrent les deux programmes", async () => {
    const roles = await mockDataAccess.people.listRoleAssignments("per-learner");
    const programIds = roles.map((r) => ("programId" in r.scope ? r.scope.programId : "platform"));
    expect(new Set(programIds)).toEqual(new Set(["prog-diu-echo", "prog-dfasm-cardio"]));
  });
});
