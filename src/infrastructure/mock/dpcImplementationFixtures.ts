/**
 * Démonstrateur « HVG–Amylose » séparé en deux objets :
 *  - le PROGRAMME DE RÉFÉRENCE : `dpcHvgProgramDefinition` (contenu, grilles,
 *    QCM, bibliographie) — aucune date d'exploitation ;
 *  - ses IMPLÉMENTATIONS : cohorte, calendrier, modalités, intervenants.
 *
 * Trois implémentations du MÊME programme de référence démontrent la
 * réutilisation sans duplication de contenu. Tout est SIMULÉ : aucune
 * ouverture réelle, aucun lien de visioconférence réel, aucune notification.
 */
import type {
  DpcActiveModules,
  DpcProgramImplementation,
} from "@/domain/dpcProgramImplementation";
import { dpcHvgProgramDefinition } from "./dpcHvgProgramDefinition";
import { DPC_HVG_COHORT_ID } from "./dpcHvgFixtures";

const REFERENCE_ID = dpcHvgProgramDefinition.id;
const REFERENCE_VERSION = dpcHvgProgramDefinition.version.version;
const TIME_ZONE = "Europe/Paris";

function modules(active: Partial<DpcActiveModules>): DpcActiveModules {
  return {
    practice_audit: false,
    pre_test: false,
    training: false,
    post_test: false,
    improvement_plan: false,
    attestation: false,
    ...active,
  };
}

/** Implémentation de démonstration : A1, présentiel, pré/post-test, A2 à J+90. */
export const dpcHvgImplementationJesfc2027: DpcProgramImplementation = {
  id: "dpc-impl-hvg-jesfc-2027",
  programDefinitionId: REFERENCE_ID,
  programDefinitionVersion: REFERENCE_VERSION,
  name: "Implémentation JESFC janvier 2027",
  cohortId: DPC_HVG_COHORT_ID,
  coordinatorId: "per-dpc-hvg-admin",
  facilitatorIds: ["per-dpc-hvg-admin"],
  timeZone: TIME_ZONE,
  status: "scheduled",
  enrollmentOpensOn: "2026-11-02T08:00:00+01:00",
  enrollmentClosesOn: "2026-12-20T23:59:00+01:00",
  startsOn: "2026-12-15T08:00:00+01:00",
  endsOn: "2027-05-15T23:59:00+02:00",
  modules: modules({
    practice_audit: true,
    pre_test: true,
    training: true,
    post_test: true,
    improvement_plan: true,
    attestation: true,
  }),
  sequences: [
    {
      id: "seq-jesfc-presentiel",
      label: "Session présentielle JESFC",
      modality: "in_person",
      order: 1,
      startsAt: "2027-01-15T09:00:00+01:00",
      endsAt: "2027-01-15T17:00:00+01:00",
      location: "Palais des Congrès, Paris",
      attendanceRequired: true,
    },
  ],
  schedule: {
    timeZone: TIME_ZONE,
    requiresBeforeAfterAudit: true,
    milestones: [
      {
        id: "ms-a1-open",
        kind: "audit_a1_open",
        label: "Ouverture de l'audit A1",
        startsAt: "2026-12-15T08:00:00+01:00",
        endsAt: "2027-01-10T23:59:00+01:00",
        exclusive: true,
      },
      {
        id: "ms-a1-close",
        kind: "audit_a1_close",
        label: "Fermeture de l'audit A1",
        startsAt: "2027-01-10T23:59:00+01:00",
      },
      {
        id: "ms-a1-feedback",
        kind: "audit_a1_feedback",
        label: "Retour personnalisé A1",
        startsAt: "2027-01-12T09:00:00+01:00",
      },
      {
        id: "ms-pre-test",
        kind: "pre_test",
        label: "Pré-test de connaissances",
        startsAt: "2027-01-13T09:00:00+01:00",
        endsAt: "2027-01-14T23:59:00+01:00",
      },
      {
        id: "ms-training",
        kind: "training_sequence",
        label: "Session présentielle JESFC",
        startsAt: "2027-01-15T09:00:00+01:00",
        endsAt: "2027-01-15T17:00:00+01:00",
        sequenceId: "seq-jesfc-presentiel",
      },
      {
        id: "ms-post-test",
        kind: "post_test",
        label: "Post-test de connaissances",
        startsAt: "2027-01-15T17:30:00+01:00",
        endsAt: "2027-01-22T23:59:00+01:00",
      },
      {
        id: "ms-improvement",
        kind: "improvement_plan",
        label: "Plan d'amélioration personnalisé",
        startsAt: "2027-01-23T09:00:00+01:00",
        endsAt: "2027-02-06T23:59:00+01:00",
      },
      {
        id: "ms-interval",
        kind: "interval_before_a2",
        label: "Délai de 90 jours avant A2",
        startsAt: "2027-01-16T00:00:00+01:00",
        endsAt: "2027-04-15T23:59:00+02:00",
      },
      {
        id: "ms-a2-open",
        kind: "audit_a2_open",
        label: "Ouverture de l'audit A2",
        startsAt: "2027-04-16T08:00:00+02:00",
        endsAt: "2027-05-06T23:59:00+02:00",
        exclusive: true,
      },
      {
        id: "ms-a2-close",
        kind: "audit_a2_close",
        label: "Fermeture de l'audit A2",
        startsAt: "2027-05-06T23:59:00+02:00",
      },
      {
        id: "ms-analysis",
        kind: "analysis_validation",
        label: "Validation de l'analyse comparative",
        startsAt: "2027-05-10T09:00:00+02:00",
      },
      {
        id: "ms-synthesis",
        kind: "synthesis_release",
        label: "Diffusion de la synthèse",
        startsAt: "2027-05-12T09:00:00+02:00",
      },
      {
        id: "ms-attestation",
        kind: "attestation",
        label: "Attestation de participation",
        startsAt: "2027-05-15T09:00:00+02:00",
      },
    ],
  },
  completionRules: {
    recordsPerRound: 10,
    allRequiredResources: false,
    attendanceMandatory: true,
  },
  reminderDates: ["2026-12-22T09:00:00+01:00", "2027-04-23T09:00:00+02:00"],
  maxParticipants: 120,
};

/** Même programme de référence, modalité visioconférence, sans audit. */
export const dpcHvgImplementationVisio2027: DpcProgramImplementation = {
  id: "dpc-impl-hvg-visio-2027",
  programDefinitionId: REFERENCE_ID,
  programDefinitionVersion: REFERENCE_VERSION,
  name: "Implémentation visioconférence juin 2027",
  cohortId: DPC_HVG_COHORT_ID,
  coordinatorId: "per-dpc-hvg-admin",
  facilitatorIds: ["per-dpc-hvg-admin"],
  timeZone: TIME_ZONE,
  status: "draft",
  startsOn: "2027-06-01T08:00:00+02:00",
  endsOn: "2027-06-30T23:59:00+02:00",
  modules: modules({ pre_test: true, training: true, post_test: true, attestation: true }),
  sequences: [
    {
      id: "seq-visio-1",
      label: "Visioconférence 1 — HVG et drapeaux rouges",
      modality: "virtual_classroom",
      order: 1,
      startsAt: "2027-06-10T18:00:00+02:00",
      endsAt: "2027-06-10T20:00:00+02:00",
      provider: "Visio institutionnelle (simulée)",
      attendanceRequired: true,
    },
    {
      id: "seq-visio-2",
      label: "Visioconférence 2 — Confirmation diagnostique",
      modality: "virtual_classroom",
      order: 2,
      startsAt: "2027-06-17T18:00:00+02:00",
      endsAt: "2027-06-17T20:00:00+02:00",
      provider: "Visio institutionnelle (simulée)",
      attendanceRequired: false,
    },
  ],
  schedule: {
    timeZone: TIME_ZONE,
    milestones: [
      {
        id: "ms-visio-pre",
        kind: "pre_test",
        label: "Pré-test",
        startsAt: "2027-06-05T09:00:00+02:00",
        endsAt: "2027-06-09T23:59:00+02:00",
      },
      {
        id: "ms-visio-1",
        kind: "training_sequence",
        label: "Visioconférence 1",
        startsAt: "2027-06-10T18:00:00+02:00",
        endsAt: "2027-06-10T20:00:00+02:00",
        sequenceId: "seq-visio-1",
      },
      {
        id: "ms-visio-2",
        kind: "training_sequence",
        label: "Visioconférence 2",
        startsAt: "2027-06-17T18:00:00+02:00",
        endsAt: "2027-06-17T20:00:00+02:00",
        sequenceId: "seq-visio-2",
      },
      {
        id: "ms-visio-post",
        kind: "post_test",
        label: "Post-test",
        startsAt: "2027-06-20T09:00:00+02:00",
        endsAt: "2027-06-27T23:59:00+02:00",
      },
      {
        id: "ms-visio-attestation",
        kind: "attestation",
        label: "Attestation",
        startsAt: "2027-06-30T09:00:00+02:00",
      },
    ],
  },
  completionRules: { minimumPostTestScore: 60, attendanceMandatory: false },
  reminderDates: ["2027-06-08T09:00:00+02:00"],
};

/** Même programme de référence, e-formation asynchrone seule. */
export const dpcHvgImplementationELearning2027: DpcProgramImplementation = {
  id: "dpc-impl-hvg-elearning-2027",
  programDefinitionId: REFERENCE_ID,
  programDefinitionVersion: REFERENCE_VERSION,
  name: "Implémentation e-formation septembre 2027",
  cohortId: DPC_HVG_COHORT_ID,
  coordinatorId: "per-dpc-hvg-admin",
  facilitatorIds: [],
  timeZone: TIME_ZONE,
  status: "draft",
  startsOn: "2027-09-01T08:00:00+02:00",
  endsOn: "2027-10-15T23:59:00+02:00",
  modules: modules({ training: true, attestation: true }),
  sequences: [
    {
      id: "seq-elearning",
      label: "Parcours e-formation HVG–Amylose",
      modality: "e_learning",
      order: 1,
      opensOn: "2027-09-01T08:00:00+02:00",
      closesOn: "2027-10-10T23:59:00+02:00",
      requiredResourceIds: ["res-hvg-deck", "res-hvg-biblio"],
      resourceProgressRule: "completion",
      sequentialResources: true,
    },
  ],
  schedule: {
    timeZone: TIME_ZONE,
    milestones: [
      {
        id: "ms-el-training",
        kind: "training_sequence",
        label: "Fenêtre de e-formation",
        startsAt: "2027-09-01T08:00:00+02:00",
        endsAt: "2027-10-10T23:59:00+02:00",
        sequenceId: "seq-elearning",
      },
      {
        id: "ms-el-attestation",
        kind: "attestation",
        label: "Attestation",
        startsAt: "2027-10-15T09:00:00+02:00",
      },
    ],
  },
  completionRules: { allRequiredResources: true },
  reminderDates: ["2027-09-20T09:00:00+02:00"],
};

export const dpcHvgImplementations: readonly DpcProgramImplementation[] = [
  dpcHvgImplementationJesfc2027,
  dpcHvgImplementationVisio2027,
  dpcHvgImplementationELearning2027,
];

/** Le programme de référence est publié : condition distincte de l'ouverture. */
export const dpcHvgReferencePublished =
  dpcHvgProgramDefinition.version.status === "published";
