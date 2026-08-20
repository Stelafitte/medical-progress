/**
 * Tests du brouillon de programme DPC : natures de documents, marqueurs
 * « simulé », checklist et blocage de publication.
 */
import { describe, expect, it } from "vitest";
import {
  DPC_SIMULATED_EXTRACTION_NOTICE_FR,
  DPC_WIZARD_STEPS,
  canAssignKind,
  detectPatientDataMarkers,
  documentKindConflict,
  draftFromDefinition,
  draftShape,
  publicationChecklist,
  publicationReadiness,
  toggleDocumentKind,
  unclassifiedDocuments,
} from "@/domain/dpcProgramDraft";
import type { DpcDraftDocument } from "@/domain/dpcProgramDraft";
import { dpcHvgProgramDefinition, dpcHvgShape } from "@/infrastructure/mock/dpcHvgProgramDefinition";
import { dpcHvgQuestions } from "@/infrastructure/mock/dpcHvgFixtures";
import {
  dpcDraftDemoStates,
  dpcHvgDraft,
  dpcIncompleteDraft,
  dpcReadyToPublishDraft,
} from "@/infrastructure/mock/dpcDraftFixtures";

const doc = (kinds: DpcDraftDocument["kinds"]): DpcDraftDocument => ({
  id: "d1",
  fileName: "f.docx",
  kinds,
  simulated: true,
});

describe("étapes de l'assistant", () => {
  it("expose sept étapes ordonnées, calendrier et plan de communication inclus", () => {
    expect(DPC_WIZARD_STEPS).toHaveLength(7);
    expect(DPC_WIZARD_STEPS.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(DPC_WIZARD_STEPS.map((s) => s.id)).toEqual([
      "source_documents",
      "proposed_extraction",
      "audit_configuration",
      "assessment_separation",
      "implementation_schedule",
      "communication_plan",
      "publication_check",
    ]);
  });
});

describe("classement des documents", () => {
  it("refuse un document classé grille d'audit ET QCM", () => {
    const conflict = documentKindConflict(["audit_grid", "knowledge_quiz"]);
    expect(conflict.conflict).toBe(true);
    expect(canAssignKind(doc(["audit_grid"]), "knowledge_quiz").conflict).toBe(true);
    expect(canAssignKind(doc(["knowledge_quiz"]), "audit_grid").conflict).toBe(true);
  });

  it("autorise les autres cumuls de nature", () => {
    expect(canAssignKind(doc(["bibliography"]), "teaching_resource").conflict).toBe(false);
    expect(documentKindConflict(["program_document", "teaching_resource"]).conflict).toBe(false);
  });

  it("ignore un ajout conflictuel et permet le retrait", () => {
    const grid = doc(["audit_grid"]);
    expect(toggleDocumentKind(grid, "knowledge_quiz")).toEqual(grid);
    expect(toggleDocumentKind(grid, "audit_grid").kinds).toEqual([]);
  });

  it("repère les documents sans nature attribuée", () => {
    expect(unclassifiedDocuments([doc([]), doc(["audit_grid"])])).toHaveLength(1);
  });
});

describe("chargement du démonstrateur HVG depuis le modèle générique", () => {
  const draft = draftFromDefinition(dpcHvgProgramDefinition, {
    id: "d",
    label: "l",
    quizCount: dpcHvgQuestions.length,
  });

  it("marque toujours l'extraction comme simulée", () => {
    expect(draft.extraction.extractionMode).toBe("simulated");
    expect(DPC_SIMULATED_EXTRACTION_NOTICE_FR).toContain("simulée");
    expect(draft.publicationSimulated).toBe(true);
    expect(draft.documents.every((d) => d.simulated)).toBe(true);
  });

  it("reprend la configuration d'audit de la définition générique", () => {
    expect(draft.audit).toBe(dpcHvgProgramDefinition.audit);
    const shape = draftShape(draft);
    expect(shape.grids).toBe(1);
    expect(shape.rounds).toBe(dpcHvgShape.rounds);
    expect(shape.recordsPerRound.every((r) => r.records === dpcHvgShape.recordsPerRound)).toBe(true);
  });

  it("ne fabrique aucune validation médicale", () => {
    expect(draft.medicalParametersValidated).toBe(false);
    expect(draft.humanValidation).toBeUndefined();
  });
});

describe("absence de valeurs génériques codées en dur", () => {
  it("dérive les valeurs du démonstrateur au lieu de les imposer", () => {
    const shape = draftShape(dpcHvgDraft);
    expect(shape.rounds).toBe(dpcHvgProgramDefinition.audit.rounds.length);
    expect(shape.quizzes).toBe(dpcHvgQuestions.length);
  });

  it("accepte des configurations de tailles différentes", () => {
    const ready = draftShape(dpcReadyToPublishDraft);
    expect(ready.grids).toBe(2);
    expect(ready.rounds).toBe(3);
    expect(new Set(ready.recordsPerRound.map((r) => r.records)).size).toBeGreaterThan(1);
    expect(ready.recordsPerRound.map((r) => r.records)).not.toContain(10);
  });

  it("valide un programme sans aucun audit", () => {
    const noAudit = publicationChecklist(dpcIncompleteDraft);
    const grid = noAudit.find((i) => i.id === "grid_validated")!;
    expect(grid.required).toBe(false);
    expect(grid.satisfied).toBe(true);
  });
});

describe("checklist de contrôle avant publication", () => {
  it("couvre les onze points attendus", () => {
    expect(publicationChecklist(dpcHvgDraft).map((i) => i.id)).toEqual([
      "program_complete",
      "documents_classified",
      "grid_validated",
      "medical_parameters_validated",
      "completeness_rules_defined",
      "schedule_defined",
      "implementation_planned",
      "no_patient_data",
      "quiz_separated_from_audits",
      "version_and_checksum",
      "human_validation_recorded",
    ]);
  });

  it("bloque la publication d'un brouillon incomplet", () => {
    const readiness = publicationReadiness(dpcIncompleteDraft);
    expect(readiness.canPublish).toBe(false);
    expect(readiness.blocking.map((i) => i.id)).toContain("documents_classified");
    expect(readiness.simulated).toBe(true);
  });

  it("bloque la publication du démonstrateur HVG tant que la validation médicale manque", () => {
    const readiness = publicationReadiness(dpcHvgDraft);
    expect(readiness.canPublish).toBe(false);
    expect(readiness.blocking.map((i) => i.id)).toContain("medical_parameters_validated");
    expect(readiness.blocking.map((i) => i.id)).toContain("human_validation_recorded");
  });

  it("bloque la publication si le paramétrage médical est retiré d'une configuration prête", () => {
    expect(publicationReadiness(dpcReadyToPublishDraft).canPublish).toBe(true);
    const stripped = { ...dpcReadyToPublishDraft, medicalParametersValidated: false };
    expect(publicationReadiness(stripped).canPublish).toBe(false);
  });

  it("bloque la publication sans validation humaine enregistrée", () => {
    const { humanValidation: _ignored, ...rest } = dpcReadyToPublishDraft;
    expect(publicationReadiness(rest).canPublish).toBe(false);
  });

  it("bloque la publication sans version ni empreinte", () => {
    const { checksum: _ignored, ...rest } = dpcReadyToPublishDraft;
    expect(publicationReadiness(rest).blocking.map((i) => i.id)).toContain("version_and_checksum");
  });

  it("bloque la publication si un document est classé audit ET QCM", () => {
    const broken = {
      ...dpcReadyToPublishDraft,
      documents: dpcReadyToPublishDraft.documents.map((d) =>
        d.id === "demo-doc-grille" ? { ...d, kinds: ["audit_grid", "knowledge_quiz"] as const } : d,
      ),
    };
    const ids = publicationReadiness(broken).blocking.map((i) => i.id);
    expect(ids).toContain("quiz_separated_from_audits");
    expect(ids).toContain("documents_classified");
  });
});

describe("absence de données patients", () => {
  it("détecte les marqueurs identifiants", () => {
    expect(detectPatientDataMarkers(["Nom du patient et date de naissance"])).toHaveLength(2);
    expect(detectPatientDataMarkers(["Dossier D1, référence locale"])).toEqual([]);
  });

  it("bloque la publication en présence d'un marqueur identifiant", () => {
    const risky = {
      ...dpcReadyToPublishDraft,
      audit: {
        ...dpcReadyToPublishDraft.audit,
        grids: dpcReadyToPublishDraft.audit.grids.map((grid, index) =>
          index === 0
            ? { ...grid, inclusionCriteria: [...grid.inclusionCriteria, "Saisir le nom du patient"] }
            : grid,
        ),
      },
    };
    expect(publicationReadiness(risky).blocking.map((i) => i.id)).toContain("no_patient_data");
  });
});

describe("états de démonstration", () => {
  it("propose un brouillon incomplet, le démonstrateur HVG et un aperçu publiable", () => {
    expect(dpcDraftDemoStates.map((s) => s.key)).toEqual(["incomplete", "hvg", "ready"]);
    expect(dpcDraftDemoStates.every((s) => s.draft.publicationSimulated)).toBe(true);
    expect(dpcDraftDemoStates.every((s) => s.draft.extraction.extractionMode === "simulated")).toBe(
      true,
    );
  });
});
