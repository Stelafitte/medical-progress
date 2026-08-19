/**
 * Instanciation du MODÈLE GÉNÉRIQUE de programme DPC (`src/domain/dpcProgram.ts`)
 * par le démonstrateur « DPC HVG–Amylose ».
 *
 * Cette configuration est DÉRIVÉE des fixtures existantes : aucune donnée
 * médicale n'est inventée ici, aucune valeur n'est dupliquée à la main. Elle
 * démontre que 10 dossiers, 29 critères, 4 parties et 2 tours (A1/A2) sont des
 * paramètres de configuration, pas une architecture.
 *
 * Aucune interface ne consomme cette configuration à ce stade.
 */
import { dpcCriterionCount } from "@/domain/dpc";
import type {
  DpcAuditModuleConfig,
  DpcCompletenessRule,
  DpcProgramDefinition,
} from "@/domain/dpcProgram";
import {
  DPC_HVG_COHORT_ID,
  DPC_HVG_GRID_ID,
  DPC_HVG_PROGRAM_ID,
  dpcHvgGrid,
  dpcHvgQuestions,
  dpcHvgRounds,
  dpcHvgSequences,
  dpcHvgSetup,
} from "./dpcHvgFixtures";

/** Règle de complétude du démonstrateur : tous les dossiers du tour. */
const hvgCompleteness: DpcCompletenessRule = {
  allRecordsRequired: true,
  notApplicableCountsAsAnswered: true,
};

const hvgAudit: DpcAuditModuleConfig = {
  grids: [
    {
      gridId: dpcHvgGrid.id,
      title: dpcHvgGrid.title,
      version: {
        version: dpcHvgGrid.version,
        status: "published",
        ...(dpcHvgGrid.publishedAt ? { publishedAt: dpcHvgGrid.publishedAt } : {}),
        ...(dpcHvgGrid.publishedAt ? { frozenAt: dpcHvgGrid.publishedAt } : {}),
      },
      defaultRecordsPerRound: dpcHvgGrid.recordsPerRound,
      inclusionCriteria: [
        "Dossiers de patients adultes suivis par le participant, présentant une HVG à l'échocardiographie.",
        "Dossiers distincts entre les deux tours : le second tour porte sur de nouveaux dossiers.",
        "Aucune donnée identifiante : chaque dossier est désigné par une référence locale (D1…).",
      ],
      completenessRule: hvgCompleteness,
      sourceDocumentId: "doc-hvg-grid",
    },
  ],
  rounds: dpcHvgRounds.map((round, index) => ({
    roundId: round.id,
    label: round.label,
    order: index + 1,
    gridId: round.gridId,
    gridVersion: dpcHvgGrid.version,
    cohortId: round.cohortId,
    opensOn: round.opensOn,
    closesOn: round.closesOn,
  })),
};

export const dpcHvgProgramDefinition: DpcProgramDefinition = {
  id: "dpc-def-hvg-v1",
  programId: DPC_HVG_PROGRAM_ID,
  version: {
    version: "v1.0",
    status: "published",
    ...(dpcHvgGrid.publishedAt ? { publishedAt: dpcHvgGrid.publishedAt } : {}),
  },
  title: "DPC HVG–Amylose",
  orientations: dpcHvgSetup.orientations,
  targetAudience: dpcHvgSetup.targetAudience,
  objectives: dpcHvgSequences.flatMap((sequence) => sequence.objectives),
  teachingModalities: [
    {
      id: "hvg-training",
      label: "Formation",
      kind: dpcHvgSetup.trainingModality,
      durationMinutes: dpcHvgSetup.trainingDurationMinutes,
    },
    { id: "hvg-audit", label: "Audit clinique de pratiques", kind: "audit" },
  ],
  faculty: dpcHvgSetup.faculty.map((member) => ({
    personId: member.personId,
    fullName: member.fullName,
    role: member.role,
    interestsDeclared: member.interestsDeclared,
  })),
  resources: dpcHvgSequences.map((sequence) => ({
    id: sequence.id,
    label: sequence.title,
    kind: "teaching_resource" as const,
  })),
  bibliography: dpcHvgSetup.references.map((reference) => ({
    order: reference.order,
    citation: reference.citation,
    ...(reference.pmid ? { identifier: `PMID:${reference.pmid}` } : {}),
  })),
  modules: {
    clinicalAudit: true,
    knowledgeTests: dpcHvgQuestions.length > 0,
    training: true,
    attendance: true,
    improvementPlan: false,
    certificate: true,
  },
  completionRules: {
    requireAllRounds: true,
    requiredRoundIds: dpcHvgRounds.map((round) => round.id),
    requirePreTest: true,
    requirePostTest: true,
    requireAttendance: true,
    minimumProgressPoints: dpcHvgGrid.expectedProgressPoints,
  },
  schedule: dpcHvgSetup.timeline.map((step) => ({
    key: step.key,
    window: step.window,
    description: step.description,
    requirement: step.requirement,
  })),
  audit: hvgAudit,
  sourceDocuments: [
    {
      id: "doc-hvg-programme",
      kind: "program_document",
      fileName: "CORPUS_DPC_HVG_Amylose.docx",
      provenance: { sourceSystem: "native", importNote: "Corpus de référence (non ingéré)." },
    },
    {
      id: "doc-hvg-grid",
      kind: "audit_grid",
      fileName: "Audit_DPC_HVG_Amylose.docx",
      provenance: { sourceSystem: "native", importNote: "Grille de référence (non ingérée)." },
      producedRef: DPC_HVG_GRID_ID,
    },
  ],
  provenance: { sourceSystem: "native" },
};

/** Valeurs de contrôle du démonstrateur, calculées et non recopiées. */
export const dpcHvgShape = {
  criteria: dpcCriterionCount(dpcHvgGrid),
  sections: dpcHvgGrid.sections.length,
  recordsPerRound: dpcHvgGrid.recordsPerRound,
  rounds: dpcHvgRounds.length,
  cohortId: DPC_HVG_COHORT_ID,
} as const;
