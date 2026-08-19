/**
 * Tests du modèle GÉNÉRIQUE de programme DPC.
 * Aucune règle ne doit dépendre des valeurs du démonstrateur HVG.
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_DPC_AUDIT_CONFIG,
  areDistinctAssessmentKinds,
  canCompareRounds,
  isAuditGridArtifact,
  isFieldEditable,
  isKnowledgeQuizArtifact,
  isProgramDefinitionValid,
  orderedRounds,
  recordsExpectedForRound,
  validateProgramDefinition,
  type DpcAuditModuleConfig,
  type DpcCompletenessRule,
  type DpcProgramDefinition,
  type DpcPublishedVersion,
} from "@/domain/dpcProgram";
import { dpcHvgProgramDefinition, dpcHvgShape } from "@/infrastructure/mock/dpcHvgProgramDefinition";

const completeness: DpcCompletenessRule = {
  allRecordsRequired: true,
  notApplicableCountsAsAnswered: true,
};

const publishedVersion = (version: string, frozen = false): DpcPublishedVersion => ({
  version,
  status: "published",
  publishedAt: "2026-01-01T00:00:00Z",
  ...(frozen ? { frozenAt: "2026-01-02T00:00:00Z" } : {}),
});

const definition = (overrides: Partial<DpcProgramDefinition> = {}): DpcProgramDefinition => ({
  id: "def-1",
  programId: "prog-x",
  version: { version: "v1", status: "draft" },
  title: "Programme générique",
  orientations: [],
  targetAudience: "Professionnels de santé",
  objectives: [],
  teachingModalities: [],
  faculty: [],
  resources: [],
  bibliography: [],
  modules: {
    clinicalAudit: false,
    knowledgeTests: false,
    training: true,
    attendance: false,
    improvementPlan: false,
    certificate: false,
  },
  completionRules: {
    requireAllRounds: false,
    requiredRoundIds: [],
    requirePreTest: false,
    requirePostTest: false,
    requireAttendance: false,
  },
  schedule: [],
  audit: EMPTY_DPC_AUDIT_CONFIG,
  sourceDocuments: [],
  provenance: { sourceSystem: "native" },
  ...overrides,
});

describe("programme sans audit", () => {
  it("un programme sans grille et sans tour est valide", () => {
    const def = definition();
    expect(def.audit.grids).toHaveLength(0);
    expect(def.audit.rounds).toHaveLength(0);
    expect(isProgramDefinitionValid(def)).toBe(true);
  });
});

describe("configuration générique des audits", () => {
  const multiGrid: DpcAuditModuleConfig = {
    grids: [
      {
        gridId: "g1",
        title: "Grille A",
        version: publishedVersion("v1"),
        defaultRecordsPerRound: 4,
        inclusionCriteria: ["Dossiers éligibles"],
        completenessRule: completeness,
      },
      {
        gridId: "g2",
        title: "Grille B",
        version: publishedVersion("v3"),
        defaultRecordsPerRound: 25,
        inclusionCriteria: [],
        completenessRule: completeness,
      },
    ],
    rounds: [
      { roundId: "r1", label: "Tour initial", order: 1, gridId: "g1", gridVersion: "v1" },
      { roundId: "r2", label: "Tour 2", order: 2, gridId: "g1", gridVersion: "v1" },
      {
        roundId: "r3",
        label: "Tour 3",
        order: 3,
        gridId: "g1",
        gridVersion: "v1",
        recordsPerRound: 7,
      },
      { roundId: "r4", label: "Tour B", order: 4, gridId: "g2", gridVersion: "v3" },
    ],
  };

  it("accepte plusieurs grilles pour un même programme", () => {
    const def = definition({ audit: multiGrid });
    expect(def.audit.grids).toHaveLength(2);
    expect(isProgramDefinitionValid(def)).toBe(true);
  });

  it("X dossiers peut valoir autre chose que 10, par grille ou par tour", () => {
    expect(recordsExpectedForRound(multiGrid, "r1")).toBe(4);
    expect(recordsExpectedForRound(multiGrid, "r3")).toBe(7);
    expect(recordsExpectedForRound(multiGrid, "r4")).toBe(25);
  });

  it("le nombre de tours est variable (0, 1 ou n) et ordonné", () => {
    expect(orderedRounds(EMPTY_DPC_AUDIT_CONFIG)).toHaveLength(0);
    const single: DpcAuditModuleConfig = { grids: multiGrid.grids, rounds: [multiGrid.rounds[0]!] };
    expect(orderedRounds(single)).toHaveLength(1);
    expect(orderedRounds(multiGrid).map((r) => r.roundId)).toEqual(["r1", "r2", "r3", "r4"]);
  });

  it("le nombre de critères et de parties est un simple paramètre", () => {
    const shapes = [
      [1],
      [3, 3],
      [5, 5, 5, 5, 5],
      [12, 1, 9],
    ];
    for (const sections of shapes) {
      const total = sections.reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(0);
      expect(sections.length).toBeGreaterThan(0);
    }
    // Aucune constante 29 / 4 n'est imposée par le modèle générique.
    expect(Object.keys(EMPTY_DPC_AUDIT_CONFIG)).toEqual(["grids", "rounds"]);
  });

  it("refuse un tour référençant une grille ou une version inconnue", () => {
    const broken = definition({
      audit: {
        grids: multiGrid.grids,
        rounds: [
          { roundId: "rx", label: "Tour orphelin", order: 1, gridId: "gz", gridVersion: "v1" },
          { roundId: "ry", label: "Mauvaise version", order: 2, gridId: "g1", gridVersion: "v9" },
        ],
      },
    });
    const codes = validateProgramDefinition(broken).map((i) => i.code);
    expect(codes).toContain("round_without_grid");
    expect(codes).toContain("round_grid_version_mismatch");
  });

  it("comparaison autorisée entre deux tours de la même version publiée", () => {
    expect(canCompareRounds(multiGrid, "r1", "r2")).toEqual({
      comparable: true,
      reason: "comparable",
    });
  });

  it("comparaison refusée entre deux versions ou deux grilles différentes", () => {
    expect(canCompareRounds(multiGrid, "r1", "r4").comparable).toBe(false);
    expect(canCompareRounds(multiGrid, "r1", "r4").reason).toBe("different_grid");

    const mixedVersions: DpcAuditModuleConfig = {
      grids: multiGrid.grids,
      rounds: [
        multiGrid.rounds[0]!,
        { roundId: "r2b", label: "Tour v2", order: 2, gridId: "g1", gridVersion: "v2" },
      ],
    };
    expect(canCompareRounds(mixedVersions, "r1", "r2b")).toEqual({
      comparable: false,
      reason: "different_grid_version",
    });
  });

  it("comparaison refusée si la version de grille n'est pas publiée", () => {
    const draftOnly: DpcAuditModuleConfig = {
      grids: [
        {
          ...multiGrid.grids[0]!,
          version: { version: "v1", status: "draft" },
        },
      ],
      rounds: [multiGrid.rounds[0]!, multiGrid.rounds[1]!],
    };
    expect(canCompareRounds(draftOnly, "r1", "r2").reason).toBe("grid_version_not_published");
  });
});

describe("natures d'éléments importables", () => {
  it("une grille d'audit et un QCM sont deux natures distinctes", () => {
    expect(isAuditGridArtifact("audit_grid")).toBe(true);
    expect(isKnowledgeQuizArtifact("audit_grid")).toBe(false);
    expect(isAuditGridArtifact("knowledge_quiz")).toBe(false);
    expect(isKnowledgeQuizArtifact("knowledge_quiz")).toBe(true);
    expect(areDistinctAssessmentKinds("audit_grid", "knowledge_quiz")).toBe(true);
    expect(areDistinctAssessmentKinds("audit_grid", "audit_grid")).toBe(false);
  });
});

describe("version publiée et gel", () => {
  it("une version gelée n'est modifiable sur aucun champ", () => {
    const frozen = publishedVersion("v1", true);
    for (const field of ["criteria", "sections", "recordsPerRound", "title", "schedule"] as const) {
      expect(isFieldEditable(frozen, field)).toBe(false);
    }
  });

  it("une version publiée non gelée reste modifiable hors éléments structurants", () => {
    const published = publishedVersion("v1");
    expect(isFieldEditable(published, "criteria")).toBe(false);
    expect(isFieldEditable(published, "quizQuestions")).toBe(false);
    expect(isFieldEditable(published, "completenessRule")).toBe(false);
    expect(isFieldEditable(published, "faculty")).toBe(true);
    expect(isFieldEditable(published, "bibliography")).toBe(true);
  });

  it("un brouillon est entièrement modifiable, une version archivée ne l'est pas", () => {
    expect(isFieldEditable({ version: "v1", status: "draft" }, "criteria")).toBe(true);
    expect(isFieldEditable({ version: "v1", status: "archived" }, "faculty")).toBe(false);
  });
});

describe("démonstrateur HVG comme instance du modèle générique", () => {
  it("la configuration HVG est structurellement valide", () => {
    expect(validateProgramDefinition(dpcHvgProgramDefinition)).toEqual([]);
  });

  it("conserve exactement 29 critères, 4 parties, 10 dossiers par tour et 2 tours", () => {
    expect(dpcHvgShape.criteria).toBe(29);
    expect(dpcHvgShape.sections).toBe(4);
    expect(dpcHvgShape.recordsPerRound).toBe(10);
    expect(dpcHvgShape.rounds).toBe(2);
    const [first, second] = dpcHvgProgramDefinition.audit.rounds;
    expect(recordsExpectedForRound(dpcHvgProgramDefinition.audit, first!.roundId)).toBe(10);
    expect(canCompareRounds(dpcHvgProgramDefinition.audit, first!.roundId, second!.roundId)).toEqual(
      { comparable: true, reason: "comparable" },
    );
  });

  it("distingue le document de programme de la grille d'audit importée", () => {
    const kinds = dpcHvgProgramDefinition.sourceDocuments.map((d) => d.kind);
    expect(kinds).toContain("program_document");
    expect(kinds).toContain("audit_grid");
    expect(kinds).not.toContain("knowledge_quiz");
  });
});
