/**
 * Structure de tests du socle.
 * Exécution : `bunx vitest run` (vitest à installer lors de l'itération suivante).
 */
import { describe, expect, it } from "vitest";
import { computeOutcomeProgress, isCountableEvidence, summarizeProgress } from "../mastery";
import type { Evidence, Outcome, Provenance } from "../types";

const provenance: Provenance = { sourceSystem: "native" };

const outcome = (nature: Outcome["nature"]): Outcome => ({
  id: "out-test",
  createdAt: "2026-01-01T00:00:00Z",
  provenance,
  programId: "prog-test",
  curriculumVersionId: "cv-test",
  code: "T-1",
  label: "Acquis de test",
  description: "",
  nature,
  domain: "Test",
  targetMastery: "novice",
});

const evidence = (patch: Partial<Evidence>): Evidence => ({
  id: "evi-test",
  createdAt: "2026-01-01T00:00:00Z",
  provenance,
  enrollmentId: "enr-test",
  outcomeId: "out-test",
  kind: "quiz",
  status: "validated",
  title: "Preuve",
  occurredAt: "2026-01-01T00:00:00Z",
  selfDeclared: false,
  validations: [],
  ...patch,
});

describe("isCountableEvidence", () => {
  it("refuse une compétence réelle auto-déclarée sans validateur", () => {
    const ev = evidence({ kind: "real_activity", selfDeclared: true });
    expect(isCountableEvidence(ev, "real_competence")).toBe(false);
  });

  it("accepte une compétence réelle validée par un tiers", () => {
    const ev = evidence({
      kind: "real_activity",
      validations: [
        {
          evidenceId: "evi-test",
          validatorPersonId: "per-sup",
          validatorRole: "placement_supervisor",
          decision: "validated",
          decidedAt: "2026-01-02T00:00:00Z",
          provenance,
        },
      ],
    });
    expect(isCountableEvidence(ev, "real_competence")).toBe(true);
  });

  it("ignore les preuves non validées", () => {
    expect(isCountableEvidence(evidence({ status: "submitted" }), "knowledge")).toBe(false);
  });
});

describe("computeOutcomeProgress", () => {
  it("signale un blocage par auto-déclaration", () => {
    const progress = computeOutcomeProgress(outcome("real_competence"), [
      evidence({ kind: "real_activity", selfDeclared: true }),
    ]);
    expect(progress.mastery).toBe("not_started");
    expect(progress.blockedBySelfDeclaration).toBe(true);
  });

  it("atteint la cible avec une preuve recevable", () => {
    const progress = computeOutcomeProgress(outcome("knowledge"), [evidence({})]);
    expect(progress.meetsTarget).toBe(true);
    expect(summarizeProgress([progress]).percentAtTarget).toBe(100);
  });
});
