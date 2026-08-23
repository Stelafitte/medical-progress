import { describe, expect, it } from "vitest";

import type { Outcome } from "@/domain/outcome";
import {
  diffReferentialRows,
  parseReferentialText,
} from "@/features/administration/competenceTrackingViewModel";

function outcome(code: string, label: string, nature: Outcome["nature"]): Outcome {
  return {
    id: `outcome-${code}`,
    programId: "program-diu-echo",
    curriculumVersionId: "cv-1",
    code,
    label,
    nature,
    description: "",
  } as Outcome;
}

const existing = [
  outcome("C-01", "Coupe parasternale grand axe", "simulated_competence"),
  outcome("K-01", "Anatomie cardiaque", "knowledge"),
];

describe("diffReferentialRows", () => {
  it("classe une ligne absente du référentiel comme nouvelle", () => {
    const diff = diffReferentialRows(
      parseReferentialText("C-99;Mesure du VTI;réelle"),
      existing,
    );
    expect(diff.newCount).toBe(1);
    expect(diff.rows[0]?.kind).toBe("new");
  });

  it("signale un code déjà présent dont l'intitulé change", () => {
    const diff = diffReferentialRows(
      parseReferentialText("C-01;Coupe parasternale revue;simulation"),
      existing,
    );
    expect(diff.changedCount).toBe(1);
    expect(diff.rows[0]?.existingLabel).toBe("Coupe parasternale grand axe");
  });

  it("reconnaît une ligne strictement identique comme inchangée", () => {
    const diff = diffReferentialRows(
      parseReferentialText("C-01;Coupe parasternale grand axe;simulation"),
      existing,
    );
    expect(diff.unchangedCount).toBe(1);
  });

  it("ignore les lignes de nature connaissance ou non précisée", () => {
    const diff = diffReferentialRows(
      parseReferentialText("K-02;Physiologie;connaissance\nX-1;Sans nature;"),
      existing,
    );
    expect(diff.ignoredCount).toBe(2);
    expect(diff.newCount).toBe(0);
  });
});
