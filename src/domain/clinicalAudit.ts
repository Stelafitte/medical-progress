/**
 * Module OPTIONNEL et ADMINISTRABLE : audits de pratique, pré/post-tests et
 * séances (en ligne, visio, présentiel). Conçu pour les programmes de type DPC
 * sans créer d'architecture séparée : c'est une configuration de programme.
 *
 * Invariants :
 *  - aucune donnée patient : un dossier audité est désigné par une référence
 *    anonyme saisie par le professionnel (ex. « DOS-014 ») ;
 *  - la conformité est calculée de façon déterministe, sans IA ;
 *  - un audit ne déclare jamais seul une compétence réelle acquise.
 */
import type { CohortId, EnrollmentId, IsoDateTime, OutcomeId, ProgramId, Provenance } from "./types";

/* ------------------------------------------------------------------ */
/* Modèles                                                            */
/* ------------------------------------------------------------------ */

/** Deux temps de mesure : avant la formation, puis après. */
export type AuditPhase = "pre" | "post";

export type AuditItemKind = "boolean" | "scale" | "numeric" | "single_choice";

export interface AuditItemChoice {
  readonly value: string;
  readonly label: string;
}

export type AuditAnswerValue = string | number | boolean;

export interface AuditItem {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly kind: AuditItemKind;
  readonly helpText?: string;
  readonly choices?: readonly AuditItemChoice[];
  /** Valeur attendue (conformité). Pour `scale`/`numeric` : seuil minimal. */
  readonly expected: AuditAnswerValue;
  /** Poids relatif de l'item dans le score de conformité. */
  readonly weight: number;
  /** Acquis visé : relie l'audit au référentiel du programme. */
  readonly outcomeId?: OutcomeId;
}

export type AuditTemplateStatus = "draft" | "published" | "archived";

export interface ClinicalAuditTemplate {
  readonly id: string;
  readonly programId: ProgramId;
  readonly title: string;
  readonly description: string;
  readonly status: AuditTemplateStatus;
  /** Nombre de dossiers à auditer par participant et par campagne. */
  readonly recordsPerParticipant: number;
  /** Objectif de conformité attendu en fin de programme (en %). */
  readonly targetConformityPercent: number;
  readonly items: readonly AuditItem[];
  readonly provenance: Provenance;
}

export type AuditCampaignStatus = "planned" | "open" | "closed";

export interface ClinicalAuditCampaign {
  readonly id: string;
  readonly templateId: string;
  readonly programId: ProgramId;
  readonly cohortId: CohortId;
  readonly phase: AuditPhase;
  readonly label: string;
  readonly opensOn: IsoDateTime;
  readonly closesOn: IsoDateTime;
  readonly status: AuditCampaignStatus;
}

export interface AuditRecordEntry {
  /** Référence ANONYME du dossier, saisie par le professionnel. */
  readonly recordRef: string;
  readonly answers: Readonly<Record<string, AuditAnswerValue>>;
}

export type AuditSubmissionStatus = "not_started" | "in_progress" | "submitted";

export interface ClinicalAuditSubmission {
  readonly id: string;
  readonly campaignId: string;
  readonly enrollmentId: EnrollmentId;
  readonly status: AuditSubmissionStatus;
  readonly records: readonly AuditRecordEntry[];
  readonly submittedAt?: IsoDateTime;
}

/* Pré/post-tests de connaissances --------------------------------- */

export interface PrePostTest {
  readonly id: string;
  readonly programId: ProgramId;
  readonly phase: AuditPhase;
  readonly title: string;
  readonly questionCount: number;
  readonly outcomeIds: readonly OutcomeId[];
}

export interface PrePostTestResult {
  readonly testId: string;
  readonly enrollmentId: EnrollmentId;
  readonly phase: AuditPhase;
  readonly scorePercent: number;
  readonly takenAt: IsoDateTime;
}

/* Séances : en ligne, visio, présentiel --------------------------- */

export type SessionModality = "self_paced" | "virtual_classroom" | "in_person";

export interface TeachingSession {
  readonly id: string;
  readonly programId: ProgramId;
  readonly cohortId: CohortId;
  readonly title: string;
  readonly modality: SessionModality;
  readonly startsAt: IsoDateTime;
  readonly durationMinutes: number;
  readonly attendanceRequired: boolean;
  readonly attendance: readonly { readonly enrollmentId: EnrollmentId; readonly present: boolean }[];
}

/* ------------------------------------------------------------------ */
/* Logique pure                                                       */
/* ------------------------------------------------------------------ */

/** Un item est-il conforme pour la réponse fournie ? */
export function isItemConform(item: AuditItem, value: AuditAnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (item.kind === "scale" || item.kind === "numeric") {
    const threshold = typeof item.expected === "number" ? item.expected : Number(item.expected);
    return typeof value === "number" && value >= threshold;
  }
  return value === item.expected;
}

export interface AuditScore {
  readonly answeredItems: number;
  readonly expectedItems: number;
  readonly conformWeight: number;
  readonly totalWeight: number;
  readonly conformityPercent: number;
  readonly complete: boolean;
}

const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/** Score d'un dossier audité. */
export function scoreRecord(template: ClinicalAuditTemplate, record: AuditRecordEntry): AuditScore {
  const totalWeight = template.items.reduce((sum, item) => sum + item.weight, 0);
  let conformWeight = 0;
  let answeredItems = 0;
  for (const item of template.items) {
    const value = record.answers[item.id];
    if (value !== undefined) answeredItems += 1;
    if (isItemConform(item, value)) conformWeight += item.weight;
  }
  return {
    answeredItems,
    expectedItems: template.items.length,
    conformWeight,
    totalWeight,
    conformityPercent: percent(conformWeight, totalWeight),
    complete: answeredItems === template.items.length,
  };
}

/** Score d'une soumission : moyenne pondérée sur tous les dossiers saisis. */
export function scoreSubmission(
  template: ClinicalAuditTemplate,
  submission: ClinicalAuditSubmission,
): AuditScore {
  const scores = submission.records.map((r) => scoreRecord(template, r));
  const conformWeight = scores.reduce((s, x) => s + x.conformWeight, 0);
  const totalWeight = scores.reduce((s, x) => s + x.totalWeight, 0);
  return {
    answeredItems: scores.reduce((s, x) => s + x.answeredItems, 0),
    expectedItems: template.items.length * template.recordsPerParticipant,
    conformWeight,
    totalWeight,
    conformityPercent: percent(conformWeight, totalWeight),
    complete:
      submission.records.length >= template.recordsPerParticipant && scores.every((s) => s.complete),
  };
}

export interface PrePostComparison {
  readonly prePercent: number | null;
  readonly postPercent: number | null;
  readonly deltaPoints: number | null;
  readonly meetsTarget: boolean;
  /** Le post-audit n'est pas encore exploitable (campagne non remplie). */
  readonly pending: boolean;
}

/** Comparaison individuelle avant / après formation. */
export function comparePrePost(
  template: ClinicalAuditTemplate,
  pre: ClinicalAuditSubmission | undefined,
  post: ClinicalAuditSubmission | undefined,
): PrePostComparison {
  const preScore = pre && pre.status === "submitted" ? scoreSubmission(template, pre) : undefined;
  const postScore = post && post.status === "submitted" ? scoreSubmission(template, post) : undefined;
  const prePercent = preScore?.conformityPercent ?? null;
  const postPercent = postScore?.conformityPercent ?? null;
  return {
    prePercent,
    postPercent,
    deltaPoints: prePercent !== null && postPercent !== null ? postPercent - prePercent : null,
    meetsTarget: postPercent !== null && postPercent >= template.targetConformityPercent,
    pending: postPercent === null,
  };
}

export interface CampaignAggregate {
  readonly campaignId: string;
  readonly phase: AuditPhase;
  readonly expectedParticipants: number;
  readonly submitted: number;
  readonly inProgress: number;
  readonly participationPercent: number;
  readonly meanConformityPercent: number;
}

/** Agrégat d'une campagne (jamais nominatif dans les vues statistiques). */
export function aggregateCampaign(
  template: ClinicalAuditTemplate,
  campaign: ClinicalAuditCampaign,
  submissions: readonly ClinicalAuditSubmission[],
  expectedParticipants: number,
): CampaignAggregate {
  const scoped = submissions.filter((s) => s.campaignId === campaign.id);
  const submitted = scoped.filter((s) => s.status === "submitted");
  const mean =
    submitted.length === 0
      ? 0
      : Math.round(
          submitted.reduce((sum, s) => sum + scoreSubmission(template, s).conformityPercent, 0) /
            submitted.length,
        );
  return {
    campaignId: campaign.id,
    phase: campaign.phase,
    expectedParticipants,
    submitted: submitted.length,
    inProgress: scoped.filter((s) => s.status === "in_progress").length,
    participationPercent: percent(submitted.length, expectedParticipants),
    meanConformityPercent: mean,
  };
}

export interface ItemConformity {
  readonly item: AuditItem;
  readonly conformityPercent: number;
  readonly recordCount: number;
}

/** Conformité item par item : sert à cibler les messages pédagogiques. */
export function itemConformity(
  template: ClinicalAuditTemplate,
  submissions: readonly ClinicalAuditSubmission[],
): readonly ItemConformity[] {
  const records = submissions.flatMap((s) => s.records);
  return template.items.map((item) => {
    const conform = records.filter((r) => isItemConform(item, r.answers[item.id])).length;
    return {
      item,
      conformityPercent: percent(conform, records.length),
      recordCount: records.length,
    };
  });
}

/** Progression de connaissances : pré-test vs post-test. */
export function testProgress(
  results: readonly PrePostTestResult[],
  enrollmentId: EnrollmentId,
): PrePostComparison {
  const of = (phase: AuditPhase) =>
    results.find((r) => r.enrollmentId === enrollmentId && r.phase === phase)?.scorePercent ?? null;
  const prePercent = of("pre");
  const postPercent = of("post");
  return {
    prePercent,
    postPercent,
    deltaPoints: prePercent !== null && postPercent !== null ? postPercent - prePercent : null,
    meetsTarget: postPercent !== null && postPercent >= 80,
    pending: postPercent === null,
  };
}

export function attendanceRate(session: TeachingSession): number {
  return percent(session.attendance.filter((a) => a.present).length, session.attendance.length);
}

/**
 * Un audit rempli produit une preuve de pratique, JAMAIS l'acquisition
 * automatique d'une compétence réelle : la validation humaine reste requise.
 */
export function auditRequiresHumanValidation(): true {
  return true;
}

export const AUDIT_PHASE_LABELS_FR: Record<AuditPhase, string> = {
  pre: "Avant formation",
  post: "Après formation",
};

export const SESSION_MODALITY_LABELS_FR: Record<SessionModality, string> = {
  self_paced: "En ligne (asynchrone)",
  virtual_classroom: "Visioconférence",
  in_person: "Présentiel",
};

export const AUDIT_SUBMISSION_LABELS_FR: Record<AuditSubmissionStatus, string> = {
  not_started: "À remplir",
  in_progress: "En cours",
  submitted: "Transmis",
};
