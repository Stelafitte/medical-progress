/**
 * EXEMPLE de programme DPC entièrement mocké, pour démontrer que le socle
 * couvre ce cas d'usage sans architecture séparée.
 * Aucune donnée réelle, aucune donnée patient : les dossiers audités sont
 * désignés par des références anonymes.
 */
import type {
  ClinicalAuditCampaign,
  ClinicalAuditSubmission,
  ClinicalAuditTemplate,
  PrePostTest,
  PrePostTestResult,
  TeachingSession,
} from "@/domain/clinicalAudit";
import type {
  Cohort,
  CurriculumVersion,
  Enrollment,
  Outcome,
  Person,
  Program,
  Provenance,
  RoleAssignment,
} from "@/domain/types";

const native: Provenance = { sourceSystem: "native" };
const base = { createdAt: "2026-01-05T08:00:00Z", provenance: native };

export const DPC_PROGRAM_ID = "prog-dpc-fa";

export const dpcProgram: Program = {
  ...base,
  id: DPC_PROGRAM_ID,
  code: "DPC-FA",
  name: "DPC — Fibrillation atriale en soins primaires",
  kind: "dpc",
  institution: "Organisme de DPC (démonstration)",
  annualLearnerEstimate: 250,
  config: {
    // Programme sans stage ni simulation : les modules sont désactivés.
    placementsEnabled: false,
    simulationEnabled: false,
    realCompetenceRequiresValidator: true,
    targetMastery: "intermediate",
    // Modules optionnels activés pour ce programme uniquement.
    auditsEnabled: true,
    prePostTestsEnabled: true,
    sessionsEnabled: true,
    locale: "fr-FR",
  },
};

export const dpcCurriculumVersion: CurriculumVersion = {
  ...base,
  id: "cv-dpc-2026",
  programId: DPC_PROGRAM_ID,
  label: "Programme intégré 2026 (audit + formation + audit)",
  effectiveFrom: "2026-03-01T00:00:00Z",
  status: "active",
};

export const dpcCohort: Cohort = {
  ...base,
  id: "coh-dpc-2026",
  programId: DPC_PROGRAM_ID,
  curriculumVersionId: "cv-dpc-2026",
  label: "Session DPC printemps 2026",
  academicYear: "2026",
  startsOn: "2026-03-15T00:00:00Z",
  endsOn: "2026-11-30T00:00:00Z",
  learnerCount: 24,
};

export const dpcPeople: readonly Person[] = [
  {
    ...base,
    id: "per-dpc-learner",
    fullName: "Dr Sophie Marchand",
    email: "sophie.demo@example.org",
  },
  {
    ...base,
    id: "per-dpc-learner-2",
    fullName: "Dr Julien Attia",
    email: "julien.demo@example.org",
  },
];

export const dpcOutcomes: readonly Outcome[] = [
  {
    ...base,
    id: "out-dpc-score",
    programId: DPC_PROGRAM_ID,
    curriculumVersionId: "cv-dpc-2026",
    code: "DPC-1.1",
    label: "Évaluer le risque thromboembolique et hémorragique",
    description: "Utiliser les scores recommandés pour décider de l'anticoagulation.",
    nature: "knowledge",
    domain: "Décision thérapeutique",
    targetMastery: "proficient",
  },
  {
    ...base,
    id: "out-dpc-anticoag",
    programId: DPC_PROGRAM_ID,
    curriculumVersionId: "cv-dpc-2026",
    code: "DPC-1.2",
    label: "Prescrire et surveiller une anticoagulation",
    description: "Adapter la prescription à la fonction rénale et aux interactions.",
    nature: "knowledge",
    domain: "Décision thérapeutique",
    targetMastery: "proficient",
  },
  {
    ...base,
    id: "out-dpc-pratique",
    programId: DPC_PROGRAM_ID,
    curriculumVersionId: "cv-dpc-2026",
    code: "DPC-2.1",
    label: "Mettre sa pratique en conformité sur ses propres dossiers",
    description:
      "Démontrer, par audit de dossiers avant puis après formation, une amélioration de la conformité.",
    nature: "real_competence",
    domain: "Amélioration des pratiques",
    targetMastery: "intermediate",
  },
];

export const dpcEnrollments: readonly Enrollment[] = [
  {
    ...base,
    id: "enr-dpc",
    personId: "per-learner",
    programId: DPC_PROGRAM_ID,
    cohortId: "coh-dpc-2026",
    status: "active",
  },
  {
    ...base,
    id: "enr-dpc-2",
    personId: "per-dpc-learner",
    programId: DPC_PROGRAM_ID,
    cohortId: "coh-dpc-2026",
    status: "active",
  },
  {
    ...base,
    id: "enr-dpc-3",
    personId: "per-dpc-learner-2",
    programId: DPC_PROGRAM_ID,
    cohortId: "coh-dpc-2026",
    status: "active",
  },
];

export const dpcRoleAssignments: readonly RoleAssignment[] = [
  {
    personId: "per-learner",
    role: "learner",
    scope: { kind: "cohort", programId: DPC_PROGRAM_ID, cohortId: "coh-dpc-2026" },
    grantedAt: "2026-03-15T00:00:00Z",
    provenance: native,
  },
  {
    personId: "per-dpc-learner",
    role: "learner",
    scope: { kind: "cohort", programId: DPC_PROGRAM_ID, cohortId: "coh-dpc-2026" },
    grantedAt: "2026-03-15T00:00:00Z",
    provenance: native,
  },
  {
    personId: "per-dpc-learner-2",
    role: "learner",
    scope: { kind: "cohort", programId: DPC_PROGRAM_ID, cohortId: "coh-dpc-2026" },
    grantedAt: "2026-03-15T00:00:00Z",
    provenance: native,
  },
  {
    personId: "per-teacher",
    role: "teacher",
    scope: { kind: "program", programId: DPC_PROGRAM_ID },
    grantedAt: "2026-01-05T00:00:00Z",
    provenance: native,
  },
  {
    personId: "per-admin",
    role: "administrator",
    scope: { kind: "program", programId: DPC_PROGRAM_ID },
    grantedAt: "2026-01-05T00:00:00Z",
    provenance: native,
  },
];

/* ------------------------------------------------------------------ */
/* Grille d'audit (exemple)                                           */
/* ------------------------------------------------------------------ */

export const auditTemplates: readonly ClinicalAuditTemplate[] = [
  {
    id: "aud-tpl-fa",
    programId: DPC_PROGRAM_ID,
    title: "Audit de dossiers — Fibrillation atriale non valvulaire",
    description:
      "Grille de 6 critères appliquée à 5 dossiers anonymisés du praticien, avant puis après la formation.",
    status: "published",
    recordsPerParticipant: 5,
    targetConformityPercent: 80,
    provenance: native,
    items: [
      {
        id: "it-score",
        code: "A1",
        label: "Score de risque thromboembolique documenté dans le dossier",
        kind: "boolean",
        expected: true,
        weight: 2,
        outcomeId: "out-dpc-score",
      },
      {
        id: "it-bleed",
        code: "A2",
        label: "Risque hémorragique évalué et tracé",
        kind: "boolean",
        expected: true,
        weight: 1,
        outcomeId: "out-dpc-score",
      },
      {
        id: "it-anticoag",
        code: "A3",
        label: "Décision d'anticoagulation conforme aux recommandations",
        kind: "single_choice",
        choices: [
          { value: "conforme", label: "Conforme" },
          { value: "non_conforme", label: "Non conforme" },
          { value: "non_applicable", label: "Non applicable" },
        ],
        expected: "conforme",
        weight: 3,
        outcomeId: "out-dpc-anticoag",
      },
      {
        id: "it-renal",
        code: "A4",
        label: "Fonction rénale disponible et datée de moins de 12 mois",
        kind: "boolean",
        expected: true,
        weight: 2,
        outcomeId: "out-dpc-anticoag",
      },
      {
        id: "it-education",
        code: "A5",
        label: "Information et éducation du patient tracées (échelle 0-5)",
        kind: "scale",
        helpText: "Conforme à partir de 3.",
        expected: 3,
        weight: 1,
        outcomeId: "out-dpc-pratique",
      },
      {
        id: "it-suivi",
        code: "A6",
        label: "Plan de suivi programmé",
        kind: "boolean",
        expected: true,
        weight: 1,
        outcomeId: "out-dpc-pratique",
      },
    ],
  },
  {
    id: "aud-tpl-fa-v2",
    programId: DPC_PROGRAM_ID,
    title: "Audit de dossiers — version 2027 (brouillon)",
    description: "Révision de la grille en cours de rédaction : non ouverte aux participants.",
    status: "draft",
    recordsPerParticipant: 5,
    targetConformityPercent: 85,
    provenance: native,
    items: [
      {
        id: "it-v2-score",
        code: "A1",
        label: "Score de risque documenté",
        kind: "boolean",
        expected: true,
        weight: 1,
      },
    ],
  },
];

export const auditCampaigns: readonly ClinicalAuditCampaign[] = [
  {
    id: "aud-camp-pre",
    templateId: "aud-tpl-fa",
    programId: DPC_PROGRAM_ID,
    cohortId: "coh-dpc-2026",
    phase: "pre",
    label: "Audit initial (avant formation)",
    opensOn: "2026-03-15T00:00:00Z",
    closesOn: "2026-04-15T00:00:00Z",
    status: "closed",
  },
  {
    id: "aud-camp-post",
    templateId: "aud-tpl-fa",
    programId: DPC_PROGRAM_ID,
    cohortId: "coh-dpc-2026",
    phase: "post",
    label: "Audit de suivi (6 mois après la formation)",
    opensOn: "2026-10-01T00:00:00Z",
    closesOn: "2026-11-30T00:00:00Z",
    status: "open",
  },
];

const record = (
  ref: string,
  answers: Record<string, string | number | boolean>,
): { recordRef: string; answers: Record<string, string | number | boolean> } => ({
  recordRef: ref,
  answers,
});

/** Cinq dossiers anonymes, majoritairement non conformes avant formation. */
const preRecords = [
  record("DOS-101", {
    "it-score": true,
    "it-bleed": false,
    "it-anticoag": "non_conforme",
    "it-renal": true,
    "it-education": 2,
    "it-suivi": false,
  }),
  record("DOS-102", {
    "it-score": false,
    "it-bleed": false,
    "it-anticoag": "conforme",
    "it-renal": false,
    "it-education": 1,
    "it-suivi": true,
  }),
  record("DOS-103", {
    "it-score": true,
    "it-bleed": true,
    "it-anticoag": "conforme",
    "it-renal": true,
    "it-education": 3,
    "it-suivi": false,
  }),
  record("DOS-104", {
    "it-score": false,
    "it-bleed": false,
    "it-anticoag": "non_conforme",
    "it-renal": false,
    "it-education": 1,
    "it-suivi": false,
  }),
  record("DOS-105", {
    "it-score": true,
    "it-bleed": false,
    "it-anticoag": "conforme",
    "it-renal": true,
    "it-education": 2,
    "it-suivi": true,
  }),
];

/** Après formation : conformité nettement améliorée. */
const postRecords = [
  record("DOS-201", {
    "it-score": true,
    "it-bleed": true,
    "it-anticoag": "conforme",
    "it-renal": true,
    "it-education": 4,
    "it-suivi": true,
  }),
  record("DOS-202", {
    "it-score": true,
    "it-bleed": true,
    "it-anticoag": "conforme",
    "it-renal": true,
    "it-education": 3,
    "it-suivi": true,
  }),
  record("DOS-203", {
    "it-score": true,
    "it-bleed": false,
    "it-anticoag": "conforme",
    "it-renal": true,
    "it-education": 4,
    "it-suivi": true,
  }),
];

export const auditSubmissions: readonly ClinicalAuditSubmission[] = [
  {
    id: "aud-sub-pre-1",
    campaignId: "aud-camp-pre",
    enrollmentId: "enr-dpc",
    status: "submitted",
    submittedAt: "2026-04-10T09:00:00Z",
    records: preRecords,
  },
  {
    id: "aud-sub-post-1",
    campaignId: "aud-camp-post",
    enrollmentId: "enr-dpc",
    status: "in_progress",
    records: postRecords,
  },
  {
    id: "aud-sub-pre-2",
    campaignId: "aud-camp-pre",
    enrollmentId: "enr-dpc-2",
    status: "submitted",
    submittedAt: "2026-04-12T16:20:00Z",
    records: preRecords.slice(0, 5),
  },
  {
    id: "aud-sub-post-2",
    campaignId: "aud-camp-post",
    enrollmentId: "enr-dpc-2",
    status: "submitted",
    submittedAt: "2026-10-20T11:00:00Z",
    records: [
      ...postRecords,
      record("DOS-204", {
        "it-score": true,
        "it-bleed": true,
        "it-anticoag": "conforme",
        "it-renal": true,
        "it-education": 5,
        "it-suivi": true,
      }),
      record("DOS-205", {
        "it-score": true,
        "it-bleed": true,
        "it-anticoag": "conforme",
        "it-renal": false,
        "it-education": 3,
        "it-suivi": true,
      }),
    ],
  },
  {
    id: "aud-sub-pre-3",
    campaignId: "aud-camp-pre",
    enrollmentId: "enr-dpc-3",
    status: "submitted",
    submittedAt: "2026-04-14T08:00:00Z",
    records: preRecords.slice(0, 5),
  },
];

/* Pré/post-tests ---------------------------------------------------- */

export const prePostTests: readonly PrePostTest[] = [
  {
    id: "test-dpc-pre",
    programId: DPC_PROGRAM_ID,
    phase: "pre",
    title: "Pré-test de connaissances — FA et anticoagulation",
    questionCount: 20,
    outcomeIds: ["out-dpc-score", "out-dpc-anticoag"],
  },
  {
    id: "test-dpc-post",
    programId: DPC_PROGRAM_ID,
    phase: "post",
    title: "Post-test de connaissances — FA et anticoagulation",
    questionCount: 20,
    outcomeIds: ["out-dpc-score", "out-dpc-anticoag"],
  },
];

export const prePostTestResults: readonly PrePostTestResult[] = [
  {
    testId: "test-dpc-pre",
    enrollmentId: "enr-dpc",
    phase: "pre",
    scorePercent: 55,
    takenAt: "2026-03-18T18:00:00Z",
  },
  {
    testId: "test-dpc-post",
    enrollmentId: "enr-dpc",
    phase: "post",
    scorePercent: 85,
    takenAt: "2026-06-22T18:30:00Z",
  },
  {
    testId: "test-dpc-pre",
    enrollmentId: "enr-dpc-2",
    phase: "pre",
    scorePercent: 60,
    takenAt: "2026-03-19T09:00:00Z",
  },
  {
    testId: "test-dpc-post",
    enrollmentId: "enr-dpc-2",
    phase: "post",
    scorePercent: 90,
    takenAt: "2026-06-23T09:00:00Z",
  },
  {
    testId: "test-dpc-pre",
    enrollmentId: "enr-dpc-3",
    phase: "pre",
    scorePercent: 48,
    takenAt: "2026-03-20T20:00:00Z",
  },
];

/* Séances ----------------------------------------------------------- */

export const teachingSessions: readonly TeachingSession[] = [
  {
    id: "ses-dpc-1",
    programId: DPC_PROGRAM_ID,
    cohortId: "coh-dpc-2026",
    title: "Module en ligne — Bases de la décision d'anticoagulation",
    modality: "self_paced",
    startsAt: "2026-04-20T00:00:00Z",
    durationMinutes: 90,
    attendanceRequired: true,
    attendance: [
      { enrollmentId: "enr-dpc", present: true },
      { enrollmentId: "enr-dpc-2", present: true },
      { enrollmentId: "enr-dpc-3", present: true },
    ],
  },
  {
    id: "ses-dpc-2",
    programId: DPC_PROGRAM_ID,
    cohortId: "coh-dpc-2026",
    title: "Classe virtuelle — Analyse des écarts de l'audit initial",
    modality: "virtual_classroom",
    startsAt: "2026-05-12T17:00:00Z",
    durationMinutes: 120,
    attendanceRequired: true,
    attendance: [
      { enrollmentId: "enr-dpc", present: true },
      { enrollmentId: "enr-dpc-2", present: true },
      { enrollmentId: "enr-dpc-3", present: false },
    ],
  },
  {
    id: "ses-dpc-3",
    programId: DPC_PROGRAM_ID,
    cohortId: "coh-dpc-2026",
    title: "Atelier en présentiel — Cas complexes et co-prescriptions",
    modality: "in_person",
    startsAt: "2026-06-18T08:30:00Z",
    durationMinutes: 240,
    attendanceRequired: true,
    attendance: [
      { enrollmentId: "enr-dpc", present: true },
      { enrollmentId: "enr-dpc-2", present: true },
      { enrollmentId: "enr-dpc-3", present: false },
    ],
  },
];
