/**
 * Données de DÉMONSTRATION du carnet de stage configurable.
 * Aucune donnée réelle, aucune image réelle : uniquement des placeholders.
 */
import type {
  StageLog,
  StageLogTemplate,
  PhotoRequirement,
  StageLogPhotoPolicy,
} from "@/domain/stageLog";
import { PHOTO_CHECKLIST, PHOTO_RETENTION_TBD_FR } from "@/domain/stageLog";
import type { Provenance } from "@/domain/types";

const native: Provenance = { sourceSystem: "native" };
const base = { createdAt: "2026-01-05T08:00:00Z", provenance: native };

const policy = (
  allowedObjects: readonly PhotoRequirement[],
  maxPhotosPerEntry: number,
): StageLogPhotoPolicy => ({
  enabled: true,
  allowedObjects,
  allowCustomObject: true,
  maxPhotosPerEntry,
  supervisorValidationRequired: true,
  retentionPolicyLabel: PHOTO_RETENTION_TBD_FR,
  automaticCheck: "not_active",
});

export const stageLogTemplates: readonly StageLogTemplate[] = [
  {
    ...base,
    id: "slt-diu-echo-v2",
    programId: "prog-diu-echo",
    version: 2,
    label: "Carnet d'échocardiographie",
    description:
      "Journal des examens réalisés : type d'examen, volume, degré d'autonomie et fragment de compte rendu autorisé.",
    moduleLabel: "Module 2 — Échocardiographie clinique",
    cohortIds: ["coh-diu-2026"],
    enabled: true,
    entryFrequency: "per_entry",
    validatorRole: "placement_supervisor",
    fields: [
      {
        key: "exam_type",
        label: "Type d'examen",
        kind: "choice",
        required: true,
        options: [
          "ETT complète",
          "ETT ciblée",
          "Échographie de stress",
          "ETO (assistance)",
          "Doppler vasculaire",
        ],
      },
      { key: "volume", label: "Nombre d'examens réalisés", kind: "count", required: true },
      {
        key: "autonomy",
        label: "Degré d'autonomie",
        kind: "autonomy",
        required: true,
        options: ["observation", "réalisation supervisée", "réalisation autonome"],
      },
      {
        key: "indication",
        label: "Indication (sans aucune donnée nominative)",
        kind: "text",
        required: true,
        helpText: "Décrivez l'indication clinique sans identifier la personne examinée.",
      },
      {
        key: "learner_conclusion",
        label: "Conclusion rédigée par l'apprenant",
        kind: "long_text",
        required: false,
      },
    ],
    objectives: [
      { key: "ett", label: "ETT complètes réalisées", quota: 50, frequency: "per_placement" },
      {
        key: "stress",
        label: "Échographies de stress observées",
        quota: 5,
        frequency: "per_semester",
      },
      { key: "weekly", label: "Entrées de carnet par semaine", quota: 5, frequency: "weekly" },
    ],
    completenessRules: [
      "Chaque entrée exige le type d'examen, le volume et le degré d'autonomie.",
      "Une compétence réelle n'est jamais acquise sans validation de l'encadrant de stage.",
      "Une photo ne remplace jamais la saisie structurée.",
    ],
    photoPolicy: policy(
      [
        {
          id: "phr-diu-conclusion",
          label: "Conclusion du compte rendu d'échocardiographie",
          framingInstruction:
            "Cadrez uniquement le paragraphe de conclusion. Excluez l'en-tête, le pied de page et toute étiquette.",
          required: false,
          custom: false,
        },
        {
          id: "phr-diu-mesures",
          label: "Bloc de mesures chiffrées (sans en-tête)",
          framingInstruction:
            "Cadrez uniquement le tableau de mesures. Aucun identifiant ni code-barres ne doit apparaître.",
          required: false,
          custom: false,
        },
      ],
      2,
    ),
  },
  {
    ...base,
    id: "slt-dfasm-cardio-v1",
    programId: "prog-dfasm-cardio",
    version: 1,
    label: "Carnet de stage de cardiologie",
    description:
      "Journal des situations cliniques : actes réalisés, raisonnement clinique, autonomie et fragment d'observation autorisé.",
    moduleLabel: "DFASM2 — Stage de cardiologie",
    cohortIds: [],
    enabled: true,
    entryFrequency: "weekly",
    validatorRole: "teacher",
    fields: [
      {
        key: "clinical_situation",
        label: "Situation clinique",
        kind: "choice",
        required: true,
        options: [
          "Douleur thoracique",
          "Dyspnée",
          "Trouble du rythme",
          "Insuffisance cardiaque",
          "Bilan pré-opératoire",
        ],
      },
      {
        key: "acts",
        label: "Actes réalisés",
        kind: "text",
        required: true,
        helpText: "Ex. ECG, examen clinique, ponction veineuse.",
      },
      {
        key: "reasoning",
        label: "Raisonnement clinique",
        kind: "long_text",
        required: true,
        helpText: "Hypothèses, arguments, conduite proposée. Aucune donnée nominative.",
      },
      {
        key: "autonomy",
        label: "Degré d'autonomie",
        kind: "autonomy",
        required: true,
        options: ["observation", "réalisation supervisée", "réalisation autonome"],
      },
    ],
    objectives: [
      {
        key: "situations",
        label: "Situations cliniques documentées",
        quota: 12,
        frequency: "per_placement",
      },
      {
        key: "ecg",
        label: "ECG interprétés et contresignés",
        quota: 20,
        frequency: "per_placement",
      },
      { key: "weekly", label: "Entrées de carnet par semaine", quota: 2, frequency: "weekly" },
    ],
    completenessRules: [
      "Chaque entrée exige la situation clinique, les actes et le raisonnement.",
      "L'autonomie déclarée doit être contresignée par l'enseignant responsable.",
      "Aucune identité de patient n'est saisie ni photographiée.",
    ],
    photoPolicy: policy(
      [
        {
          id: "phr-dfasm-hdm",
          label: "Histoire de la maladie (HDM)",
          framingInstruction:
            "Cadrez uniquement le paragraphe « Histoire de la maladie ». Excluez l'étiquette patient et l'en-tête du service.",
          required: false,
          custom: false,
        },
        {
          id: "phr-dfasm-conclusion",
          label: "Conclusion de l'observation de l'étudiant",
          framingInstruction:
            "Cadrez uniquement la conclusion rédigée par l'étudiant, sans en-tête ni signature nominative.",
          required: false,
          custom: false,
        },
        {
          id: "phr-dfasm-custom",
          label: "Autre objet personnalisé — tracé ECG anonyme (sans bandeau d'identification)",
          framingInstruction:
            "Cadrez uniquement les dérivations. Le bandeau supérieur contenant nom, date de naissance et numéro de dossier doit être exclu du cadre.",
          required: false,
          custom: true,
        },
      ],
      1,
    ),
  },
];

export const stageLogs: readonly StageLog[] = [
  {
    ...base,
    id: "slog-diu-camille",
    templateId: "slt-diu-echo-v2",
    templateVersion: 2,
    programId: "prog-diu-echo",
    cohortId: "coh-diu-2026",
    enrollmentId: "enr-diu",
    placementAssignmentId: "pas-echo-1",
    status: "draft",
    validations: [],
    entries: [
      {
        ...base,
        id: "sle-diu-1",
        stageLogId: "slog-diu-camille",
        templateId: "slt-diu-echo-v2",
        occurredAt: "2026-08-10T09:30:00Z",
        narrative: "",
        values: {
          exam_type: "ETT complète",
          volume: "3",
          autonomy: "réalisation supervisée",
          indication: "Bilan de souffle systolique",
          learner_conclusion: "FEVG conservée, gradient aortique modéré.",
        },
        photos: [
          {
            requirementId: "phr-diu-conclusion",
            requirementLabel: "Conclusion du compte rendu d'échocardiographie",
            placeholderName: "placeholder-fragment-phr-diu-conclusion.png",
            attachedAt: "2026-08-10T09:45:00Z",
            declaredNoIdentifiers: true,
            checklistAcknowledged: PHOTO_CHECKLIST.map((i) => i.key),
            automaticCheck: "not_active",
            storage: "mock_placeholder",
          },
        ],
      },
      {
        ...base,
        id: "sle-diu-2",
        stageLogId: "slog-diu-camille",
        templateId: "slt-diu-echo-v2",
        occurredAt: "2026-08-12T14:00:00Z",
        narrative: "",
        values: {
          exam_type: "ETT ciblée",
          volume: "5",
          autonomy: "réalisation autonome",
          indication: "Surveillance de fonction ventriculaire gauche",
        },
        photos: [],
      },
    ],
  },
  {
    ...base,
    id: "slog-dfasm-camille",
    templateId: "slt-dfasm-cardio-v1",
    templateVersion: 1,
    programId: "prog-dfasm-cardio",
    cohortId: "coh-dfasm-2026",
    enrollmentId: "enr-dfasm",
    placementAssignmentId: "pas-cardio-1",
    status: "submitted",
    validations: [],
    entries: [
      {
        ...base,
        id: "sle-dfasm-1",
        stageLogId: "slog-dfasm-camille",
        templateId: "slt-dfasm-cardio-v1",
        occurredAt: "2026-09-08T08:15:00Z",
        narrative: "",
        values: {
          clinical_situation: "Douleur thoracique",
          acts: "Examen clinique, ECG 12 dérivations",
          reasoning:
            "Douleur d'effort régressive au repos, ECG sans sus-décalage : hypothèse d'angor stable, dosage de troponine puis avis spécialisé.",
          autonomy: "réalisation supervisée",
        },
        photos: [],
      },
    ],
  },
  {
    ...base,
    id: "slog-diu-autre",
    templateId: "slt-diu-echo-v2",
    templateVersion: 2,
    programId: "prog-diu-echo",
    cohortId: "coh-diu-2026",
    enrollmentId: "enr-diu-autre",
    placementAssignmentId: "pas-echo-1",
    status: "validated",
    validations: [
      {
        stageLogId: "slog-diu-autre",
        coversFrom: "2026-06-01",
        coversTo: "2026-06-30",
        validatorPersonId: "per-supervisor",
        validatorRole: "placement_supervisor",
        decision: "validated",
        decidedAt: "2026-08-14T17:00:00Z",
        comment: "Volume atteint, autonomie conforme au niveau attendu.",
        provenance: native,
      },
    ],
    entries: [
      {
        ...base,
        id: "sle-diu-autre-1",
        stageLogId: "slog-diu-autre",
        templateId: "slt-diu-echo-v2",
        occurredAt: "2026-08-11T10:00:00Z",
        narrative: "",
        values: {
          exam_type: "Échographie de stress",
          volume: "1",
          autonomy: "observation",
          indication: "Recherche d'ischémie inductible",
        },
        photos: [],
      },
    ],
  },
];
