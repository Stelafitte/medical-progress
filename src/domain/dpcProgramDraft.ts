/**
 * BROUILLON de programme DPC — modèle de l'assistant de création (maquette).
 *
 * Ce module est PUR (aucun I/O, aucun réseau, aucune IA). Il décrit :
 *  - les documents sources déposés localement et leur classement explicite ;
 *  - le brouillon d'extraction, TOUJOURS marqué comme simulé ;
 *  - la configuration d'audit générique, dérivée de `dpcProgram.ts` ;
 *  - la checklist de contrôle avant publication (publication simulée).
 *
 * Invariants :
 *  - un même document ne peut pas être classé simultanément grille d'audit et
 *    QCM de connaissances ;
 *  - aucune extraction n'est présentée comme réelle : `extractionMode` vaut
 *    toujours "simulated" ;
 *  - aucune validation médicale n'est produite automatiquement : la publication
 *    reste bloquée tant qu'un humain n'a pas validé ;
 *  - aucune valeur n'est imposée (ni 10 dossiers, ni 29 critères, ni 2 tours).
 */
import type { IsoDateTime, PersonId } from "./types";
import type {
  DpcAuditModuleConfig,
  DpcBibliographyEntry,
  DpcFacultyEntry,
  DpcImportableKind,
  DpcProgramDefinition,
  DpcResourceRef,
  DpcScheduleEntry,
  DpcTeachingModality,
} from "./dpcProgram";
import type { DpcComponentKind, DpcImplementationPlan } from "./dpcImplementation";
import {
  DPC_COMPONENT_KIND_LABELS_FR,
  activeComponentKinds,
  blockingIssues,
  emptyImplementationPlan,
  implementationSummary,
  isImplementationSchedulable,
  isSlotScheduled,
} from "./dpcImplementation";
import {
  isAuditGridArtifact,
  isKnowledgeQuizArtifact,
  orderedRounds,
  recordsExpectedForRound,
  validateProgramDefinition,
} from "./dpcProgram";

/* ------------------------------------------------------------------ */
/* 1. Étapes de l'assistant                                            */
/* ------------------------------------------------------------------ */

export type DpcWizardStepId =
  | "source_documents"
  | "proposed_extraction"
  | "audit_configuration"
  | "assessment_separation"
  | "implementation_schedule"
  | "communication_plan"
  | "publication_check";

export interface DpcWizardStep {
  readonly id: DpcWizardStepId;
  readonly order: number;
  readonly title: string;
  readonly description: string;
}

export const DPC_WIZARD_STEPS: readonly DpcWizardStep[] = [
  {
    id: "source_documents",
    order: 1,
    title: "Importer les documents",
    description:
      "Programme principal Word ou PDF, grille(s) d'audit éventuelle(s), QCM éventuels, supports, bibliographie et autres documents associés. Dépôt simulé, classement explicite.",
  },
  {
    id: "proposed_extraction",
    order: 2,
    title: "Vérifier l'analyse proposée",
    description:
      "Analyse documentaire simulée : identité du programme, objectifs, public, intervenants, modules détectés, audits, QCM, modalités, ressources et bibliographie à contrôler.",
  },
  {
    id: "audit_configuration",
    order: 3,
    title: "Vérifier les modules et les règles",
    description:
      "Audit présent ou absent, nombre de grilles, nombre de dossiers, nombre et ordre des tours, règles d'achèvement et attestation.",
  },
  {
    id: "assessment_separation",
    order: 4,
    title: "Audits et QCM détectés",
    description:
      "Audits de pratiques sur dossiers et tests de connaissances par QCM présentés séparément, avec analyse personnalisée.",
  },
  {
    id: "implementation_schedule",
    order: 5,
    title: "Programmer l'implémentation",
    description:
      "Nom ou édition, cohorte, participants, coordinateur, intervenants, présentiel, visioconférence, e-formation ou hybride, calendrier précis et dates d'ouverture, de fermeture et de relance.",
  },
  {
    id: "publication_check",
    order: 6,
    title: "Contrôle final",
    description:
      "Documents classés, données extraites vérifiées, grille médicalement validée, calendrier cohérent, cohorte sélectionnée, absence de données patients et règles d'achèvement définies.",
  },
];

export const DPC_SIMULATED_EXTRACTION_NOTICE_FR =
  "Analyse documentaire simulée — validation du coordinateur requise";

export const DPC_SIMULATED_UPLOAD_NOTICE_FR =
  "Dépôt simulé : aucun fichier n'est transmis à un serveur, aucune lecture réelle du contenu.";

/* ------------------------------------------------------------------ */
/* 2. Documents sources et classement                                  */
/* ------------------------------------------------------------------ */

export interface DpcDraftDocument {
  readonly id: string;
  readonly fileName: string;
  /** Classement explicite, jamais deviné. Vide = document non classé. */
  readonly kinds: readonly DpcImportableKind[];
  readonly sizeBytes?: number;
  /** Toujours vrai dans la maquette : aucun contenu réellement extrait. */
  readonly simulated: true;
  readonly note?: string;
}

export type DpcDocumentKindConflict =
  | { readonly conflict: false }
  | { readonly conflict: true; readonly code: "audit_grid_and_quiz"; readonly message: string };

const NO_CONFLICT: DpcDocumentKindConflict = { conflict: false };

/** Un document ne peut pas être à la fois grille d'audit et QCM. */
export function documentKindConflict(
  kinds: readonly DpcImportableKind[],
): DpcDocumentKindConflict {
  if (kinds.some(isAuditGridArtifact) && kinds.some(isKnowledgeQuizArtifact))
    return {
      conflict: true,
      code: "audit_grid_and_quiz",
      message:
        "Un même document ne peut pas être classé à la fois « Grille d'audit clinique » et « QCM de connaissances » : ce sont deux natures d'évaluation distinctes.",
    };
  return NO_CONFLICT;
}

/** Le classement demandé est-il acceptable pour ce document ? */
export function canAssignKind(
  document: DpcDraftDocument,
  kind: DpcImportableKind,
): DpcDocumentKindConflict {
  if (document.kinds.includes(kind)) return NO_CONFLICT;
  return documentKindConflict([...document.kinds, kind]);
}

/** Bascule un classement ; le retrait est toujours autorisé, l'ajout jamais conflictuel. */
export function toggleDocumentKind(
  document: DpcDraftDocument,
  kind: DpcImportableKind,
): DpcDraftDocument {
  if (document.kinds.includes(kind))
    return { ...document, kinds: document.kinds.filter((k) => k !== kind) };
  if (canAssignKind(document, kind).conflict) return document;
  return { ...document, kinds: [...document.kinds, kind] };
}

export function unclassifiedDocuments(
  documents: readonly DpcDraftDocument[],
): readonly DpcDraftDocument[] {
  return documents.filter((d) => d.kinds.length === 0);
}

export function documentsOfKind(
  documents: readonly DpcDraftDocument[],
  kind: DpcImportableKind,
): readonly DpcDraftDocument[] {
  return documents.filter((d) => d.kinds.includes(kind));
}

/* ------------------------------------------------------------------ */
/* 3. Brouillon d'extraction                                           */
/* ------------------------------------------------------------------ */

export interface DpcExtractionDraft {
  /** Jamais autre chose que "simulated" dans cette maquette. */
  readonly extractionMode: "simulated";
  readonly title: string;
  readonly administrativeNumber?: string;
  readonly orientations: readonly string[];
  readonly targetAudience: string;
  readonly objectives: readonly string[];
  readonly teachingModalities: readonly DpcTeachingModality[];
  readonly faculty: readonly DpcFacultyEntry[];
  readonly schedule: readonly DpcScheduleEntry[];
  readonly detectedModules: readonly string[];
  readonly resources: readonly DpcResourceRef[];
  readonly bibliography: readonly DpcBibliographyEntry[];
}

export interface DpcHumanValidation {
  readonly by: PersonId;
  readonly at: IsoDateTime;
  readonly statement: string;
}

export interface DpcProgramDraft {
  readonly id: string;
  readonly label: string;
  readonly version: string;
  readonly checksum?: string;
  readonly documents: readonly DpcDraftDocument[];
  readonly extraction: DpcExtractionDraft;
  readonly audit: DpcAuditModuleConfig;
  /**
   * Calendrier d'implémentation : composants retenus et dates précises.
   * Tous les composants sont optionnels ; le plan peut être vide.
   */
  readonly implementation: DpcImplementationPlan;
  /** Nombre de QCM déclarés, configurable et jamais imposé. */
  readonly quizCount: number;
  /** Paramétrage médical des critères validé par un humain identifié. */
  readonly medicalParametersValidated: boolean;
  readonly humanValidation?: DpcHumanValidation;
  /** Publication réelle impossible dans la maquette. */
  readonly publicationSimulated: true;
}

/** Construit un brouillon à partir d'une définition existante (démonstrateur). */
export function draftFromDefinition(
  definition: DpcProgramDefinition,
  options: {
    readonly id: string;
    readonly label: string;
    readonly quizCount: number;
    readonly medicalParametersValidated?: boolean;
    readonly humanValidation?: DpcHumanValidation;
    readonly checksum?: string;
    readonly documents?: readonly DpcDraftDocument[];
    readonly implementation?: DpcImplementationPlan;
  },
): DpcProgramDraft {
  const detectedModules = Object.entries(definition.modules)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
  return {
    id: options.id,
    label: options.label,
    version: definition.version.version,
    ...(options.checksum ? { checksum: options.checksum } : {}),
    documents:
      options.documents ??
      definition.sourceDocuments.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        kinds: [doc.kind],
        simulated: true as const,
        ...(doc.provenance.importNote ? { note: doc.provenance.importNote } : {}),
      })),
    extraction: {
      extractionMode: "simulated",
      title: definition.title,
      ...(definition.administrativeNumber
        ? { administrativeNumber: definition.administrativeNumber }
        : {}),
      orientations: definition.orientations,
      targetAudience: definition.targetAudience,
      objectives: definition.objectives,
      teachingModalities: definition.teachingModalities,
      faculty: definition.faculty,
      schedule: definition.schedule,
      detectedModules,
      resources: definition.resources,
      bibliography: definition.bibliography,
    },
    audit: definition.audit,
    implementation:
      options.implementation ??
      emptyImplementationPlan(`${options.id}-implementation`, "Calendrier d'implémentation"),
    quizCount: options.quizCount,
    medicalParametersValidated: options.medicalParametersValidated ?? false,
    ...(options.humanValidation ? { humanValidation: options.humanValidation } : {}),
    publicationSimulated: true,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Détection de données patient                                     */
/* ------------------------------------------------------------------ */

const PATIENT_DATA_MARKERS: readonly string[] = [
  "nom du patient",
  "prénom",
  "date de naissance",
  "numéro de sécurité sociale",
  "nir",
  "ipp",
  "adresse du patient",
  "téléphone du patient",
];

/** Repère déterministe de marqueurs identifiants dans des textes de configuration. */
export function detectPatientDataMarkers(texts: readonly string[]): readonly string[] {
  const found = new Set<string>();
  for (const text of texts) {
    const haystack = text.toLowerCase();
    for (const marker of PATIENT_DATA_MARKERS) {
      if (haystack.includes(marker)) found.add(marker);
    }
  }
  return [...found];
}

function draftTexts(draft: DpcProgramDraft): readonly string[] {
  return [
    draft.extraction.title,
    draft.extraction.targetAudience,
    ...draft.extraction.objectives,
    ...draft.audit.grids.flatMap((grid) => [grid.title, ...grid.inclusionCriteria]),
    ...draft.audit.rounds.map((round) => round.label),
    ...draft.implementation.slots.flatMap((slot) => [
      slot.label,
      slot.location ?? "",
      slot.note ?? "",
    ]),
  ];
}

/* ------------------------------------------------------------------ */
/* 5. Checklist de contrôle avant publication                          */
/* ------------------------------------------------------------------ */

export type DpcChecklistItemId =
  | "program_complete"
  | "documents_classified"
  | "grid_validated"
  | "medical_parameters_validated"
  | "completeness_rules_defined"
  | "schedule_defined"
  | "no_patient_data"
  | "implementation_planned"
  | "quiz_separated_from_audits"
  | "version_and_checksum"
  | "human_validation_recorded";

export interface DpcChecklistItem {
  readonly id: DpcChecklistItemId;
  readonly label: string;
  readonly required: boolean;
  readonly satisfied: boolean;
  readonly detail: string;
}

/** Checklist déterministe : aucune ligne n'est cochée par défaut. */
export function publicationChecklist(draft: DpcProgramDraft): readonly DpcChecklistItem[] {
  const structuralIssues = [
    ...(draft.extraction.title.trim() === "" ? ["titre"] : []),
    ...(draft.extraction.targetAudience.trim() === "" ? ["public cible"] : []),
    ...(draft.extraction.objectives.length === 0 ? ["objectifs"] : []),
    ...(draft.extraction.orientations.length === 0 ? ["orientations"] : []),
  ];

  const unclassified = unclassifiedDocuments(draft.documents);
  const conflicting = draft.documents.filter((d) => documentKindConflict(d.kinds).conflict);

  const grids = draft.audit.grids;
  const rounds = orderedRounds(draft.audit);
  const gridsValidated =
    grids.length > 0 &&
    grids.every(
      (grid) =>
        grid.version.status === "validated" ||
        grid.version.status === "published" ||
        grid.version.frozenAt !== undefined,
    );

  const roundsWithRule = rounds.filter((round) => {
    const rule = round.completenessRule ?? grids.find((g) => g.gridId === round.gridId)?.completenessRule;
    const records = recordsExpectedForRound(draft.audit, round.roundId);
    return rule !== undefined && records !== undefined && records >= 1;
  });

  const datedRounds = rounds.filter((round) => round.opensOn && round.closesOn);
  const implementation = implementationSummary(draft.implementation);
  const implementationPlanned = draft.implementation.slots.length > 0;
  const implementationSchedulable = isImplementationSchedulable(draft.implementation);
  const implementationBlocking = blockingIssues(draft.implementation);
  const patientMarkers = detectPatientDataMarkers(draftTexts(draft));

  const items: DpcChecklistItem[] = [
    {
      id: "program_complete",
      label: "Programme complet",
      required: true,
      satisfied: structuralIssues.length === 0,
      detail:
        structuralIssues.length === 0
          ? "Titre, public, objectifs et orientations renseignés."
          : `Éléments manquants : ${structuralIssues.join(", ")}.`,
    },
    {
      id: "documents_classified",
      label: "Documents classés",
      required: true,
      satisfied: draft.documents.length > 0 && unclassified.length === 0 && conflicting.length === 0,
      detail:
        draft.documents.length === 0
          ? "Aucun document source déposé."
          : conflicting.length > 0
            ? `${conflicting.length} document(s) classés à la fois grille d'audit et QCM.`
            : unclassified.length === 0
              ? `${draft.documents.length} document(s) classés.`
              : `${unclassified.length} document(s) sans nature attribuée.`,
    },
    {
      id: "grid_validated",
      label: "Grille validée",
      required: draft.audit.rounds.length > 0,
      satisfied: draft.audit.rounds.length === 0 ? true : gridsValidated,
      detail:
        draft.audit.rounds.length === 0
          ? "Aucun tour d'audit configuré : ce contrôle ne s'applique pas."
          : gridsValidated
            ? `${grids.length} grille(s) en version validée ou publiée.`
            : "Au moins une grille reste en brouillon.",
    },
    {
      id: "medical_parameters_validated",
      label: "Paramètres médicaux validés",
      required: draft.audit.grids.length > 0,
      satisfied: draft.audit.grids.length === 0 ? true : draft.medicalParametersValidated,
      detail:
        draft.audit.grids.length === 0
          ? "Aucune grille : pas de paramétrage médical requis."
          : draft.medicalParametersValidated
            ? "Paramétrage médical des critères déclaré validé par un humain."
            : "Paramétrage médical des critères non validé : aucune conclusion comparative possible.",
    },
    {
      id: "completeness_rules_defined",
      label: "Règles de complétude définies",
      required: draft.audit.rounds.length > 0,
      satisfied: rounds.length === 0 ? true : roundsWithRule.length === rounds.length,
      detail:
        rounds.length === 0
          ? "Aucun tour configuré."
          : `${roundsWithRule.length}/${rounds.length} tour(s) avec règle de complétude et nombre de dossiers valides.`,
    },
    {
      id: "schedule_defined",
      label: "Calendrier défini",
      required: true,
      satisfied:
        draft.extraction.schedule.length > 0 &&
        (rounds.length === 0 || datedRounds.length === rounds.length),
      detail:
        draft.extraction.schedule.length === 0
          ? "Aucune étape de calendrier renseignée."
          : rounds.length > 0 && datedRounds.length < rounds.length
            ? `${datedRounds.length}/${rounds.length} tour(s) avec dates d'ouverture et de fermeture.`
            : "Calendrier du programme et fenêtres des tours renseignés.",
    },
    {
      id: "implementation_planned",
      label: "Calendrier d'implémentation exploitable",
      required: true,
      satisfied: implementationPlanned && implementationSchedulable,
      detail: !implementationPlanned
        ? "Aucun composant programmé : sélectionnez les composants retenus (audit, tests, formation) et datez-les."
        : implementationSchedulable
          ? `${implementation.scheduledSlots}/${implementation.totalSlots} composant(s) programmés : ${implementation.components
              .map((kind) => DPC_COMPONENT_KIND_LABELS_FR[kind])
              .join(", ")}.`
          : `${implementationBlocking.length} point(s) bloquant(s) dans le calendrier : ${implementationBlocking
              .map((issue) => issue.message)
              .join(" ")}`,
    },
    {
      id: "no_patient_data",
      label: "Absence de données patients",
      required: true,
      satisfied: patientMarkers.length === 0,
      detail:
        patientMarkers.length === 0
          ? "Aucun marqueur identifiant détecté dans la configuration."
          : `Marqueurs à retirer : ${patientMarkers.join(", ")}.`,
    },
    {
      id: "quiz_separated_from_audits",
      label: "QCM séparés des audits",
      required: true,
      satisfied: conflicting.length === 0,
      detail:
        conflicting.length === 0
          ? "Aucun document classé simultanément grille d'audit et QCM."
          : "Un document est classé à la fois grille d'audit et QCM.",
    },
    {
      id: "version_and_checksum",
      label: "Version et checksum",
      required: true,
      satisfied: draft.version.trim() !== "" && (draft.checksum ?? "").trim() !== "",
      detail:
        draft.checksum && draft.version
          ? `Version ${draft.version} · empreinte ${draft.checksum}`
          : "Version ou empreinte de configuration manquante.",
    },
    {
      id: "human_validation_recorded",
      label: "Validation humaine enregistrée",
      required: true,
      satisfied: draft.humanValidation !== undefined,
      detail: draft.humanValidation
        ? `Validée le ${draft.humanValidation.at} par ${draft.humanValidation.by}.`
        : "Aucune validation humaine enregistrée : la publication reste bloquée.",
    },
  ];

  return items;
}

export interface DpcPublicationReadiness {
  readonly canPublish: boolean;
  readonly blocking: readonly DpcChecklistItem[];
  readonly satisfiedCount: number;
  readonly requiredCount: number;
  /** Toujours vrai : la publication de la maquette n'écrit rien. */
  readonly simulated: true;
}

export function publicationReadiness(draft: DpcProgramDraft): DpcPublicationReadiness {
  const items = publicationChecklist(draft);
  const required = items.filter((item) => item.required);
  const blocking = required.filter((item) => !item.satisfied);
  return {
    canPublish: blocking.length === 0,
    blocking,
    satisfiedCount: required.filter((item) => item.satisfied).length,
    requiredCount: required.length,
    simulated: true,
  };
}

/** Résumé chiffré du brouillon : toutes les valeurs sont calculées. */
export interface DpcDraftShape {
  readonly grids: number;
  readonly rounds: number;
  readonly quizzes: number;
  readonly documents: number;
  /** Composants réellement programmés (aucun n'est obligatoire). */
  readonly components: readonly DpcComponentKind[];
  readonly scheduledSlots: number;
  readonly recordsPerRound: readonly { readonly roundId: string; readonly records?: number }[];
}

export function draftShape(draft: DpcProgramDraft): DpcDraftShape {
  return {
    grids: draft.audit.grids.length,
    rounds: draft.audit.rounds.length,
    quizzes: draft.quizCount,
    documents: draft.documents.length,
    components: activeComponentKinds(draft.implementation),
    scheduledSlots: draft.implementation.slots.filter(isSlotScheduled).length,
    recordsPerRound: orderedRounds(draft.audit).map((round) => {
      const records = recordsExpectedForRound(draft.audit, round.roundId);
      return records === undefined ? { roundId: round.roundId } : { roundId: round.roundId, records };
    }),
  };
}

/** Problèmes structurels de la configuration d'audit d'un brouillon. */
export function draftStructuralIssues(
  draft: DpcProgramDraft,
  definition: DpcProgramDefinition,
): readonly string[] {
  return validateProgramDefinition({ ...definition, audit: draft.audit }).map((i) => i.message);
}
