/**
 * Domaine du RESPONSABLE DE STAGE (encadrement clinique).
 *
 * Règles structurantes :
 * - un encadrant n'exerce que sur les affectations de stage dont il est responsable ;
 * - aucune compétence réelle n'est acquise sans validation humaine explicite ;
 * - une validation groupée exige toujours la revue d'une synthèse (jamais silencieuse).
 *
 * Module pur : aucune dépendance framework, aucun accès données.
 */
import type {
  EnrollmentId,
  Id,
  IsoDateTime,
  MasteryLevel,
  OutcomeId,
  PersonId,
  PlacementAssignment,
  PlacementAssignmentId,
  ProgramId,
  RoleName,
} from "./types";

export type SupervisionAlertId = Id<"SupervisionAlert">;
export type CaseDiscussionId = Id<"CaseDiscussion">;
export type CompetenceConfirmationId = Id<"CompetenceConfirmation">;
export type PlacementReportId = Id<"PlacementReport">;

/* ------------------------------------------------------------------ */
/* Alertes                                                             */
/* ------------------------------------------------------------------ */

export type SupervisionAlertKind =
  "low_activity" | "missing_quota" | "no_entry" | "underexposed_competence" | "late_validation";

export type AlertSeverity = "info" | "warning" | "critical";

export const SUPERVISION_ALERT_LABELS_FR: Record<SupervisionAlertKind, string> = {
  low_activity: "Faible activité",
  missing_quota: "Quota manquant",
  no_entry: "Absence de saisie",
  underexposed_competence: "Compétence insuffisamment exposée",
  late_validation: "Validation en retard",
};

export const ALERT_SEVERITY_LABELS_FR: Record<AlertSeverity, string> = {
  info: "information",
  warning: "à surveiller",
  critical: "urgent",
};

export interface SupervisionAlert {
  readonly id: SupervisionAlertId;
  readonly kind: SupervisionAlertKind;
  readonly severity: AlertSeverity;
  readonly programId: ProgramId;
  readonly enrollmentId: EnrollmentId;
  readonly message: string;
  readonly dueOn?: IsoDateTime;
}

/* ------------------------------------------------------------------ */
/* Cas et questions                                                    */
/* ------------------------------------------------------------------ */

export interface CaseComment {
  readonly authorPersonId: PersonId;
  readonly body: string;
  readonly at: IsoDateTime;
}

export interface CaseDiscussion {
  readonly id: CaseDiscussionId;
  readonly programId: ProgramId;
  readonly enrollmentId: EnrollmentId;
  readonly kind: "case_to_discuss" | "learner_question";
  readonly title: string;
  /** Aucun élément nominatif patient : formulation pédagogique uniquement. */
  readonly body: string;
  readonly handled: boolean;
  readonly comments: readonly CaseComment[];
}

/* ------------------------------------------------------------------ */
/* Compétences à confirmer                                             */
/* ------------------------------------------------------------------ */

export type CompetenceConfirmationDecision = "pending" | "confirmed" | "refused" | "needs_more";

export const CONFIRMATION_DECISION_LABELS_FR: Record<CompetenceConfirmationDecision, string> = {
  pending: "à confirmer",
  confirmed: "confirmée par l'encadrant",
  refused: "refusée",
  needs_more: "complément demandé",
};

export interface CompetenceConfirmation {
  readonly id: CompetenceConfirmationId;
  readonly programId: ProgramId;
  readonly enrollmentId: EnrollmentId;
  readonly outcomeId: OutcomeId;
  readonly evidenceTitle: string;
  readonly proposedAutonomy: MasteryLevel;
  readonly decision: CompetenceConfirmationDecision;
  readonly placementAssignmentId?: PlacementAssignmentId;
}

/* ------------------------------------------------------------------ */
/* Bilan de fin de stage et signature simulée                          */
/* ------------------------------------------------------------------ */

export interface ReportLine {
  readonly label: string;
  readonly value: string;
}

export interface PlacementReport {
  readonly id: PlacementReportId;
  readonly programId: ProgramId;
  readonly enrollmentId: EnrollmentId;
  readonly placementAssignmentId: PlacementAssignmentId;
  readonly volumes: readonly ReportLine[];
  readonly objectives: readonly ReportLine[];
  readonly competences: readonly ReportLine[];
  readonly supervisorComment: string;
  readonly appraisal: "insuffisant" | "satisfaisant" | "très satisfaisant";
  readonly reservations?: string;
  readonly signature: {
    readonly signed: boolean;
    /** Signature explicitement SIMULÉE : aucune valeur juridique. */
    readonly mode: "simulated";
    readonly signedByPersonId?: PersonId;
    readonly signedAt?: IsoDateTime;
  };
  /** Certificat de complétude (DIU) rattaché au bilan. */
  readonly completionCertificateRequested: boolean;
}

/* ------------------------------------------------------------------ */
/* Messagerie / notifications mock                                     */
/* ------------------------------------------------------------------ */

/*
 * IL N'Y A PLUS DE `ProfessionalMessage` ICI (17/09). Il portait
 * `delivery: "mock_no_send"` — une DÉMONSTRATION de ce que Communication
 * interne fait déjà pour de vrai, avec de vraies campagnes, de vrais envois et
 * un vrai statut. Aucun écran ne l'affichait ; il était lu par
 * `useSupervision` et jeté. Garder un modèle qui annonce lui-même qu'il
 * n'envoie rien, à côté d'un modèle qui envoie, c'est entretenir le doute sur
 * celui qui marche.
 */

/* ------------------------------------------------------------------ */
/* Règles pures de périmètre                                           */
/* ------------------------------------------------------------------ */

/** Affectations dont la personne est responsable (jamais toutes celles du programme). */
export function supervisedAssignments(
  assignments: readonly PlacementAssignment[],
  supervisorPersonId: PersonId,
): readonly PlacementAssignment[] {
  return assignments.filter((a) => a.supervisorPersonId === supervisorPersonId);
}

export function supervisedEnrollmentIds(
  assignments: readonly PlacementAssignment[],
  supervisorPersonId: PersonId,
): readonly EnrollmentId[] {
  return [
    ...new Set(supervisedAssignments(assignments, supervisorPersonId).map((a) => a.enrollmentId)),
  ];
}

export function isSupervisorOfEnrollment(
  assignments: readonly PlacementAssignment[],
  supervisorPersonId: PersonId,
  enrollmentId: EnrollmentId,
): boolean {
  return supervisedEnrollmentIds(assignments, supervisorPersonId).includes(enrollmentId);
}

/*
 * `scopedToSupervisedEnrollments` A ETE RETIRE le 10/09. Il filtrait APRES
 * COUP des listes chargees pour tout le programme -- alertes, cas,
 * confirmations, bilans -- qui etaient toutes des listes de maquette. Ces
 * listes ont disparu : ce qui reste est demande PAR IDENTIFIANTS
 * D'INSCRIPTION (`listEnrollmentsByIds`, `listSelfReports` par etudiant), donc
 * le perimetre est dans la requete, plus dans un filtre qu'on pouvait oublier
 * d'appliquer. Un filtre de perimetre qui ne filtre plus rien est une fausse
 * garantie : mieux vaut qu'il n'existe pas.
 */

/* ------------------------------------------------------------------ */
/* Règles pures d'action                                               */
/* ------------------------------------------------------------------ */

/* Le responsable de stage valide comme l'encadrant, et clôt le stage en plus
   (décision de Stef, 10/09) : la clôture n'est restreinte à personne. */
const VALIDATOR_ROLES: readonly RoleName[] = [
  "placement_supervisor",
  "placement_manager",
  "teacher",
];

export function canConfirmRealCompetence(roles: readonly RoleName[]): boolean {
  return roles.some((r) => VALIDATOR_ROLES.includes(r));
}

export function canSignPlacementReport(roles: readonly RoleName[]): boolean {
  return roles.includes("placement_supervisor") || roles.includes("placement_manager");
}

/** Invariant : une compétence réelle exige toujours une validation humaine. */
export function realCompetenceRequiresHumanValidation(): true {
  return true;
}

/** Invariant : aucune validation groupée sans revue préalable de la synthèse. */
export function bulkValidationRequiresSummaryReview(): true {
  return true;
}

export interface BulkValidationDraft {
  readonly selectedLogIds: readonly string[];
  readonly summaryReviewed: boolean;
}

export interface BulkValidationDecision {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

/** Décision testable : la validation groupée n'est jamais silencieuse. */
export function evaluateBulkValidation(
  roles: readonly RoleName[],
  draft: BulkValidationDraft,
): BulkValidationDecision {
  const reasons: string[] = [];
  if (!canConfirmRealCompetence(roles))
    reasons.push("Seul un responsable de stage ou un enseignant peut valider un carnet.");
  if (draft.selectedLogIds.length === 0) reasons.push("Sélectionnez au moins un carnet.");
  if (!draft.summaryReviewed)
    reasons.push("La synthèse des carnets sélectionnés doit être revue avant validation groupée.");
  return { allowed: reasons.length === 0, reasons };
}
