import { describe, expect, it } from "vitest";
import type { DpcAnswer, DpcAuditRecord } from "@/domain/dpc";
import {
  buildCriterionParamMap,
  compareAudits,
  compareCriterion,
  criterionModality,
  unvalidatedCriterionParams,
} from "@/domain/dpcAuditComparison";
import * as comparison from "@/domain/dpcAuditComparison";

const rec = (ref: string, answers: Record<string, DpcAnswer>): DpcAuditRecord => ({ ref, answers });
const many = (id: string, answers: DpcAnswer[]): DpcAuditRecord[] =>
  answers.map((a, i) => rec(`D${i + 1}`, { [id]: a }));

const params = buildCriterionParamMap([
  { criterionId: "c1", expectedAnswer: "yes", priorityRank: 1, fundamental: true },
  { criterionId: "c2", expectedAnswer: "no", priorityRank: 2 },
  { criterionId: "c3", expectedAnswer: "yes", priorityRank: 3 },
]);

describe("modalité représentative", () => {
  it("retient Oui majoritaire", () => {
    expect(criterionModality("c1", many("c1", ["yes", "yes", "no"])).modality).toBe("yes");
  });

  it("retient Non majoritaire", () => {
    expect(criterionModality("c1", many("c1", ["no", "no", "yes"])).modality).toBe("no");
  });

  it("exclut les N/A du dénominateur interprétable", () => {
    const m = criterionModality("c1", many("c1", ["yes", "na", "na", "na"]));
    expect(m.interpretable).toBe(1);
    expect(m.notApplicable).toBe(3);
    expect(m.modality).toBe("yes");
  });

  it("retourne missing quand tout est N/A", () => {
    expect(criterionModality("c1", many("c1", ["na", "na"])).modality).toBe("missing");
  });

  it("retourne missing sans aucun dossier", () => {
    expect(criterionModality("c1", []).modality).toBe("missing");
  });

  it("retourne indeterminate en cas d'égalité Oui/Non", () => {
    expect(criterionModality("c1", many("c1", ["yes", "no"])).modality).toBe("indeterminate");
  });
});

describe("conformité paramétrable", () => {
  it("critère attendu Oui : Oui est conforme", () => {
    const c = compareCriterion("c1", many("c1", ["yes"]), many("c1", ["yes"]), params);
    expect(c.a1Conformity).toBe("conform");
    expect(c.status).toBe("maintained");
  });

  it("critère à logique inversée attendu Non : Non est conforme", () => {
    const c = compareCriterion("c2", many("c2", ["no"]), many("c2", ["no"]), params);
    expect(c.a1Conformity).toBe("conform");
    expect(c.status).toBe("maintained");
    const inverse = compareCriterion("c2", many("c2", ["yes"]), many("c2", ["yes"]), params);
    expect(inverse.status).toBe("persistent_gap");
  });

  it("sans paramétrage validé, aucune conclusion de conformité", () => {
    const c = compareCriterion("cX", many("cX", ["yes"]), many("cX", ["yes"]));
    expect(c.status).toBe("indeterminate");
    expect(c.parametersPending).toBe(true);
  });
});

describe("quatre transitions principales", () => {
  const t = (a1: DpcAnswer, a2: DpcAnswer) =>
    compareCriterion("c1", many("c1", [a1]), many("c1", [a2]), params).status;

  it("maintained", () => expect(t("yes", "yes")).toBe("maintained"));
  it("improved", () => expect(t("no", "yes")).toBe("improved"));
  it("regressed", () => expect(t("yes", "no")).toBe("regressed"));
  it("persistent_gap", () => expect(t("no", "no")).toBe("persistent_gap"));
});

describe("données manquantes", () => {
  it("A1 manquant", () => {
    expect(compareCriterion("c1", [], many("c1", ["yes"]), params).status).toBe("missing_a1");
  });
  it("A2 manquant", () => {
    expect(compareCriterion("c1", many("c1", ["yes"]), [], params).status).toBe("missing_a2");
  });
});

describe("synthèse déterministe", () => {
  const a1 = [rec("D1", { c1: "yes", c2: "yes", c3: "no" })];
  const a2 = [rec("D1", { c1: "no", c2: "no", c3: "yes" })];
  const result = compareAudits(["c1", "c2", "c3"], a1, a2, params);

  it("compteurs globaux", () => {
    expect(result.summary.regressedCount).toBe(1);
    expect(result.summary.improvedCount).toBe(2);
    expect(result.summary.maintainedCount).toBe(0);
    expect(result.summary.persistentGapCount).toBe(0);
    expect(result.summary.missingOrIndeterminateCount).toBe(0);
  });

  it("fondamentaux évalués à A2", () => {
    expect(result.summary.fundamentalsTotal).toBe(1);
    expect(result.summary.fundamentalsConformAtA2).toBe(0);
  });

  it("priorise les listes (fondamental puis rang)", () => {
    const ordered = compareAudits(
      ["c3", "c2", "c1"],
      [rec("D1", { c1: "no", c2: "yes", c3: "no" })],
      [rec("D1", { c1: "yes", c2: "no", c3: "yes" })],
      params,
    );
    expect(ordered.summary.improvements.map((i) => i.criterionId)).toEqual(["c1", "c2", "c3"]);
  });

  it("interdit toute conclusion d'efficacité si A2 est incomplet", () => {
    const partial = compareAudits(["c1", "c2", "c3"], a1, [], params);
    expect(partial.summary.a2Incomplete).toBe(true);
    expect(partial.summary.efficacyConclusionAllowed).toBe(false);
    expect(result.summary.efficacyConclusionAllowed).toBe(true);
  });

  it("liste les critères dont le paramétrage reste à valider", () => {
    const pending = compareAudits(["c1", "cX"], a1, a2, params);
    expect(pending.summary.criteriaPendingValidation).toEqual(["cX"]);
    expect(unvalidatedCriterionParams(["c1", "c2"], params)).toEqual([]);
  });
});

describe("sécurité méthodologique", () => {
  it("n'expose aucun appel IA ni génération de texte", () => {
    const source = comparison as Record<string, unknown>;
    const names = Object.keys(source).join(" ").toLowerCase();
    expect(names).not.toMatch(/ai|llm|openai|prompt|generate|narrat/);
    expect(Object.values(source).every((v) => typeof v !== "undefined")).toBe(true);
  });

  it("n'invente aucune donnée manquante", () => {
    const c = compareCriterion("c1", [], [], params);
    expect(c.a1.interpretable).toBe(0);
    expect(c.a2.interpretable).toBe(0);
    expect(c.status).toBe("missing_a1");
  });
});
