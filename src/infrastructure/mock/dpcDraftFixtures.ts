/**
 * États de démonstration de l'assistant de création d'un programme DPC.
 *
 * MAQUETTE LOCALE UNIQUEMENT :
 *  - aucun fichier n'est transmis, aucun document n'est réellement lu ;
 *  - aucune donnée médicale n'est inventée : le démonstrateur HVG est dérivé de
 *    `dpcHvgProgramDefinition`, et le brouillon « prêt à publier » est un
 *    programme fictif non clinique servant seulement d'aperçu d'interface ;
 *  - aucune validation médicale réelle n'est fabriquée : le brouillon HVG reste
 *    explicitement non validé.
 */
import type { DpcAuditModuleConfig, DpcCompletenessRule } from "@/domain/dpcProgram";
import type { DpcImplementationPlan } from "@/domain/dpcImplementation";
import type { DpcProgramDraft } from "@/domain/dpcProgramDraft";
import { draftFromDefinition } from "@/domain/dpcProgramDraft";
import { dpcHvgQuestions } from "./dpcHvgFixtures";
import { dpcHvgProgramDefinition } from "./dpcHvgProgramDefinition";

/* ------------------------------------------------------------------ */
/* État 1 — brouillon incomplet                                        */
/* ------------------------------------------------------------------ */

/**
 * Plan d'implémentation incomplet : un composant existe, il n'est pas daté.
 * Sert à montrer le blocage du calendrier, jamais un état publiable.
 */
const incompleteImplementation: DpcImplementationPlan = {
  id: "impl-incomplete",
  label: "Calendrier d'implémentation (à programmer)",
  timeZone: "Europe/Paris",
  slots: [
    {
      id: "slot-incomplete-1",
      label: "Séquence de formation à programmer",
      kind: "training_session",
      attendanceRequired: false,
      note: "Modalité et dates non renseignées : le calendrier reste bloquant.",
    },
  ],
};

export const dpcIncompleteDraft: DpcProgramDraft = {
  id: "dpc-draft-incomplete",
  label: "Nouveau programme DPC (brouillon incomplet)",
  version: "v0.1",
  documents: [
    {
      id: "draft-doc-1",
      fileName: "programme_a_classer.docx",
      kinds: [],
      simulated: true,
      note: "Document sélectionné localement, nature non attribuée.",
    },
  ],
  extraction: {
    extractionMode: "simulated",
    title: "Programme DPC sans titre",
    orientations: [],
    targetAudience: "",
    objectives: [],
    teachingModalities: [],
    faculty: [],
    schedule: [],
    detectedModules: [],
    resources: [],
    bibliography: [],
  },
  audit: { grids: [], rounds: [] },
  implementation: incompleteImplementation,
  quizCount: 0,
  medicalParametersValidated: false,
  publicationSimulated: true,
};

/* ------------------------------------------------------------------ */
/* État 2 — démonstrateur HVG complet mais non validé                  */
/* ------------------------------------------------------------------ */

/**
 * Démonstrateur HVG : audit avant / après, tests amont et aval, formation en
 * visioconférence puis e-formation. Les composants sont ceux du démonstrateur,
 * pas un modèle imposé.
 */
const hvgImplementation: DpcImplementationPlan = {
  id: "impl-hvg",
  label: "Calendrier d'implémentation HVG–Amylose (simulé)",
  timeZone: "Europe/Paris",
  slots: [
    {
      id: "slot-hvg-audit-1",
      label: "Audit de pratiques initial",
      kind: "audit_round",
      order: 1,
      roundId: "dpc-hvg-round-t0",
      opensOn: "2026-05-15T00:00:00.000Z",
      closesOn: "2026-06-14T00:00:00.000Z",
      attendanceRequired: false,
    },
    {
      id: "slot-hvg-pretest",
      label: "Test de connaissances amont",
      kind: "pre_test",
      opensOn: "2026-06-15T07:00:00.000Z",
      closesOn: "2026-06-19T20:00:00.000Z",
      attendanceRequired: false,
    },
    {
      id: "slot-hvg-visio",
      label: "Classe virtuelle — hypertrophie ventriculaire gauche et amylose",
      kind: "training_session",
      delivery: "virtual_classroom",
      startsAt: "2026-06-20T17:00:00.000Z",
      endsAt: "2026-06-20T19:00:00.000Z",
      joinInstructions: "Lien de connexion transmis aux inscrits (simulé, aucun envoi réel).",
      attendanceRequired: true,
    },
    {
      id: "slot-hvg-elearning",
      label: "E-formation — documents à consulter en ligne",
      kind: "training_session",
      delivery: "e_learning",
      opensOn: "2026-06-21T07:00:00.000Z",
      closesOn: "2026-07-21T20:00:00.000Z",
      resourceIds: ["dpc-hvg-support-1"],
      attendanceRequired: false,
    },
    {
      id: "slot-hvg-posttest",
      label: "Test de connaissances aval",
      kind: "post_test",
      opensOn: "2026-07-22T07:00:00.000Z",
      closesOn: "2026-07-29T20:00:00.000Z",
      attendanceRequired: false,
    },
    {
      id: "slot-hvg-audit-2",
      label: "Audit de pratiques de suivi",
      kind: "audit_round",
      order: 2,
      roundId: "dpc-hvg-round-t1",
      opensOn: "2026-09-13T00:00:00.000Z",
      closesOn: "2026-10-13T00:00:00.000Z",
      attendanceRequired: false,
    },
  ],
};

export const dpcHvgDraft: DpcProgramDraft = draftFromDefinition(dpcHvgProgramDefinition, {
  id: "dpc-draft-hvg",
  label: "DPC HVG–Amylose (démonstrateur préremplie, non validé)",
  quizCount: dpcHvgQuestions.length,
  medicalParametersValidated: false,
  checksum: "sim-hvg-checksum",
  implementation: hvgImplementation,
});

/* ------------------------------------------------------------------ */
/* État 3 — aperçu d'une configuration prête à publier (fictive)       */
/* ------------------------------------------------------------------ */

const genericCompleteness: DpcCompletenessRule = {
  allRecordsRequired: false,
  minimumCompleteRecords: 6,
  minimumAnsweredPercentPerRecord: 80,
  notApplicableCountsAsAnswered: true,
};

const genericAudit: DpcAuditModuleConfig = {
  grids: [
    {
      gridId: "grid-demo-generique",
      title: "Grille d'audit de démonstration (fictive)",
      version: { version: "v1.0", status: "validated", validatedAt: "2026-01-15T09:00:00.000Z" },
      defaultRecordsPerRound: 6,
      inclusionCriteria: [
        "Dossiers fictifs de démonstration, désignés par une référence locale.",
        "Aucune donnée identifiante saisie.",
      ],
      completenessRule: genericCompleteness,
      sourceDocumentId: "demo-doc-grille",
    },
    {
      gridId: "grid-demo-secondaire",
      title: "Grille complémentaire de démonstration (fictive)",
      version: { version: "v0.9", status: "validated", validatedAt: "2026-01-15T09:00:00.000Z" },
      defaultRecordsPerRound: 4,
      inclusionCriteria: ["Sous-ensemble fictif de dossiers de démonstration."],
      completenessRule: { allRecordsRequired: true, notApplicableCountsAsAnswered: false },
    },
  ],
  rounds: [
    {
      roundId: "round-demo-1",
      label: "Tour initial",
      order: 1,
      gridId: "grid-demo-generique",
      gridVersion: "v1.0",
      opensOn: "2026-02-01T08:00:00.000Z",
      closesOn: "2026-02-28T20:00:00.000Z",
    },
    {
      roundId: "round-demo-2",
      label: "Tour de suivi",
      order: 2,
      gridId: "grid-demo-generique",
      gridVersion: "v1.0",
      opensOn: "2026-05-01T08:00:00.000Z",
      closesOn: "2026-05-31T20:00:00.000Z",
      recordsPerRound: 8,
    },
    {
      roundId: "round-demo-3",
      label: "Tour complémentaire",
      order: 3,
      gridId: "grid-demo-secondaire",
      gridVersion: "v0.9",
      opensOn: "2026-06-01T08:00:00.000Z",
      closesOn: "2026-06-15T20:00:00.000Z",
    },
  ],
};

/**
 * Aperçu publiable (fictif) : seuls un présentiel et deux tours d'audit, sans
 * aucun test de connaissances — un DPC peut n'en avoir aucun.
 */
const readyImplementation: DpcImplementationPlan = {
  id: "impl-ready",
  label: "Calendrier d'implémentation de démonstration",
  timeZone: "Europe/Paris",
  slots: [
    {
      id: "slot-ready-audit-1",
      label: "Tour initial",
      kind: "audit_round",
      order: 1,
      roundId: "round-demo-1",
      opensOn: "2026-02-01T08:00:00.000Z",
      closesOn: "2026-02-28T20:00:00.000Z",
      attendanceRequired: false,
    },
    {
      id: "slot-ready-presentiel",
      label: "Journée en présentiel",
      kind: "training_session",
      delivery: "in_person",
      startsAt: "2026-03-10T08:00:00.000Z",
      endsAt: "2026-03-10T16:00:00.000Z",
      location: "Salle de démonstration (adresse fictive)",
      attendanceRequired: true,
    },
    {
      id: "slot-ready-audit-2",
      label: "Tour de suivi",
      kind: "audit_round",
      order: 2,
      roundId: "round-demo-2",
      opensOn: "2026-05-01T08:00:00.000Z",
      closesOn: "2026-05-31T20:00:00.000Z",
      attendanceRequired: false,
    },
  ],
};

export const dpcReadyToPublishDraft: DpcProgramDraft = {
  id: "dpc-draft-ready",
  label: "Programme de démonstration prêt à publier (fictif, non clinique)",
  version: "v1.0",
  checksum: "sim-demo-checksum",
  documents: [
    {
      id: "demo-doc-programme",
      fileName: "programme_demonstration.docx",
      kinds: ["program_document"],
      simulated: true,
    },
    {
      id: "demo-doc-grille",
      fileName: "grille_demonstration.docx",
      kinds: ["audit_grid"],
      simulated: true,
    },
    {
      id: "demo-doc-qcm",
      fileName: "qcm_demonstration.docx",
      kinds: ["knowledge_quiz"],
      simulated: true,
    },
    {
      id: "demo-doc-biblio",
      fileName: "bibliographie_demonstration.pdf",
      kinds: ["bibliography", "teaching_resource"],
      simulated: true,
    },
    {
      id: "demo-doc-plan",
      fileName: "modele_plan_amelioration.docx",
      kinds: ["improvement_plan_template"],
      simulated: true,
    },
  ],
  extraction: {
    extractionMode: "simulated",
    title: "Programme DPC de démonstration",
    administrativeNumber: "DEMO-0000-0000",
    orientations: ["Orientation de démonstration A", "Orientation de démonstration B"],
    targetAudience: "Public de démonstration (aucun contenu clinique réel).",
    objectives: [
      "Objectif de démonstration 1 : vérifier l'assistant de configuration.",
      "Objectif de démonstration 2 : vérifier la séparation audits / QCM.",
    ],
    teachingModalities: [
      { id: "demo-classe", label: "Classe virtuelle", kind: "virtual_classroom", durationMinutes: 90 },
      { id: "demo-audit", label: "Audit de pratiques", kind: "audit" },
    ],
    faculty: [
      { fullName: "Coordinateur de démonstration", role: "Coordination", interestsDeclared: true },
    ],
    schedule: [
      { key: "avant", window: "J-30 à J0", description: "Tour initial et test amont." },
      { key: "formation", window: "J0", description: "Séquence de formation." },
      { key: "apres", window: "J+90", description: "Tour de suivi et test aval." },
    ],
    detectedModules: ["clinicalAudit", "knowledgeTests", "training", "certificate"],
    resources: [
      { id: "demo-res-1", label: "Support de démonstration", kind: "teaching_resource" },
    ],
    bibliography: [{ order: 1, citation: "Référence de démonstration (fictive)." }],
  },
  audit: genericAudit,
  implementation: readyImplementation,
  quizCount: 2,
  medicalParametersValidated: true,
  humanValidation: {
    by: "person-demo-coordinateur",
    at: "2026-01-20T10:00:00.000Z",
    statement:
      "Validation de démonstration sur un programme fictif non clinique : aucune validation médicale réelle.",
  },
  publicationSimulated: true,
};

export interface DpcDraftDemoState {
  readonly key: "incomplete" | "hvg" | "ready";
  readonly label: string;
  readonly hint: string;
  readonly draft: DpcProgramDraft;
}

export const dpcDraftDemoStates: readonly DpcDraftDemoState[] = [
  {
    key: "incomplete",
    label: "Brouillon incomplet",
    hint: "Point de départ : documents non classés, aucune grille, publication bloquée.",
    draft: dpcIncompleteDraft,
  },
  {
    key: "hvg",
    label: "HVG–Amylose (complet, non validé)",
    hint: "Démonstrateur préremplie depuis le modèle générique : paramétrage médical non validé.",
    draft: dpcHvgDraft,
  },
  {
    key: "ready",
    label: "Aperçu prêt à publier (fictif)",
    hint: "Programme fictif non clinique, uniquement pour montrer l'état « publiable » de l'interface.",
    draft: dpcReadyToPublishDraft,
  },
];
