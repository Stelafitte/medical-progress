import { describe, expect, it } from "vitest";
import {
  CREDIT_UNIT_COST_BY_TIER,
  budgetStateFor,
  buildAiCreditAccount,
  expectedCreditsFor,
  isEntryConsistent,
  projectPeriodCredits,
} from "@/domain/aiCredits";
import { CONTENT_AI_MODE_LABELS_FR } from "@/domain/contentAi";
import { aiCreditBudgets, aiCreditEntries } from "@/infrastructure/mock/aiCreditsFixtures";

const accountFor = (programId: string) =>
  buildAiCreditAccount(
    programId,
    aiCreditEntries,
    aiCreditBudgets.find((b) => b.programId === programId),
    { cohort: (id) => id, mode: (m) => CONTENT_AI_MODE_LABELS_FR[m] },
  );

describe("crédits IA — barème et cohérence", () => {
  it("dérive le palier du mode et applique le barème", () => {
    expect(expectedCreditsFor("ask", 10)).toBe(CREDIT_UNIT_COST_BY_TIER.light_model * 10);
    expect(expectedCreditsFor("voice", 2)).toBe(CREDIT_UNIT_COST_BY_TIER.realtime_voice * 2);
  });

  it("toutes les écritures de démonstration sont cohérentes et non mesurées", () => {
    for (const entry of aiCreditEntries) {
      expect(isEntryConsistent(entry)).toBe(true);
      expect(entry.meteringActivated).toBe(false);
    }
  });

  it("rejette une écriture au palier incohérent", () => {
    const [first] = aiCreditEntries;
    expect(isEntryConsistent({ ...first!, tier: "realtime_voice" })).toBe(false);
    expect(isEntryConsistent({ ...first!, units: 0 })).toBe(false);
  });
});

describe("crédits IA — comptabilité par enseignement", () => {
  it("isole strictement les écritures d'un programme", () => {
    const diu = accountFor("prog-diu-echo");
    const dfasm = accountFor("prog-dfasm-cardio");
    expect(diu.entryCount).toBeGreaterThan(0);
    expect(dfasm.entryCount).toBeGreaterThan(0);
    expect(diu.entryCount + dfasm.entryCount).toBe(aiCreditEntries.length);
    expect(diu.byCohort.every((r) => r.key === "coh-diu-2026")).toBe(true);
  });

  it("le total est la somme des répartitions", () => {
    const account = accountFor("prog-diu-echo");
    const sum = (rows: readonly { credits: number }[]) => rows.reduce((t, r) => t + r.credits, 0);
    expect(sum(account.byTier)).toBe(account.totalCredits);
    expect(sum(account.byMode)).toBe(account.totalCredits);
    expect(sum(account.byActorRole)).toBe(account.totalCredits);
    expect(sum(account.byMonth)).toBe(account.totalCredits);
    expect(account.meteringActivated).toBe(false);
  });

  it("qualifie l'état budgétaire", () => {
    const budget = aiCreditBudgets[0]!;
    expect(budgetStateFor(budget, 100)).toBe("ok");
    expect(budgetStateFor(budget, budget.allocatedCredits * budget.warningRatio)).toBe("warning");
    expect(budgetStateFor(budget, budget.allocatedCredits + 1)).toBe("exceeded");
    expect(budgetStateFor(budget, budget.hardCapCredits)).toBe("capped");
    expect(budgetStateFor(undefined, 999)).toBe("ok");
  });

  it("projette la période sans consommation négative", () => {
    const account = accountFor("prog-dfasm-cardio");
    expect(projectPeriodCredits(account, 0, 12)).toBe(account.totalCredits);
    expect(projectPeriodCredits(account, 4, 12)).toBeGreaterThanOrEqual(account.totalCredits);
    expect(account.remainingCredits).toBeGreaterThanOrEqual(0);
  });
});
