/**
 * Données de démonstration isolées.
 * Aucune donnée réelle, aucun secret, aucune provenance externe.
 */
import type { PlanScheduleEntry } from "@/domain/acquisitionPlan";
import type {
  AuditEvent,
  Cohort,
  CurriculumVersion,
  Enrollment,
  Evidence,
  LearningResource,
  Outcome,
  OutcomeRelation,
  Person,
  Placement,
  PlacementAssignment,
  Program,
  Provenance,
  RoleAssignment,
} from "@/domain/types";

const native: Provenance = { sourceSystem: "native" };
const ts = (iso: string) => iso;

const base = { createdAt: ts("2026-01-05T08:00:00Z"), provenance: native };

export const programs: readonly Program[] = [
  {
    ...base,
    id: "prog-diu-echo",
    code: "DIU-ECHO",
    name: "DIU d'Échocardiographie",
    kind: "diu",
    institution: "Inter-universitaire",
    annualLearnerEstimate: 400,
    config: {
      placementsEnabled: true,
      simulationEnabled: true,
      realCompetenceRequiresValidator: true,
      targetMastery: "proficient",
      locale: "fr-FR",
    },
  },
  {
    ...base,
    id: "prog-dfasm-cardio",
    code: "DFASM-CARDIO",
    name: "DFASM Cardiologie",
    kind: "dfasm",
    institution: "Faculté de Médecine",
    annualLearnerEstimate: 100,
    config: {
      placementsEnabled: true,
      simulationEnabled: true,
      realCompetenceRequiresValidator: true,
      targetMastery: "intermediate",
      locale: "fr-FR",
    },
  },
];

export const curriculumVersions: readonly CurriculumVersion[] = [
  {
    ...base,
    id: "cv-diu-2026",
    programId: "prog-diu-echo",
    label: "Référentiel 2026",
    effectiveFrom: ts("2026-09-01T00:00:00Z"),
    status: "active",
  },
  {
    ...base,
    id: "cv-dfasm-2026",
    programId: "prog-dfasm-cardio",
    label: "Référentiel 2026",
    effectiveFrom: ts("2026-09-01T00:00:00Z"),
    status: "active",
  },
];

export const cohorts: readonly Cohort[] = [
  {
    ...base,
    id: "coh-diu-2026",
    programId: "prog-diu-echo",
    curriculumVersionId: "cv-diu-2026",
    label: "Promotion 2026-2027",
    academicYear: "2026-2027",
    startsOn: ts("2026-09-15T00:00:00Z"),
    endsOn: ts("2027-06-30T00:00:00Z"),
    learnerCount: 412,
  },
  {
    ...base,
    id: "coh-dfasm-2026",
    programId: "prog-dfasm-cardio",
    curriculumVersionId: "cv-dfasm-2026",
    label: "DFASM2 2026-2027",
    academicYear: "2026-2027",
    startsOn: ts("2026-09-01T00:00:00Z"),
    endsOn: ts("2027-07-15T00:00:00Z"),
    learnerCount: 98,
  },
];

export const people: readonly Person[] = [
  { ...base, id: "per-learner", fullName: "Camille Rousseau", email: "camille.demo@example.org" },
  { ...base, id: "per-learner-2", fullName: "Nicolas Perrin", email: "nicolas.demo@example.org" },
  {
    ...base,
    id: "per-supervisor",
    fullName: "Dr Hélène Vasseur",
    email: "helene.demo@example.org",
  },
  { ...base, id: "per-teacher", fullName: "Pr Marc Delaunay", email: "marc.demo@example.org" },
  { ...base, id: "per-admin", fullName: "Service scolarité", email: "scolarite.demo@example.org" },
];

export const enrollments: readonly Enrollment[] = [
  {
    ...base,
    id: "enr-diu",
    personId: "per-learner",
    programId: "prog-diu-echo",
    cohortId: "coh-diu-2026",
    status: "active",
  },
  {
    ...base,
    id: "enr-dfasm",
    personId: "per-learner",
    programId: "prog-dfasm-cardio",
    cohortId: "coh-dfasm-2026",
    status: "active",
  },
  {
    ...base,
    id: "enr-diu-autre",
    personId: "per-learner-2",
    programId: "prog-diu-echo",
    cohortId: "coh-diu-2026",
    status: "active",
  },
];

export const roleAssignments: readonly RoleAssignment[] = [
  {
    personId: "per-learner",
    role: "learner",
    scope: { kind: "cohort", programId: "prog-diu-echo", cohortId: "coh-diu-2026" },
    grantedAt: ts("2026-09-15T00:00:00Z"),
    provenance: native,
  },
  {
    personId: "per-learner",
    role: "learner",
    scope: { kind: "cohort", programId: "prog-dfasm-cardio", cohortId: "coh-dfasm-2026" },
    grantedAt: ts("2026-09-01T00:00:00Z"),
    provenance: native,
  },
  {
    personId: "per-supervisor",
    role: "placement_supervisor",
    scope: { kind: "placement", programId: "prog-diu-echo", placementId: "pla-echo-chu" },
    grantedAt: ts("2026-09-15T00:00:00Z"),
    provenance: native,
  },
  {
    personId: "per-teacher",
    role: "teacher",
    scope: { kind: "program", programId: "prog-diu-echo" },
    grantedAt: ts("2026-01-05T00:00:00Z"),
    provenance: native,
  },
  {
    personId: "per-admin",
    role: "administrator",
    scope: { kind: "platform" },
    grantedAt: ts("2026-01-05T00:00:00Z"),
    provenance: native,
  },
];

export const outcomes: readonly Outcome[] = [
  {
    ...base,
    id: "out-echo-anat",
    programId: "prog-diu-echo",
    curriculumVersionId: "cv-diu-2026",
    code: "ECHO-1.1",
    label: "Anatomie échographique des cavités cardiaques",
    description: "Identifier les structures cardiaques sur les coupes de référence.",
    nature: "knowledge",
    domain: "Bases physiques et anatomiques",
    targetMastery: "proficient",
  },
  {
    ...base,
    id: "out-echo-coupes",
    programId: "prog-diu-echo",
    curriculumVersionId: "cv-diu-2026",
    code: "ECHO-2.3",
    label: "Réaliser les coupes standard en simulation",
    description: "Obtenir les incidences standard sur simulateur avec qualité d'image suffisante.",
    nature: "simulated_competence",
    domain: "Acquisition d'images",
    targetMastery: "proficient",
  },
  {
    ...base,
    id: "out-echo-fevg",
    programId: "prog-diu-echo",
    curriculumVersionId: "cv-diu-2026",
    code: "ECHO-3.1",
    label: "Quantifier la FEVG chez un patient",
    description:
      "Mesurer la fraction d'éjection en situation clinique réelle, validée par un encadrant.",
    nature: "real_competence",
    domain: "Fonction ventriculaire gauche",
    targetMastery: "proficient",
  },
  {
    ...base,
    id: "out-echo-valve",
    programId: "prog-diu-echo",
    curriculumVersionId: "cv-diu-2026",
    code: "ECHO-4.2",
    label: "Évaluer une valvulopathie aortique",
    description: "Conduire l'évaluation multiparamétrique d'un rétrécissement aortique.",
    nature: "real_competence",
    domain: "Valvulopathies",
    targetMastery: "intermediate",
  },
  {
    ...base,
    id: "out-dfasm-ecg",
    programId: "prog-dfasm-cardio",
    curriculumVersionId: "cv-dfasm-2026",
    code: "CARDIO-1.2",
    label: "Interpréter un ECG de repos",
    description: "Analyser systématiquement un ECG et repérer les urgences.",
    nature: "knowledge",
    domain: "Sémiologie cardiovasculaire",
    targetMastery: "proficient",
  },
  {
    ...base,
    id: "out-dfasm-douleur",
    programId: "prog-dfasm-cardio",
    curriculumVersionId: "cv-dfasm-2026",
    code: "CARDIO-2.1",
    label: "Conduire l'examen d'une douleur thoracique",
    description: "Mener l'entretien et l'examen clinique en situation simulée.",
    nature: "simulated_competence",
    domain: "Raisonnement clinique",
    targetMastery: "intermediate",
  },
  {
    ...base,
    id: "out-dfasm-obs",
    programId: "prog-dfasm-cardio",
    curriculumVersionId: "cv-dfasm-2026",
    code: "CARDIO-3.4",
    label: "Rédiger une observation cardiologique en service",
    description: "Produire une observation complète validée par le sénior du service.",
    nature: "real_competence",
    domain: "Pratique clinique",
    targetMastery: "intermediate",
  },
];

export const outcomeRelations: readonly OutcomeRelation[] = [
  {
    fromOutcomeId: "out-echo-anat",
    toOutcomeId: "out-echo-coupes",
    kind: "prerequisite_of",
    provenance: native,
  },
  {
    fromOutcomeId: "out-echo-coupes",
    toOutcomeId: "out-echo-fevg",
    kind: "prerequisite_of",
    provenance: native,
  },
];

export const placements: readonly Placement[] = [
  {
    ...base,
    id: "pla-echo-chu",
    programId: "prog-diu-echo",
    name: "Stage d'échocardiographie",
    site: "CHU — Pôle cardiovasculaire",
    department: "Explorations non invasives",
    capacity: 12,
  },
  {
    ...base,
    id: "pla-cardio-service",
    programId: "prog-dfasm-cardio",
    name: "Stage de cardiologie",
    site: "CHU — Cardiologie B",
    department: "Hospitalisation",
    capacity: 8,
  },
];

export const placementAssignments: readonly PlacementAssignment[] = [
  {
    ...base,
    id: "pas-echo-1",
    placementId: "pla-echo-chu",
    enrollmentId: "enr-diu",
    supervisorPersonId: "per-supervisor",
    startsOn: ts("2026-08-03T00:00:00Z"),
    endsOn: ts("2026-09-25T00:00:00Z"),
    status: "in_progress",
  },
  {
    ...base,
    id: "pas-cardio-1",
    placementId: "pla-cardio-service",
    enrollmentId: "enr-dfasm",
    supervisorPersonId: "per-teacher",
    startsOn: ts("2026-09-01T00:00:00Z"),
    endsOn: ts("2026-10-30T00:00:00Z"),
    status: "planned",
  },
];

export const evidence: readonly Evidence[] = [
  {
    ...base,
    id: "evi-1",
    enrollmentId: "enr-diu",
    outcomeId: "out-echo-anat",
    kind: "quiz",
    status: "validated",
    title: "QCM — Coupes de référence",
    occurredAt: ts("2026-07-12T09:30:00Z"),
    selfDeclared: false,
    metrics: [{ label: "Score", value: "84 %" }],
    validations: [],
  },
  {
    ...base,
    id: "evi-2",
    enrollmentId: "enr-diu",
    outcomeId: "out-echo-anat",
    kind: "quiz",
    status: "validated",
    title: "QCM — Anatomie appliquée",
    occurredAt: ts("2026-07-28T14:00:00Z"),
    selfDeclared: false,
    metrics: [{ label: "Score", value: "91 %" }],
    validations: [],
  },
  {
    ...base,
    id: "evi-3",
    enrollmentId: "enr-diu",
    outcomeId: "out-echo-coupes",
    kind: "simulation",
    status: "validated",
    title: "Session simulateur — incidences standard",
    occurredAt: ts("2026-08-06T10:15:00Z"),
    selfDeclared: false,
    metrics: [
      { label: "Coupes réussies", value: "7 / 9" },
      { label: "Durée", value: "42 min" },
    ],
    validations: [],
  },
  {
    ...base,
    id: "evi-4",
    enrollmentId: "enr-diu",
    outcomeId: "out-echo-fevg",
    kind: "real_activity",
    status: "validated",
    title: "Mesure de FEVG — patient hospitalisé",
    occurredAt: ts("2026-08-11T08:45:00Z"),
    selfDeclared: false,
    placementAssignmentId: "pas-echo-1",
    metrics: [{ label: "Méthode", value: "Simpson biplan" }],
    validations: [
      {
        evidenceId: "evi-4",
        validatorPersonId: "per-supervisor",
        validatorRole: "placement_supervisor",
        decision: "validated",
        decidedAt: ts("2026-08-11T17:00:00Z"),
        comment: "Acquisition correcte, contourage à affiner.",
        provenance: native,
      },
    ],
  },
  {
    ...base,
    id: "evi-5",
    enrollmentId: "enr-diu",
    outcomeId: "out-echo-valve",
    kind: "real_activity",
    status: "submitted",
    title: "Évaluation d'un rétrécissement aortique (auto-déclarée)",
    occurredAt: ts("2026-08-14T11:00:00Z"),
    selfDeclared: true,
    placementAssignmentId: "pas-echo-1",
    validations: [],
  },
  {
    ...base,
    id: "evi-6",
    enrollmentId: "enr-dfasm",
    outcomeId: "out-dfasm-ecg",
    kind: "quiz",
    status: "validated",
    title: "QCM — ECG de repos",
    occurredAt: ts("2026-06-20T09:00:00Z"),
    selfDeclared: false,
    metrics: [{ label: "Score", value: "76 %" }],
    validations: [],
  },
  {
    ...base,
    id: "evi-7",
    enrollmentId: "enr-dfasm",
    outcomeId: "out-dfasm-douleur",
    kind: "simulation",
    status: "validated",
    title: "Station simulée — douleur thoracique",
    occurredAt: ts("2026-07-02T13:30:00Z"),
    selfDeclared: false,
    validations: [],
  },
];

export const learningResources: readonly LearningResource[] = [
  {
    ...base,
    id: "res-1",
    programId: "prog-diu-echo",
    title: "Coupes de référence : révision guidée",
    format: "course",
    outcomeIds: ["out-echo-anat"],
    estimatedMinutes: 25,
  },
  {
    ...base,
    id: "res-2",
    programId: "prog-diu-echo",
    title: "Checklist d'acquisition FEVG",
    format: "checklist",
    outcomeIds: ["out-echo-fevg"],
    estimatedMinutes: 10,
  },
  {
    ...base,
    id: "res-3",
    programId: "prog-dfasm-cardio",
    title: "ECG : 20 tracés commentés",
    format: "quiz",
    outcomeIds: ["out-dfasm-ecg"],
    estimatedMinutes: 30,
  },
];

export const auditEvents: readonly AuditEvent[] = [
  {
    ...base,
    id: "aud-1",
    actorPersonId: "per-supervisor",
    action: "evidence.validated",
    targetType: "Evidence",
    targetId: "evi-4",
    programId: "prog-diu-echo",
    detail: "Validation d'une compétence réelle par l'encadrant de stage.",
  },
  {
    ...base,
    id: "aud-2",
    actorPersonId: "system",
    action: "cohort.opened",
    targetType: "Cohort",
    targetId: "coh-diu-2026",
    programId: "prog-diu-echo",
  },
];

/**
 * Calendrier de référence du plan d'acquisition (démonstration isolée).
 * Aucune donnée réelle : sert uniquement à rendre les vues Gantt et Calendrier.
 */
export const planSchedule: readonly PlanScheduleEntry[] = [
  {
    outcomeId: "out-echo-anat",
    startsOn: "2026-06-15T00:00:00Z",
    dueOn: "2026-07-31T00:00:00Z",
    milestoneLabel: "Jalon 1 — Bases anatomiques validées",
    official: true,
  },
  {
    outcomeId: "out-echo-coupes",
    startsOn: "2026-07-15T00:00:00Z",
    dueOn: "2026-09-10T00:00:00Z",
    milestoneLabel: "Jalon 2 — Coupes standard en simulation",
    official: false,
  },
  {
    outcomeId: "out-echo-fevg",
    startsOn: "2026-08-03T00:00:00Z",
    dueOn: "2026-10-15T00:00:00Z",
    milestoneLabel: "Jalon 3 — FEVG en situation réelle",
    official: true,
  },
  {
    outcomeId: "out-echo-valve",
    startsOn: "2026-09-01T00:00:00Z",
    dueOn: "2026-12-18T00:00:00Z",
    milestoneLabel: "Jalon 4 — Valvulopathie aortique",
    official: false,
  },
  {
    outcomeId: "out-dfasm-ecg",
    startsOn: "2026-06-01T00:00:00Z",
    dueOn: "2026-09-30T00:00:00Z",
    milestoneLabel: "Jalon 1 — ECG de repos",
    official: true,
  },
  {
    outcomeId: "out-dfasm-douleur",
    startsOn: "2026-06-20T00:00:00Z",
    dueOn: "2026-11-15T00:00:00Z",
    milestoneLabel: "Jalon 2 — Douleur thoracique en simulation",
    official: false,
  },
  {
    outcomeId: "out-dfasm-obs",
    startsOn: "2026-09-01T00:00:00Z",
    dueOn: "2027-01-31T00:00:00Z",
    milestoneLabel: "Jalon 3 — Observation validée en service",
    official: true,
  },
];
