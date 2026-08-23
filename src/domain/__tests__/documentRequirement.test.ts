import { describe, expect, it } from "vitest";
import {
  EMPTY_NEW_DOCUMENT_REQUIREMENT_INPUT,
  buildDocumentRequirementFromInput,
  diffDocumentRequirementRows,
  mergeDocumentRequirements,
  parseDocumentRequirementText,
  validateNewDocumentRequirement,
  type DocumentRequirement,
} from "@/domain/documentRequirement";
import type { ProgramId } from "@/domain/types";

const programId = "program-diu" as ProgramId;

function build(code: string, label: string, mandatory = true): DocumentRequirement {
  return buildDocumentRequirementFromInput(
    { ...EMPTY_NEW_DOCUMENT_REQUIREMENT_INPUT, code, label, mandatory },
    { programId, now: "2026-01-01T00:00:00.000Z", sequence: 1 },
  );
}

describe("pièces exigées — validation", () => {
  it("exige un code et un intitulé", () => {
    expect(validateNewDocumentRequirement(EMPTY_NEW_DOCUMENT_REQUIREMENT_INPUT)).toEqual([
      "code-required",
      "label-required",
    ]);
  });

  it("interdit au responsable de stage de valider sa propre pièce", () => {
    const issues = validateNewDocumentRequirement({
      ...EMPTY_NEW_DOCUMENT_REQUIREMENT_INPUT,
      code: "DOC-1",
      label: "Bilan",
      provider: "supervisor",
      validator: "supervisor",
    });
    expect(issues).toEqual(["supervisor-validates-supervisor-piece"]);
  });

  it("construit une pièce déterministe, code normalisé", () => {
    const requirement = build("doc-01", "  Attestation  ");
    expect(requirement.id).toBe("docreq-local-1");
    expect(requirement.code).toBe("DOC-01");
    expect(requirement.label).toBe("Attestation");
    expect(requirement.programId).toBe(programId);
  });
});

describe("pièces exigées — import", () => {
  it("lit les lignes CSV/TSV et déduit l'obligation", () => {
    const rows = parseDocumentRequirementText(
      "DOC-01;Assurance;obligatoire\nDOC-02\tConvention\tfacultative\ntrop court\nDOC-03;Charte",
    );
    expect(rows).toEqual([
      { code: "DOC-01", label: "Assurance", mandatory: true },
      { code: "DOC-02", label: "Convention", mandatory: false },
      { code: "DOC-03", label: "Charte", mandatory: true },
    ]);
  });

  it("classe nouvelles, déjà présentes, inchangées et doublons ignorés", () => {
    const existing = [build("DOC-01", "Assurance")];
    const diff = diffDocumentRequirementRows(
      parseDocumentRequirementText(
        "DOC-01;Assurance;obligatoire\nDOC-01;Assurance;obligatoire\nDOC-02;Convention\nDOC-01;Autre nom",
      ),
      existing,
    );
    expect(diff.unchangedCount).toBe(1);
    expect(diff.newCount).toBe(1);
    expect(diff.ignoredCount).toBe(2);
    expect(diff.changedCount).toBe(0);
  });

  it("fusionne sans écraser un code déjà présent", () => {
    const merged = mergeDocumentRequirements([build("DOC-01", "Assurance")], [
      build("DOC-01", "Autre"),
      build("DOC-02", "Convention"),
    ]);
    expect(merged.map((item) => item.code)).toEqual(["DOC-01", "DOC-02"]);
    expect(merged[0]?.label).toBe("Assurance");
  });
});
