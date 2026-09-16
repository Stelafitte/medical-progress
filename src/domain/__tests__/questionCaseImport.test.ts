import { describe, expect, it } from "vitest";
import { estUnLotDeDossiers, parseDossiers } from "@/domain/questionCaseImport";

const lot = JSON.stringify({
  lot: "minidp-lot1",
  cases: [
    {
      id: "MDP-19-01",
      chapter: 19,
      item: 226,
      validated: true,
      title: "Douleur thoracique",
      vignette: "Mme R., 68 ans, consulte pour une douleur thoracique.",
      steps: [
        {
          n: 1,
          reveal: null,
          format: "qru",
          outcome: "ECN-226-04",
          stem: "Probabilité ?",
          options: [
            { l: "A", t: "Faible", c: false },
            { l: "B", t: "Forte", c: true },
          ],
          answer: "Forte.",
        },
        {
          n: 2,
          reveal: "Angioscanner positif.",
          format: "qrp_longue",
          expected: 3,
          outcome: "ECN-226-09",
          stem: "Cochez 3 critères.",
          options: [{ l: "a", t: "x", c: true }],
          answer: "…",
        },
      ],
    },
  ],
});

describe("import des dossiers progressifs", () => {
  it("reconnaît un lot de dossiers, pas une banque de questions", () => {
    expect(estUnLotDeDossiers(lot)).toBe(true);
    expect(estUnLotDeDossiers(JSON.stringify({ questions: [] }))).toBe(false);
    expect(estUnLotDeDossiers("{pas du json")).toBe(false);
  });

  it("lit la forme du lot 1 et la traduit pour la RPC", () => {
    const r = parseDossiers(lot);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cases).toHaveLength(1);
    expect(r.steps).toBe(2);
    const c = r.cases[0]!;
    expect(c.external_ref).toBe("MDP-19-01");
    expect(c.kind).toBe("mini_dp");
    expect(c.item_code).toBe("226");
    expect(c.validated).toBe(true);
    const s = c.steps[1]!;
    expect(s.position).toBe(2);
    expect(s.reveal).toBe("Angioscanner positif.");
    expect(s.expected).toBe(3);
    expect(s.outcome_code).toBe("ECN-226-09");
    expect(s.options[0]).toEqual({
      letter: "A",
      body: "x",
      correct: true,
      explanation: "",
      flag: "",
      /* La source du drapeau voyage avec lui depuis le 16/09 — voir la migration
         20260916180000 : la base refuse un drapeau non documenté. */
      flag_source: "",
    });
    expect(c.steps[0]!.answer_note).toBe("Forte.");
  });

  it("refuse un dossier sans vignette ou sans étape", () => {
    expect(
      parseDossiers(JSON.stringify({ cases: [{ id: "X", vignette: "v", steps: [] }] })),
    ).toEqual({
      ok: false,
      issue: "dossier_incomplet",
    });
    expect(parseDossiers(JSON.stringify({ metadata: {} }))).toEqual({
      ok: false,
      issue: "pas_de_dossiers",
    });
  });
});
