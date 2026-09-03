/**
 * Structure de tests du socle.
 * Exécution : `bun run test`.
 */
import { describe, expect, it } from "vitest";
import { computeOutcomeProgress, isCountableEvidence, summarizeProgress } from "../mastery";
import type { Evidence, Outcome, Provenance } from "../types";
import type { OutcomeSelfReport } from "../passport";

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
  retainedAt: "2026-01-01T00:00:00Z",
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

describe("compétence réelle et auto-déclaration", () => {
  const real = outcome("real_competence");

  it("une auto-déclaration seule ne compte jamais", () => {
    const selfOnly = evidence({
      kind: "real_activity",
      selfDeclared: true,
      validations: [],
    });
    expect(isCountableEvidence(selfOnly, "real_competence")).toBe(false);
    const progress = computeOutcomeProgress(real, [selfOnly]);
    expect(progress.mastery).toBe("not_started");
    expect(progress.blockedBySelfDeclaration).toBe(true);
  });

  it("une activité saisie par l'apprenant compte après validation d'un tiers", () => {
    const validated = evidence({
      kind: "real_activity",
      selfDeclared: true,
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
    expect(isCountableEvidence(validated, "real_competence")).toBe(true);
    const progress = computeOutcomeProgress(real, [validated]);
    expect(progress.mastery).toBe("novice");
    expect(progress.blockedBySelfDeclaration).toBe(false);
  });
});

/**
 * LA DECLARATION LIBRE (objectif 3 du passeport, 03/09). La V1 est declarative :
 * « l'etudiant POSE SON NIVEAU, il n'accumule pas de preuves » (31/08). Ces
 * tests tiennent les deux moities de la regle — la declaration compte, SAUF sur
 * une competence reelle non contresignee.
 */
describe("declaration libre de l'apprenant", () => {
  const declaration = (patch: Partial<OutcomeSelfReport> = {}): OutcomeSelfReport => ({
    enrollmentId: "enr-test" as OutcomeSelfReport["enrollmentId"],
    outcomeId: "out-test" as OutcomeSelfReport["outcomeId"],
    declaredLevel: "intermediate",
    declaredAt: "2026-09-03T00:00:00Z",
    note: "",
    ...patch,
  });

  it("fait monter le niveau sur une connaissance, sans aucune preuve", () => {
    const progress = computeOutcomeProgress(outcome("knowledge"), [], declaration());
    expect(progress.mastery).toBe("intermediate");
    expect(progress.declaredLevel).toBe("intermediate");
    expect(progress.meetsTarget).toBe(true);
  });

  it("fait monter le niveau sur une competence simulee", () => {
    const progress = computeOutcomeProgress(outcome("simulated_competence"), [], declaration());
    expect(progress.mastery).toBe("intermediate");
    expect(progress.blockedBySelfDeclaration).toBe(false);
  });

  /** L'invariant du socle, teste par le chemin declaratif cette fois. */
  it("ne fait PAS monter une competence reelle sans contresignature", () => {
    const progress = computeOutcomeProgress(outcome("real_competence"), [], declaration());
    expect(progress.mastery).toBe("not_started");
    expect(progress.meetsTarget).toBe(false);
    expect(progress.blockedBySelfDeclaration).toBe(true);
    // La declaration n'est pas effacee pour autant : l'ecran doit pouvoir dire
    // « vous avez declare X, il manque la validation d'un encadrant ».
    expect(progress.declaredLevel).toBe("intermediate");
  });

  it("fait monter une competence reelle des qu'un tiers a contresigne", () => {
    const progress = computeOutcomeProgress(
      outcome("real_competence"),
      [],
      declaration({ validatedBy: "per-senior", validatedAt: "2026-09-04T00:00:00Z" }),
    );
    expect(progress.mastery).toBe("intermediate");
    expect(progress.blockedBySelfDeclaration).toBe(false);
  });

  /** On prend le maximum : une declaration modeste n'efface pas des preuves. */
  it("ne redescend jamais le niveau atteint par des preuves", () => {
    const preuves = [evidence({ id: "e1" }), evidence({ id: "e2" }), evidence({ id: "e3" })];
    const progress = computeOutcomeProgress(
      outcome("knowledge"),
      preuves,
      declaration({ declaredLevel: "novice" }),
    );
    expect(progress.mastery).toBe("proficient");
  });

  it("ignore une declaration qui vise un autre acquis", () => {
    const progress = computeOutcomeProgress(
      outcome("knowledge"),
      [],
      declaration({ outcomeId: "out-autre" as OutcomeSelfReport["outcomeId"] }),
    );
    expect(progress.mastery).toBe("not_started");
    expect(progress.declaredLevel).toBeUndefined();
  });
});
