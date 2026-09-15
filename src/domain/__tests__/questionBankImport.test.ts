import { describe, expect, it } from "vitest";
import { chunk, mergeReports, parseBanque } from "@/domain/questionBankImport";

const banque = JSON.stringify({
  metadata: { generated: 2 },
  questions: [
    {
      id: "CARDIO26-01-001",
      chapter: 1,
      chapter_title: "CHAPITRE 1: Item 221 Athérome",
      section: "I.A",
      section_title: "Mortalité",
      outcome: "ECN-221-04",
      rank: "b",
      stem: "Énoncé un.",
      options: [
        { letter: "a", correct: true, text: "Oui", explanation: "parce que" },
        { letter: "b", correct: false, text: "Non" },
      ],
    },
    { id: "CARDIO26-02-001", chapter: 2, outcome: "ECN-222-01", stem: "Énoncé deux.", options: [] },
  ],
});

describe("import de la banque de questions", () => {
  it("lit la forme du 12/09 et la traduit pour la RPC", () => {
    const r = parseBanque(banque);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.questions).toHaveLength(2);
    expect(r.chapters).toBe(2);
    const q = r.questions[0]!;
    expect(q.external_ref).toBe("CARDIO26-01-001");
    expect(q.outcome_code).toBe("ECN-221-04");
    expect(q.section_label).toBe("I.A — Mortalité");
    expect(q.chapter_title).toBe("CHAPITRE 1: Item 221 Athérome");
    expect(r.questions[1]!.chapter_title).toBe("");
    expect(q.rank).toBe("B");
    expect(r.questions[1]!.rank).toBe("");
    expect(q.options[0]).toEqual({ letter: "A", body: "Oui", correct: true, explanation: "parce que" });
    expect(q.options[1]?.explanation).toBe("");
  });

  it("refuse un fichier sans identité de question", () => {
    const r = parseBanque(JSON.stringify({ questions: [{ stem: "sans id ni outcome" }] }));
    expect(r).toEqual({ ok: false, issue: "question_sans_reference" });
  });

  it("refuse ce qui n'est pas du JSON, ou n'a pas de questions", () => {
    expect(parseBanque("{pas du json")).toEqual({ ok: false, issue: "fichier_illisible" });
    expect(parseBanque(JSON.stringify({ metadata: {} }))).toEqual({ ok: false, issue: "pas_de_questions" });
  });

  it("découpe par lots et additionne les rapports, codes dédoublonnés", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    const base = { mode: "dry_run" as const, source: "s", deleted: 0, retired: 0 };
    const total = mergeReports([
      { ...base, matched: 3, unmatched: 1, unmatched_codes: ["ECN-9-9"], inserted: 3, updated: 0 },
      { ...base, matched: 2, unmatched: 2, unmatched_codes: ["ECN-9-9", "ECN-8-8"], inserted: 1, updated: 1 },
    ]);
    expect(total).toMatchObject({ matched: 5, unmatched: 3, inserted: 4, updated: 1 });
    expect(total?.unmatched_codes).toEqual(["ECN-8-8", "ECN-9-9"]);
    expect(mergeReports([])).toBeNull();
  });
});
