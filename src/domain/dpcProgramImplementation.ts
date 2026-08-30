/**
 * IMPLÉMENTATION OPÉRATIONNELLE d'un programme DPC de référence.
 *
 * Distinction structurante :
 *  - le PROGRAMME DE RÉFÉRENCE (`DpcProgramDefinition`) porte le contenu
 *    scientifique : objectifs, public, méthode, grilles, QCM, bibliographie ;
 *  - l'IMPLÉMENTATION (ce module) porte l'exploitation : cohorte, calendrier,
 *    modalités, intervenants, ouvertures, fermetures, relances et suivi.
 *
 * Un même programme de référence peut être implémenté plusieurs fois (JESFC
 * janvier 2027, visioconférence juin 2027, e-formation septembre 2027) sans
 * dupliquer son contenu. Les DATES appartiennent à l'implémentation, jamais au
 * programme de référence.
 *
 * Invariants :
 *  - tous les modules sont indépendamment activables : une implémentation est
 *    valide sans audit, sans QCM, sans formation synchrone, en e-formation
 *    seule, ou en combinaison ;
 *  - une échéance n'est licite que si le module correspondant est activé ;
 *  - le fuseau horaire est obligatoire : aucune date n'est interprétable sans
 *    lui ;
 *  - la publication du programme de référence et l'ouverture d'une
 *    implémentation sont deux actes DISTINCTS ;
 *  - module PUR : aucun I/O, aucune IA, aucun envoi, aucune ouverture réelle.
 */
import type { CohortId, IsoDateTime, PersonId } from "./types";

/* ------------------------------------------------------------------ */
/* 1. Vocabulaire                                                      */
/* ------------------------------------------------------------------ */

export const DPC_IMPLEMENTATION_VOCABULARY_FR = {
  referenceProgram: "programme de référence",
  implementation: "implémentation",
  cohort: "cohorte",
  schedule: "calendrier",
  activeModules: "modules activés",
  preOpeningValidation: "validation avant ouverture",
} as const;

/* ------------------------------------------------------------------ */
/* 2. Modules facultatifs                                              */
/* ------------------------------------------------------------------ */

export type DpcModuleKey =
  "practice_audit" | "pre_test" | "training" | "post_test" | "improvement_plan" | "attestation";

export const DPC_MODULE_LABELS_FR: Record<DpcModuleKey, string> = {
  practice_audit: "Audit de pratiques",
  pre_test: "Pré-test de connaissances",
  training: "Formation",
  post_test: "Post-test de connaissances",
  improvement_plan: "Plan d'amélioration",
  attestation: "Attestation",
};

export const DPC_MODULE_ORDER: readonly DpcModuleKey[] = [
  "practice_audit",
  "pre_test",
  "training",
  "post_test",
  "improvement_plan",
  "attestation",
];

/** Modules activés : aucun n'est obligatoire, aucun n'en implique un autre. */
export type DpcActiveModules = Readonly<Record<DpcModuleKey, boolean>>;

export function noModulesActive(): DpcActiveModules {
  return {
    practice_audit: false,
    pre_test: false,
    training: false,
    post_test: false,
    improvement_plan: false,
    attestation: false,
  };
}

export function activeModuleKeys(modules: DpcActiveModules): readonly DpcModuleKey[] {
  return DPC_MODULE_ORDER.filter((key) => modules[key]);
}

/* ------------------------------------------------------------------ */
/* 3. Séquences de formation et modalités                              */
/* ------------------------------------------------------------------ */

export type DpcSequenceModality = "in_person" | "virtual_classroom" | "e_learning";

export const DPC_SEQUENCE_MODALITY_LABELS_FR: Record<DpcSequenceModality, string> = {
  in_person: "Présentiel",
  virtual_classroom: "Visioconférence",
  e_learning: "E-formation",
};

export type DpcResourceProgressRule = "consultation" | "completion";

/** Une séquence : présentiel, visioconférence ou e-formation. Ordre déclaré. */
export interface DpcTrainingSequence {
  readonly id: string;
  readonly label: string;
  readonly modality: DpcSequenceModality;
  readonly order: number;
  /** Présentiel / visioconférence : date, heures de début et de fin. */
  readonly startsAt?: IsoDateTime;
  readonly endsAt?: IsoDateTime;
  /** E-formation : fenêtre d'ouverture et de fermeture. */
  readonly opensOn?: IsoDateTime;
  readonly closesOn?: IsoDateTime;
  /** Présentiel : lieu. */
  readonly location?: string;
  /** Visioconférence : fournisseur et lien public (jamais un secret). */
  readonly provider?: string;
  readonly joinUrl?: string;
  /** Présence requise ou non (synchrone). */
  readonly attendanceRequired?: boolean;
  /** E-formation : ressources obligatoires et règle de progression. */
  readonly requiredResourceIds?: readonly string[];
  readonly resourceProgressRule?: DpcResourceProgressRule;
  /** E-formation : ordre libre ou séquentiel. */
  readonly sequentialResources?: boolean;
}

export function isSynchronous(modality: DpcSequenceModality): boolean {
  return modality === "in_person" || modality === "virtual_classroom";
}

export function sequenceStart(sequence: DpcTrainingSequence): IsoDateTime | undefined {
  return sequence.startsAt ?? sequence.opensOn;
}

export function sequenceEnd(sequence: DpcTrainingSequence): IsoDateTime | undefined {
  return sequence.endsAt ?? sequence.closesOn;
}

/** Le parcours est hybride dès qu'il combine au moins deux modalités. */
export function isHybrid(sequences: readonly DpcTrainingSequence[]): boolean {
  return new Set(sequences.map((sequence) => sequence.modality)).size > 1;
}

export function orderedSequences(
  sequences: readonly DpcTrainingSequence[],
): readonly DpcTrainingSequence[] {
  return [...sequences].sort((a, b) => a.order - b.order);
}

/* ------------------------------------------------------------------ */
/* 4. Calendrier générique d'étapes                                    */
/* ------------------------------------------------------------------ */

export type DpcMilestoneKind =
  | "audit_a1_open"
  | "audit_a1_close"
  | "audit_a1_feedback"
  | "pre_test"
  | "training_sequence"
  | "post_test"
  | "improvement_plan"
  | "interval_before_a2"
  | "audit_a2_open"
  | "audit_a2_close"
  | "analysis_validation"
  | "synthesis_release"
  | "attestation";

export const DPC_MILESTONE_LABELS_FR: Record<DpcMilestoneKind, string> = {
  audit_a1_open: "Ouverture de l'audit A1",
  audit_a1_close: "Fermeture de l'audit A1",
  audit_a1_feedback: "Retour personnalisé A1",
  pre_test: "Pré-test",
  training_sequence: "Séquence de formation",
  post_test: "Post-test",
  improvement_plan: "Plan d'amélioration",
  interval_before_a2: "Délai avant A2",
  audit_a2_open: "Ouverture de l'audit A2",
  audit_a2_close: "Fermeture de l'audit A2",
  analysis_validation: "Validation de l'analyse",
  synthesis_release: "Diffusion de la synthèse",
  attestation: "Attestation",
};

/** Module dont dépend chaque étape : une échéance orpheline est une erreur. */
export const DPC_MILESTONE_REQUIRED_MODULE: Readonly<
  Record<DpcMilestoneKind, DpcModuleKey | undefined>
> = {
  audit_a1_open: "practice_audit",
  audit_a1_close: "practice_audit",
  audit_a1_feedback: "practice_audit",
  pre_test: "pre_test",
  training_sequence: "training",
  post_test: "post_test",
  improvement_plan: "improvement_plan",
  interval_before_a2: "practice_audit",
  audit_a2_open: "practice_audit",
  audit_a2_close: "practice_audit",
  analysis_validation: "practice_audit",
  synthesis_release: undefined,
  attestation: "attestation",
};

export interface DpcMilestone {
  readonly id: string;
  readonly kind: DpcMilestoneKind;
  readonly label: string;
  readonly startsAt: IsoDateTime;
  /** Étape ponctuelle : pas de fin. Étape à fenêtre : fin renseignée. */
  readonly endsAt?: IsoDateTime;
  /** Séquence de formation rattachée, si applicable. */
  readonly sequenceId?: string;
  /** Les chevauchements avec les autres étapes exclusives sont interdits. */
  readonly exclusive?: boolean;
  readonly note?: string;
}

export interface DpcImplementationSchedule {
  readonly timeZone: string;
  readonly milestones: readonly DpcMilestone[];
  /** Parcours avant/après exigé : A2 ne peut précéder la formation. */
  readonly requiresBeforeAfterAudit?: boolean;
}

export function orderedMilestones(schedule: DpcImplementationSchedule): readonly DpcMilestone[] {
  return [...schedule.milestones].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function milestoneOf(
  schedule: DpcImplementationSchedule,
  kind: DpcMilestoneKind,
): DpcMilestone | undefined {
  return schedule.milestones.find((milestone) => milestone.kind === kind);
}

/* ------------------------------------------------------------------ */
/* 5. Implémentation                                                   */
/* ------------------------------------------------------------------ */

export type DpcImplementationStatus =
  "draft" | "scheduled" | "open" | "running" | "completed" | "archived";

export const DPC_IMPLEMENTATION_STATUS_LABELS_FR: Record<DpcImplementationStatus, string> = {
  draft: "Brouillon",
  scheduled: "Programmée",
  open: "Inscriptions ouvertes",
  running: "En cours",
  completed: "Terminée",
  archived: "Archivée",
};

export interface DpcImplementationCompletionRules {
  /** Nombre de dossiers attendus par tour, si l'audit est activé. */
  readonly recordsPerRound?: number;
  /** Score minimal exigé au post-test, si activé. */
  readonly minimumPostTestScore?: number;
  /** Ressources obligatoires à consulter, si e-formation. */
  readonly allRequiredResources?: boolean;
  /** Présence exigée aux séquences synchrones marquées obligatoires. */
  readonly attendanceMandatory?: boolean;
}

export interface DpcProgramImplementation {
  readonly id: string;
  /** Programme de référence implémenté. */
  readonly programDefinitionId: string;
  /** Version EXACTE du programme de référence, jamais « la dernière ». */
  readonly programDefinitionVersion: string;
  readonly name: string;
  readonly cohortId: CohortId;
  readonly coordinatorId: PersonId;
  /** Intervenants effectivement mobilisés pour cette implémentation. */
  readonly facilitatorIds: readonly PersonId[];
  readonly timeZone: string;
  readonly status: DpcImplementationStatus;
  readonly enrollmentOpensOn?: IsoDateTime;
  readonly enrollmentClosesOn?: IsoDateTime;
  readonly startsOn?: IsoDateTime;
  readonly endsOn?: IsoDateTime;
  readonly modules: DpcActiveModules;
  readonly sequences: readonly DpcTrainingSequence[];
  readonly schedule: DpcImplementationSchedule;
  readonly completionRules: DpcImplementationCompletionRules;
  /** Dates de relance (aucun envoi réel dans la maquette). */
  readonly reminderDates: readonly IsoDateTime[];
  readonly maxParticipants?: number;
}

/* ------------------------------------------------------------------ */
/* 6. Contrôles déterministes avant ouverture                          */
/* ------------------------------------------------------------------ */

export type DpcImplementationIssueCode =
  | "missing_time_zone"
  | "missing_name"
  | "end_before_start"
  | "enrollment_close_before_open"
  | "milestone_end_before_start"
  | "milestone_without_module"
  | "forbidden_overlap"
  | "a2_before_training"
  | "post_test_before_training"
  | "sequence_without_training_module"
  | "missing_sequence_datetime"
  | "missing_window"
  | "missing_location"
  | "missing_provider"
  | "missing_required_resources"
  | "no_module_active"
  | "reminder_outside_window";

export type DpcIssueSeverity = "blocking" | "warning";

export interface DpcImplementationIssue {
  readonly code: DpcImplementationIssueCode;
  readonly severity: DpcIssueSeverity;
  readonly message: string;
  readonly ref?: string;
}

const ms = (value: IsoDateTime) => Date.parse(value);

function sequenceIssues(
  implementation: DpcProgramImplementation,
): readonly DpcImplementationIssue[] {
  const issues: DpcImplementationIssue[] = [];
  for (const sequence of implementation.sequences) {
    const push = (code: DpcImplementationIssueCode, severity: DpcIssueSeverity, message: string) =>
      issues.push({ code, severity, message, ref: sequence.id });

    if (!implementation.modules.training)
      push(
        "sequence_without_training_module",
        "blocking",
        `« ${sequence.label} » est programmée alors que le module Formation n'est pas activé.`,
      );

    if (isSynchronous(sequence.modality)) {
      if (!sequence.startsAt || !sequence.endsAt)
        push(
          "missing_sequence_datetime",
          "blocking",
          `« ${sequence.label} » exige une date avec heures de début et de fin.`,
        );
      if (sequence.modality === "in_person" && (sequence.location ?? "").trim() === "")
        push("missing_location", "blocking", `Renseignez le lieu de « ${sequence.label} ».`);
      if (sequence.modality === "virtual_classroom" && (sequence.provider ?? "").trim() === "")
        push(
          "missing_provider",
          "blocking",
          `Renseignez le fournisseur de visioconférence de « ${sequence.label} ».`,
        );
    } else {
      if (!sequence.opensOn || !sequence.closesOn)
        push(
          "missing_window",
          "blocking",
          `« ${sequence.label} » exige une fenêtre d'ouverture et de fermeture.`,
        );
      if ((sequence.requiredResourceIds ?? []).length === 0)
        push(
          "missing_required_resources",
          "blocking",
          `« ${sequence.label} » exige au moins une ressource obligatoire.`,
        );
    }

    const start = sequenceStart(sequence);
    const end = sequenceEnd(sequence);
    if (start && end && ms(end) <= ms(start))
      push("end_before_start", "blocking", `« ${sequence.label} » se termine avant de commencer.`);
  }
  return issues;
}

function overlapIssues(schedule: DpcImplementationSchedule): readonly DpcImplementationIssue[] {
  const exclusive = schedule.milestones
    .filter((milestone) => milestone.exclusive && milestone.endsAt)
    .sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
  const issues: DpcImplementationIssue[] = [];
  for (let index = 1; index < exclusive.length; index += 1) {
    const previous = exclusive[index - 1]!;
    const current = exclusive[index]!;
    if (ms(current.startsAt) < ms(previous.endsAt!))
      issues.push({
        code: "forbidden_overlap",
        severity: "blocking",
        message: `« ${current.label} » chevauche « ${previous.label} » alors que le chevauchement est interdit.`,
        ref: current.id,
      });
  }
  return issues;
}

function scheduleIssues(
  implementation: DpcProgramImplementation,
): readonly DpcImplementationIssue[] {
  const { schedule, modules } = implementation;
  const issues: DpcImplementationIssue[] = [];

  if (schedule.timeZone.trim() === "" || implementation.timeZone.trim() === "")
    issues.push({
      code: "missing_time_zone",
      severity: "blocking",
      message: "Le fuseau horaire est obligatoire : sans lui, aucune date n'est interprétable.",
    });

  for (const milestone of schedule.milestones) {
    if (milestone.endsAt && ms(milestone.endsAt) <= ms(milestone.startsAt))
      issues.push({
        code: "milestone_end_before_start",
        severity: "blocking",
        message: `« ${milestone.label} » se termine avant de commencer.`,
        ref: milestone.id,
      });
    const required = DPC_MILESTONE_REQUIRED_MODULE[milestone.kind];
    if (required && !modules[required])
      issues.push({
        code: "milestone_without_module",
        severity: "blocking",
        message: `« ${milestone.label} » est programmée alors que le module ${DPC_MODULE_LABELS_FR[required]} n'est pas activé.`,
        ref: milestone.id,
      });
  }

  issues.push(...overlapIssues(schedule));

  const synchronousEnds = implementation.sequences
    .map((sequence) => sequenceEnd(sequence))
    .filter((value): value is IsoDateTime => value !== undefined)
    .map(ms);
  const lastTrainingEnd = synchronousEnds.length ? Math.max(...synchronousEnds) : undefined;

  if (lastTrainingEnd !== undefined) {
    const postTest = milestoneOf(schedule, "post_test");
    if (postTest && ms(postTest.startsAt) < lastTrainingEnd)
      issues.push({
        code: "post_test_before_training",
        severity: "blocking",
        message: "Le post-test ne peut pas s'ouvrir avant la fin de la formation.",
        ref: postTest.id,
      });

    if (schedule.requiresBeforeAfterAudit) {
      const a2 = milestoneOf(schedule, "audit_a2_open");
      if (a2 && ms(a2.startsAt) < lastTrainingEnd)
        issues.push({
          code: "a2_before_training",
          severity: "blocking",
          message:
            "Un parcours avant/après exige que l'audit A2 s'ouvre après la fin de la formation.",
          ref: a2.id,
        });
    }
  }

  return issues;
}

export function validateImplementation(
  implementation: DpcProgramImplementation,
): readonly DpcImplementationIssue[] {
  const issues: DpcImplementationIssue[] = [];

  if (implementation.name.trim() === "")
    issues.push({
      code: "missing_name",
      severity: "blocking",
      message: "Nommez l'implémentation : elle est distincte du programme de référence.",
    });

  const { startsOn, endsOn, enrollmentOpensOn, enrollmentClosesOn } = implementation;
  if (startsOn && endsOn && ms(endsOn) <= ms(startsOn))
    issues.push({
      code: "end_before_start",
      severity: "blocking",
      message: "La date de fin de l'implémentation précède sa date de début.",
    });
  if (enrollmentOpensOn && enrollmentClosesOn && ms(enrollmentClosesOn) <= ms(enrollmentOpensOn))
    issues.push({
      code: "enrollment_close_before_open",
      severity: "blocking",
      message: "La clôture des inscriptions précède leur ouverture.",
    });

  if (activeModuleKeys(implementation.modules).length === 0)
    issues.push({
      code: "no_module_active",
      severity: "warning",
      message:
        "Aucun module activé : tous les modules sont facultatifs, mais une implémentation sans module n'a rien à ouvrir.",
    });

  if (startsOn && endsOn) {
    for (const reminder of implementation.reminderDates) {
      if (ms(reminder) < ms(startsOn) || ms(reminder) > ms(endsOn))
        issues.push({
          code: "reminder_outside_window",
          severity: "warning",
          message: `Relance du ${reminder} hors de la période de l'implémentation.`,
        });
    }
  }

  issues.push(...sequenceIssues(implementation), ...scheduleIssues(implementation));
  return issues;
}

export function implementationBlockingIssues(
  implementation: DpcProgramImplementation,
): readonly DpcImplementationIssue[] {
  return validateImplementation(implementation).filter((issue) => issue.severity === "blocking");
}

/**
 * Ouverture possible ? L'ouverture d'une implémentation est un acte DISTINCT de
 * la publication du programme de référence : les deux sont exigés.
 */
export function canOpenImplementation(
  implementation: DpcProgramImplementation,
  referenceProgramPublished: boolean,
): boolean {
  return referenceProgramPublished && implementationBlockingIssues(implementation).length === 0;
}

/* ------------------------------------------------------------------ */
/* 7. Synthèse et regroupement                                         */
/* ------------------------------------------------------------------ */

export interface DpcImplementationOverview {
  readonly modules: readonly DpcModuleKey[];
  readonly modalities: readonly DpcSequenceModality[];
  readonly hybrid: boolean;
  readonly milestoneCount: number;
  readonly blocking: number;
  readonly warnings: number;
  readonly firstMilestone?: IsoDateTime;
  readonly lastMilestone?: IsoDateTime;
}

export function implementationOverview(
  implementation: DpcProgramImplementation,
): DpcImplementationOverview {
  const issues = validateImplementation(implementation);
  const timeline = orderedMilestones(implementation.schedule);
  const modalities = [...new Set(implementation.sequences.map((sequence) => sequence.modality))];
  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  return {
    modules: activeModuleKeys(implementation.modules),
    modalities,
    hybrid: isHybrid(implementation.sequences),
    milestoneCount: timeline.length,
    blocking: issues.filter((issue) => issue.severity === "blocking").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    ...(first ? { firstMilestone: first.startsAt } : {}),
    ...(last ? { lastMilestone: last.endsAt ?? last.startsAt } : {}),
  };
}

/** Implémentations d'un même programme de référence, toutes versions. */
export function implementationsOfProgram(
  implementations: readonly DpcProgramImplementation[],
  programDefinitionId: string,
): readonly DpcProgramImplementation[] {
  return implementations.filter((item) => item.programDefinitionId === programDefinitionId);
}

/** Versions du programme de référence effectivement implémentées. */
export function implementedReferenceVersions(
  implementations: readonly DpcProgramImplementation[],
  programDefinitionId: string,
): readonly string[] {
  return [
    ...new Set(
      implementationsOfProgram(implementations, programDefinitionId).map(
        (item) => item.programDefinitionVersion,
      ),
    ),
  ].sort();
}
